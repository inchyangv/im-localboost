"""Multinomial-logit consumer simulation across five bonus scenarios (SPEC 6).

    python -m sim.run --seed 7 --days 28 --consumers 5000

Scenarios: none (no bonus), A (flat 1000 bps), B (dynamic rate from engine.boost.compute_bps with k
bisected so total boost matches A within 5%), C_on / C_off (B plus collusion rings, defense on/off).
Common random numbers: every consumer x day x slot draws its Gumbel noise and amount once and reuses
them in all scenarios. Results are written as they come out; nothing is post-processed."""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from engine import db
from engine.boost import compute_bps
from engine.rules import evaluate_rules
from sim.caps import PER_TX_BOOST, CapState
from sim.metrics import METRIC_DEFINITIONS, summarize

ZONES = [(1, "동성로", 0.3), (2, "들안길", 0.6), (3, "안지랑", 0.8), (4, "북성로", 1.0), (5, "서문시장", 0.7)]
N_ZONES = len(ZONES)
MERCHANTS_PER_ZONE = 8
SLOTS = list(range(8, 22))  # 14 hourly slots, 08:00-21:00 KST
N_SLOTS = len(SLOTS)
KST = 9 * 3600
START_TS = 1_789_570_800  # 2026-09-17 00:00 KST, arbitrary anchor
NO_BUY = 0
FLAT_BPS = 1000
MEAN_AMOUNT = 12_000
OUT_DIR = Path(__file__).resolve().parent / "out"


def round_1000(x: np.ndarray) -> np.ndarray:
    return np.maximum(1000, np.round(x / 1000.0).astype(np.int64) * 1000)


class World:
    """Consumers, merchants and the common random numbers shared by all scenarios."""

    def __init__(self, seed: int, days: int, consumers: int) -> None:
        self.rng = np.random.default_rng(seed)
        self.days = days
        self.n = consumers
        rng = self.rng
        self.home = rng.integers(0, N_ZONES, size=consumers)
        self.pref = rng.normal(0.0, 1.0, size=(consumers, N_ZONES))
        self.travel = rng.uniform(0.5, 2.0, size=(consumers, N_ZONES))
        self.travel[np.arange(consumers), self.home] = 0.0
        self.sensitivity = rng.uniform(0.5, 3.0, size=consumers)
        # Slot constant for "no purchase" so that a consumer buys roughly once a day.
        peak = np.array([0.0 if h in (12, 13, 18, 19) else -0.5 for h in SLOTS])
        self.no_buy_const = 2.6 - peak
        # Common random numbers: Gumbel noise per consumer x day x slot x option, and amounts.
        self.gumbel = rng.gumbel(0.0, 1.0, size=(days, N_SLOTS, consumers, N_ZONES + 1)).astype(np.float32)
        self.amount = round_1000(rng.lognormal(math.log(MEAN_AMOUNT) - 0.125, 0.5, size=(days, N_SLOTS, consumers)))
        self.merchant_pick = rng.integers(0, MERCHANTS_PER_ZONE, size=(days, N_SLOTS, consumers))
        self.order = np.argsort(rng.random(size=(days, N_SLOTS, consumers)), axis=2)
        self.second_offset = rng.integers(0, 3600, size=(days, N_SLOTS, consumers))
        self.mint_ts = START_TS - rng.integers(1, 30, size=consumers) * 86400

    @staticmethod
    def merchant_id(zone_idx: int, m: int) -> int:
        return zone_idx * MERCHANTS_PER_ZONE + m

    def slot_ts(self, day: int, slot_idx: int) -> int:
        return START_TS + day * 86400 + (SLOTS[slot_idx] - 9) * 3600  # KST hour -> UTC ts

    def choices(self, benefit: np.ndarray) -> np.ndarray:
        """benefit[day, slot, zone] as a rate (bps/10000). Returns choice[day, slot, consumer]
        with 0 = no purchase, 1..5 = zone id."""
        days, slots, n = self.days, N_SLOTS, self.n
        out = np.zeros((days, slots, n), dtype=np.int8)
        base = self.pref - self.travel  # (n, zones)
        for d in range(days):
            for s in range(slots):
                u = np.empty((n, N_ZONES + 1), dtype=np.float32)
                u[:, 0] = self.no_buy_const[s]
                u[:, 1:] = base + self.sensitivity[:, None] * benefit[d, s][None, :]
                u += self.gumbel[d, s]
                out[d, s] = np.argmax(u, axis=1)
        return out


# ----------------------------------------------------------------------------- rings
class Rings:
    """simple_loop x5, spread x1 (8 wallets + mule), cross x1 (4+4 friends, 2 mules)."""

    def __init__(self, world: World) -> None:
        rng = world.rng
        self.world = world
        base = world.n + 1000
        self.loop_pairs = [(base + i, World.merchant_id(int(rng.integers(0, N_ZONES)), int(rng.integers(0, MERCHANTS_PER_ZONE)))) for i in range(5)]
        self.spread_wallets = [base + 100 + i for i in range(8)]
        self.spread_mule = base + 150
        self.spread_merchant = World.merchant_id(int(rng.integers(0, N_ZONES)), int(rng.integers(0, MERCHANTS_PER_ZONE)))
        self.cross_a = [base + 200 + i for i in range(4)]
        self.cross_b = [base + 210 + i for i in range(4)]
        self.cross_mule_a, self.cross_mule_b = base + 220, base + 221
        za, zb = rng.choice(N_ZONES, size=2, replace=False)
        self.cross_ma = World.merchant_id(int(za), int(rng.integers(0, MERCHANTS_PER_ZONE)))
        self.cross_mb = World.merchant_id(int(zb), int(rng.integers(0, MERCHANTS_PER_ZONE)))
        self.start_day = int(rng.integers(2, 6))
        self.wallets = [p for p, _ in self.loop_pairs] + self.spread_wallets + [self.spread_mule] + self.cross_a + self.cross_b + [self.cross_mule_a, self.cross_mule_b]
        self.mint_ts = {w: world.slot_ts(self.start_day, 0) - int(rng.integers(0, 24 * 3600)) for w in self.wallets}
        # Pre-drawn ring schedule: list of (ts, payer, merchant, amount, refund_plan) sorted by ts
        events: list[tuple[int, int, int, int, list[tuple[int, int, int, int]]]] = []
        for d in range(self.start_day, world.days):
            for payer, merchant in self.loop_pairs:
                for s in sorted(rng.choice(N_SLOTS, size=int(rng.integers(2, 5)), replace=False)):
                    ts = world.slot_ts(d, int(s)) + int(rng.integers(0, 3600))
                    amount = int(round_1000(np.array([rng.lognormal(math.log(15_000), 0.3)]))[0])
                    back = ts + int(rng.integers(600, 3600))
                    events.append((ts, payer, merchant, amount, [(back, merchant, payer, int(amount * rng.uniform(0.9, 1.0)))]))
            if d % 2 == 0:
                s = int(rng.integers(2, N_SLOTS))
                base_ts = world.slot_ts(d, s)
                total = 0
                group: list[tuple[int, int, int, int, list]] = []
                for w in self.spread_wallets:
                    ts = base_ts + int(rng.integers(0, 3600))
                    amount = int(round_1000(np.array([rng.lognormal(math.log(12_000), 0.3)]))[0])
                    total += amount
                    group.append((ts, w, self.spread_merchant, amount, []))
                t1 = base_ts + 3600 + int(rng.integers(300, 1800))
                plan = [(t1, self.spread_merchant, self.spread_mule, int(total * 0.95))] + [(t1 + 60 * (i + 1), self.spread_mule, w, int(total * 0.95 / 8)) for i, w in enumerate(self.spread_wallets)]
                group[-1] = (*group[-1][:4], plan)
                events.extend(group)
            if d % 2 == 1:
                for friends, payee, settle_to, mule in ((self.cross_a, self.cross_mb, self.cross_ma, self.cross_mule_a), (self.cross_b, self.cross_ma, self.cross_mb, self.cross_mule_b)):
                    s = int(rng.integers(2, N_SLOTS))
                    base_ts = world.slot_ts(d, s)
                    total = 0
                    group = []
                    for w in friends:
                        ts = base_ts + int(rng.integers(0, 3600))
                        amount = int(round_1000(np.array([rng.lognormal(math.log(15_000), 0.3)]))[0])
                        total += amount
                        group.append((ts, w, payee, amount, []))
                    t1 = base_ts + 3600 + int(rng.integers(300, 1200))
                    plan = [(t1, payee, settle_to, int(total * 0.97)), (t1 + 900, settle_to, mule, int(total * 0.95))] + [(t1 + 1800 + 60 * i, mule, w, int(total * 0.95 / 4)) for i, w in enumerate(friends)]
                    group[-1] = (*group[-1][:4], plan)
                    events.extend(group)
        self.events = sorted(events, key=lambda e: (e[0], e[1]))


# ----------------------------------------------------------------------------- scenario runner
def addr(i: int) -> str:
    return f"0x{i:040x}"


class Runner:
    def __init__(self, world: World, baseline: dict[tuple[int, int], int], merchant_baseline: dict[int, int]) -> None:
        self.world = world
        self.baseline = baseline  # (zone_idx, slot_idx) -> expected sales (for slack)
        self.merchant_baseline = merchant_baseline  # merchant_id -> slot baseline

    def rates(self, kind: str, k: float) -> np.ndarray:
        w = self.world
        r = np.zeros((w.days, N_SLOTS, N_ZONES), dtype=np.float64)
        if kind == "none":
            return r
        if kind == "A":
            r[:] = FLAT_BPS / 10000
            return r
        for zi, (_, _, vuln) in enumerate(ZONES):
            for s in range(N_SLOTS):
                exp_sales, base = self.baseline[(zi, s)]
                slack = 0.0 if base <= 0 else max(0.0, 1.0 - exp_sales / base)
                r[:, s, zi] = compute_bps(slack, vuln, k) / 10000
        return r

    def run(self, kind: str, k: float, rings: Rings | None = None, defense: bool = False) -> pd.DataFrame:
        w = self.world
        rate = self.rates("B" if kind.startswith("C") else kind, k)
        choice = w.choices(rate)
        caps = CapState()
        conn: sqlite3.Connection | None = None
        if defense:
            conn = db.connect(":memory:")
            conn.executemany(
                "INSERT INTO transfers VALUES (?,?,?,?,?,?,?)",
                [(f"0xm{i}", 0, 0, int(w.mint_ts[i]), addr(0), addr(i), 1_000_000) for i in range(w.n)],
            )
            if rings:
                conn.executemany(
                    "INSERT INTO transfers VALUES (?,?,?,?,?,?,?)",
                    [(f"0xmr{wl}", 0, 0, int(ts), addr(0), addr(wl), 1_000_000) for wl, ts in rings.mint_ts.items()],
                )
            conn.commit()
        rows: list[tuple] = []
        pending_transfers: list[tuple[int, int, int, int]] = []  # (ts, from, to, amount) from ring refunds
        ring_events = list(rings.events) if rings else []
        ri = 0
        seq = 0

        def flush_transfers(upto: int) -> None:
            nonlocal pending_transfers
            if conn is None:
                pending_transfers = [t for t in pending_transfers if t[0] > upto]
                return
            due = [t for t in pending_transfers if t[0] <= upto]
            if due:
                conn.executemany(
                    "INSERT INTO transfers VALUES (?,?,?,?,?,?,?)",
                    [(f"0xr{ts}-{a}-{b}", 0, 0, ts, addr(a), addr(b), amt) for ts, a, b, amt in due],
                )
                pending_transfers = [t for t in pending_transfers if t[0] > upto]

        def settle(ts: int, person: int, merchant: int, zone_idx: int, amount: int, day: int, slot: int, is_ring: int) -> None:
            nonlocal seq
            rate_bps = int(round(rate[day, slot, zone_idx] * 10000))
            tier = 0
            if conn is not None:
                flush_transfers(ts)
                ctx = {"rate_bps": rate_bps, "per_tx_boost": PER_TX_BOOST, "slot_baseline": self.merchant_baseline[merchant]}
                tier, _ = evaluate_rules(conn, addr(person), addr(merchant), amount, ts, ctx)
            hour_epoch = ts // 3600
            boost = caps.compute(person, merchant, amount, rate_bps, day, hour_epoch, self.merchant_baseline[merchant])
            if tier >= 1:
                boost = 0  # defense on: tier 1 is withheld and later clawed back, tier 2 blocked
            caps.apply(person, merchant, amount, boost, day, hour_epoch, 0 if tier == 0 else 2)
            rows.append((ts, person, merchant, zone_idx + 1, day, slot, amount, boost, tier, is_ring))
            if conn is not None:
                conn.execute(
                    "INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (f"0xp{seq}", 0, seq, ts, addr(person), addr(person), addr(merchant), zone_idx + 1, amount, 0, boost, tier, 0),
                )
                conn.execute(
                    "INSERT INTO transfers VALUES (?,?,?,?,?,?,?)",
                    (f"0xpt{seq}", 0, seq, ts, addr(person), addr(merchant), amount),
                )
            seq += 1

        for d in range(w.days):
            for s in range(N_SLOTS):
                slot_start = w.slot_ts(d, s)
                buyers = np.nonzero(choice[d, s])[0]
                buyers = buyers[np.argsort(w.order[d, s, buyers], kind="stable")]
                for c in buyers:
                    ts = slot_start + int(w.second_offset[d, s, c])
                    # interleave ring events that happen before this payment
                    while ri < len(ring_events) and ring_events[ri][0] <= ts:
                        ev = ring_events[ri]
                        ri += 1
                        mz = ev[2] // MERCHANTS_PER_ZONE
                        settle(ev[0], ev[1], ev[2], mz, ev[3], d, s, 1)
                        pending_transfers.extend(ev[4])
                    zi = int(choice[d, s, c]) - 1
                    merchant = World.merchant_id(zi, int(w.merchant_pick[d, s, c]))
                    settle(ts, int(c), merchant, zi, int(w.amount[d, s, c]), d, s, 0)
                if conn is not None and s == N_SLOTS - 1:
                    conn.commit()
        while ri < len(ring_events):
            ev = ring_events[ri]
            ri += 1
            mz = ev[2] // MERCHANTS_PER_ZONE
            d = (ev[0] - START_TS) // 86400
            settle(ev[0], ev[1], ev[2], mz, ev[3], int(d), N_SLOTS - 1, 1)
        if conn is not None:
            conn.close()
        return pd.DataFrame(rows, columns=["ts", "person", "merchant", "zone", "day", "slot", "amount", "boost", "tier", "ring"])


def expected_and_baseline(none_df: pd.DataFrame, days: int) -> tuple[dict[tuple[int, int], tuple[float, int]], dict[int, int]]:
    """Per (zone, slot): (mean sales over days, top-25% mean over days). Per merchant: 75th percentile
    of its hourly sales (slot baseline for the cap and the rules)."""
    cells = none_df.groupby(["zone", "slot", "day"])["amount"].sum()
    out: dict[tuple[int, int], tuple[float, int]] = {}
    for zi in range(N_ZONES):
        for s in range(N_SLOTS):
            try:
                vals = cells.loc[(zi + 1, s)].reindex(range(days)).fillna(0).to_numpy(dtype=float)
            except KeyError:
                vals = np.zeros(days)
            top = np.sort(vals)[::-1][: max(1, int(math.ceil(len(vals) * 0.25)))]
            out[(zi, s)] = (float(vals.mean()), int(round(float(top.mean()))))
    hourly = none_df.assign(h=none_df["ts"] // 3600).groupby(["merchant", "h"])["amount"].sum()
    mb: dict[int, int] = {}
    for m in range(N_ZONES * MERCHANTS_PER_ZONE):
        try:
            mb[m] = int(np.percentile(hourly.loc[m].to_numpy(dtype=float), 75))
        except KeyError:
            mb[m] = 0
    return out, mb


def bisect_k(runner: Runner, target_boost: int, lo: float = 0.0, hi: float = 8.0, tol: float = 0.05, iters: int = 20) -> tuple[float, pd.DataFrame]:
    """Finds k so that scenario B's total boost is within +-tol of `target_boost`."""
    best_k, best_df = hi, runner.run("B", hi)
    if int(best_df["boost"].sum()) < target_boost * (1 - tol):
        print(f"  B at k={hi}: boost {int(best_df['boost'].sum())} < target {target_boost}; using k={hi}")
        return best_k, best_df
    for _ in range(iters):
        mid = (lo + hi) / 2
        df = runner.run("B", mid)
        total = int(df["boost"].sum())
        best_k, best_df = mid, df
        if abs(total - target_boost) <= tol * target_boost:
            break
        if total < target_boost:
            lo = mid
        else:
            hi = mid
    return best_k, best_df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--consumers", type=int, default=5000)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()
    t0 = time.time()

    world = World(args.seed, args.days, args.consumers)
    bootstrap = Runner(world, {}, {m: 0 for m in range(N_ZONES * MERCHANTS_PER_ZONE)})
    none_df = bootstrap.run("none", 0.0)
    baseline, merchant_baseline = expected_and_baseline(none_df, args.days)
    runner = Runner(world, baseline, merchant_baseline)
    none_df = runner.run("none", 0.0)
    print(f"none: {len(none_df)} payments, sales {int(none_df['amount'].sum()):,} ({time.time() - t0:.0f}s)")

    a_df = runner.run("A", 0.0)
    print(f"A: boost {int(a_df['boost'].sum()):,} ({time.time() - t0:.0f}s)")
    k, b_df = bisect_k(runner, int(a_df["boost"].sum()))
    print(f"B: k={k:.4f} boost {int(b_df['boost'].sum()):,} ({time.time() - t0:.0f}s)")
    rings = Rings(world)
    c_off = runner.run("C_off", k, rings, defense=False)
    print(f"C_off: {int(c_off['ring'].sum())} ring payments ({time.time() - t0:.0f}s)")
    c_on = runner.run("C_on", k, rings, defense=True)
    print(f"C_on: flagged {int((c_on['tier'] >= 1).sum())} of {len(c_on)} ({time.time() - t0:.0f}s)")

    frames = {"none": none_df, "A": a_df, "B": b_df, "C_on": c_on, "C_off": c_off}
    ks = {"none": None, "A": None, "B": k, "C_on": k, "C_off": k}
    scenarios = {name: summarize(name, none_df, df, ks[name]) for name, df in frames.items()}
    results = {
        "meta": {"seed": args.seed, "days": args.days, "consumers": args.consumers, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
        "definitions": METRIC_DEFINITIONS,
        "scenarios": scenarios,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    with (args.out / "results.json").open("w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=2, ensure_ascii=False)
    plot(scenarios, args.out / "compare.png")

    cols = ["vulnerable_slot_sales_uplift", "net_sales_per_won", "deadweight_ratio", "farming_leakage", "detection_precision", "detection_recall", "total_sales", "total_boost", "k"]
    print("\n" + "metric".ljust(30) + "".join(n.rjust(14) for n in frames))
    for c in cols:
        line = c.ljust(30)
        for n in frames:
            v = scenarios[n][c]
            line += (f"{v:,}" if isinstance(v, int) else "null" if v is None else f"{v:.4f}").rjust(14)
        print(line)
    print(f"\nwrote {args.out / 'results.json'} and compare.png in {time.time() - t0:.0f}s")


def plot(scenarios: dict[str, dict[str, Any]], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    metrics = list(METRIC_DEFINITIONS)
    names = list(scenarios)
    fig, axes = plt.subplots(2, 3, figsize=(13, 7))
    for ax, m in zip(axes.flat, metrics):
        vals = [scenarios[n][m] if scenarios[n][m] is not None else 0.0 for n in names]
        bars = ax.bar(names, vals)
        for b, n in zip(bars, names):
            if scenarios[n][m] is None:
                b.set_hatch("//")
                b.set_alpha(0.3)
        ax.set_title(m)
        ax.tick_params(axis="x", labelsize=8)
    fig.suptitle("달구벌페이 simulation (hatched = not applicable)")
    fig.tight_layout()
    fig.savefig(path, dpi=110)


if __name__ == "__main__":
    main()
