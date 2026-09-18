"""Synthetic data generator (SPEC 5.4).

    python -m engine.synth --seed 42 --out data/

Produces, for 5 zones x 40 merchants x 2,000 persons over 56 days from 2026-07-23 00:00 KST:
  zone_hour_sales.csv  zoneId,ts,sales,temp,rain_mm,is_holiday        (5 x 56 x 24 rows)
  payments.csv         ts,payer,merchant,zoneId,amount,is_collusion,ring_type
  transfers.csv        ts,from,to,amount
Three labeled collusion rings are injected: simple_loop, spread, cross. Deterministic per seed."""

from __future__ import annotations

import argparse
import hashlib
import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

KST = timezone(timedelta(hours=9))
START = datetime(2026, 7, 23, 0, 0, tzinfo=KST)
DAYS = 56
HOURS = DAYS * 24
ZERO = "0x" + "00" * 20

ZONES = [
    # id, name, vulnerability, daily base sales (won)
    (1, "동성로", 0.3, 5_000_000),
    (2, "들안길", 0.6, 3_000_000),
    (3, "안지랑", 0.8, 2_000_000),
    (4, "북성로", 1.0, 1_600_000),
    (5, "서문시장", 0.7, 3_500_000),
]
CATEGORY_MEAN = {1: 12_000, 2: 6_000, 3: 20_000, 4: 30_000}  # 식당, 카페, 소매, 서비스
N_MERCHANTS_PER_ZONE = 8
N_PERSONS = 2000
TARGET_COLLUSION_RATIO = 0.04
# Share of normal payments that are legitimately refunded (merchant -> payer transfer within a day).
# Without this, a merchant -> payer edge would be a perfect proxy for the collusion label.
REFUND_RATIO = 0.015
RING_SHARE = {"simple_loop": 0.55, "spread": 0.25, "cross": 0.20}

DOW_FACTOR = [0.90, 0.85, 0.90, 0.95, 1.15, 1.30, 1.10]  # Mon..Sun
HOLIDAYS = {"2026-08-15", "2026-09-16", "2026-09-17", "2026-09-18"}


def hour_curve() -> np.ndarray:
    """Share of a day's demand per hour: peaks at 11-13 and 18-20, near zero at 0-6."""
    h = np.arange(24)
    lunch = np.exp(-0.5 * ((h - 12.0) / 1.2) ** 2)
    dinner = np.exp(-0.5 * ((h - 19.0) / 1.3) ** 2)
    base = np.where((h >= 7) & (h <= 22), 0.25, 0.01)
    c = base + 1.0 * lunch + 1.2 * dinner
    c[h <= 6] = 0.005
    return c / c.sum()


def addr(label: str) -> str:
    return "0x" + hashlib.sha256(label.encode()).hexdigest()[:40]


def round_1000(x: float) -> int:
    return max(1000, int(round(x / 1000.0)) * 1000)


@dataclass
class Merchant:
    address: str
    zone_id: int
    category_id: int
    weight: float


class Synth:
    def __init__(self, seed: int) -> None:
        self.rng = np.random.default_rng(seed)
        self.start_ts = int(START.timestamp())
        self.curve = hour_curve()
        self.merchants: list[Merchant] = []
        for zid, _, _, _ in ZONES:
            for i in range(N_MERCHANTS_PER_ZONE):
                cat = (i % 4) + 1
                self.merchants.append(Merchant(addr(f"merchant-{zid}-{i}"), zid, cat, float(self.rng.gamma(2.0, 1.0))))
        self.persons = [addr(f"person-{i}") for i in range(N_PERSONS)]
        self.person_zone = self.rng.integers(0, len(ZONES), size=N_PERSONS)
        self.payments: list[tuple] = []
        self.transfers: list[tuple] = []

    # ------------------------------------------------------------------ calendar and weather
    def calendar(self) -> pd.DataFrame:
        rows = []
        day_temp = None
        for d in range(DAYS):
            date = START + timedelta(days=d)
            doy = date.timetuple().tm_yday
            season = 26.0 + 6.0 * math.cos((doy - 205) / 365.0 * 2 * math.pi)  # late-July peak
            day_temp = season + float(self.rng.normal(0, 2.5))
            rainy = self.rng.random() < 0.25
            rain_total = float(self.rng.gamma(2.0, 8.0)) if rainy else 0.0
            rain_hours = sorted(self.rng.choice(24, size=int(self.rng.integers(2, 8)), replace=False)) if rainy else []
            is_holiday = int(date.weekday() >= 5 or date.strftime("%Y-%m-%d") in HOLIDAYS)
            for h in range(24):
                temp = day_temp - 4.0 * math.cos((h - 15) / 24.0 * 2 * math.pi) + float(self.rng.normal(0, 0.5))
                rain = rain_total / len(rain_hours) if h in rain_hours else 0.0
                rows.append((d, h, date.weekday(), round(temp, 1), round(rain, 1), is_holiday))
        return pd.DataFrame(rows, columns=["day", "hour", "dow", "temp", "rain_mm", "is_holiday"])

    # ------------------------------------------------------------------ normal demand
    def gen_normal(self, cal: pd.DataFrame) -> None:
        rows = []
        by_zone = {zid: [m for m in self.merchants if m.zone_id == zid] for zid, *_ in ZONES}
        zone_persons = {zi: np.where(self.person_zone == zi)[0] for zi in range(len(ZONES))}
        for zi, (zid, _, _, base) in enumerate(ZONES):
            ms = by_zone[zid]
            w = np.array([m.weight for m in ms])
            w = w / w.sum()
            locals_ = zone_persons[zi]
            for r in cal.itertuples(index=False):
                weather = 1.0
                if r.rain_mm > 5:
                    weather *= 0.7
                if r.temp < 0 or r.temp > 30:
                    weather *= 0.85
                dow = DOW_FACTOR[r.dow] * (1.1 if r.is_holiday and r.dow < 5 else 1.0)
                noise = float(self.rng.lognormal(0, 0.15))
                demand = base * dow * self.curve[r.hour] * weather * noise
                hour_ts = self.start_ts + (r.day * 24 + r.hour) * 3600
                for mi, m in enumerate(ms):
                    target = demand * w[mi]
                    mean = CATEGORY_MEAN[m.category_id]
                    n = int(self.rng.poisson(target / mean))
                    if n == 0:
                        continue
                    amounts = self.rng.lognormal(math.log(mean) - 0.125, 0.5, size=n)
                    # 80% locals, 20% visitors from any zone
                    payer_idx = np.where(
                        self.rng.random(n) < 0.8,
                        self.rng.choice(locals_, size=n),
                        self.rng.integers(0, N_PERSONS, size=n),
                    )
                    offsets = self.rng.integers(0, 3600, size=n)
                    refunds = self.rng.random(n) < REFUND_RATIO
                    for k in range(n):
                        ts = hour_ts + int(offsets[k])
                        payer = self.persons[int(payer_idx[k])]
                        amount = round_1000(amounts[k])
                        rows.append((ts, payer, m.address, zid, amount, 0, ""))
                        if refunds[k]:
                            self.transfers.append((ts + int(self.rng.integers(3600, 86400)), m.address, payer, amount))
        self.payments.extend(rows)

    # ------------------------------------------------------------------ rings
    def _register(self, wallet: str, ring_start_ts: int) -> None:
        reg = ring_start_ts - int(self.rng.integers(0, 24 * 3600))
        self.transfers.append((reg, ZERO, wallet, 1_000_000))

    def gen_rings(self, target_total: int) -> None:
        """Injects ring instances of each type until the per-type payment budget is met."""
        budget = {k: int(target_total * v) for k, v in RING_SHARE.items()}
        # Colluding merchants are drawn from a fixed subset so most merchants stay clean.
        pool = [self.merchants[i] for i in sorted(self.rng.choice(len(self.merchants), size=14, replace=False))]

        def pick_merchant() -> Merchant:
            return pool[int(self.rng.integers(0, len(pool)))]

        count = 0
        inst = 0
        while count < budget["simple_loop"]:
            count += self._ring_simple_loop(inst, pick_merchant(), budget["simple_loop"] - count)
            inst += 1
        count, inst = 0, 0
        while count < budget["spread"]:
            count += self._ring_spread(inst, pick_merchant(), budget["spread"] - count)
            inst += 1
        count, inst = 0, 0
        while count < budget["cross"]:
            ma = pick_merchant()
            mb = pick_merchant()
            while mb.address == ma.address:
                mb = pick_merchant()
            count += self._ring_cross(inst, ma, mb, budget["cross"] - count)
            inst += 1

    def _ring_simple_loop(self, inst: int, m: Merchant, remaining: int) -> int:
        """One pair paying 2-4 times a day; the merchant refunds 90-100% 10-60 min later (1 hop)."""
        payer = addr(f"ring-loop-{inst}")
        day0 = int(self.rng.integers(2, 25))
        start_ts = self.start_ts + day0 * 86400 + 9 * 3600
        self._register(payer, start_ts)
        count, d = 0, day0
        while count < remaining and d < DAYS:
            k = int(self.rng.integers(2, 5))
            for h in sorted(self.rng.choice(np.arange(9, 22), size=k, replace=False)):
                if count >= remaining:
                    break
                ts = self.start_ts + d * 86400 + int(h) * 3600 + int(self.rng.integers(0, 3600))
                amount = round_1000(float(self.rng.lognormal(math.log(CATEGORY_MEAN[m.category_id] * 1.5), 0.3)))
                self.payments.append((ts, payer, m.address, m.zone_id, amount, 1, "simple_loop"))
                back = ts + int(self.rng.integers(600, 3600))
                self.transfers.append((back, m.address, payer, int(amount * float(self.rng.uniform(0.9, 1.0)))))
                count += 1
            d += 1
        return count

    def _ring_spread(self, inst: int, m: Merchant, remaining: int) -> int:
        """8 wallets pay one merchant within an hour; the merchant refunds via one mule (2 hops)."""
        wallets = [addr(f"ring-spread-{inst}-{i}") for i in range(8)]
        mule = addr(f"ring-spread-mule-{inst}")
        day0 = int(self.rng.integers(3, 25))
        start_ts = self.start_ts + day0 * 86400 + 10 * 3600
        for wlt in wallets + [mule]:
            self._register(wlt, start_ts)
        count, d = 0, day0
        while count < remaining and d < DAYS:
            h = int(self.rng.integers(10, 21))
            base_ts = self.start_ts + d * 86400 + h * 3600
            total = 0
            for wlt in wallets:
                if count >= remaining:
                    break
                ts = base_ts + int(self.rng.integers(0, 3600))
                amount = round_1000(float(self.rng.lognormal(math.log(CATEGORY_MEAN[m.category_id] * 1.2), 0.3)))
                self.payments.append((ts, wlt, m.address, m.zone_id, amount, 1, "spread"))
                total += amount
                count += 1
            t1 = base_ts + 3600 + int(self.rng.integers(300, 1800))
            self.transfers.append((t1, m.address, mule, int(total * 0.95)))
            share = int(total * 0.95 / len(wallets))
            for i, wlt in enumerate(wallets):
                self.transfers.append((t1 + 60 * (i + 1), mule, wlt, share))
            d += int(self.rng.integers(1, 3))
        return count

    def _ring_cross(self, inst: int, ma: Merchant, mb: Merchant, remaining: int) -> int:
        """Two merchants with four friends each. Friends of A pay B; B settles to A, A pays a mule,
        the mule pays the friends (3-hop backflow B -> A -> mule -> friend), and symmetrically."""
        fa = [addr(f"ring-cross-{inst}-a-{i}") for i in range(4)]
        fb = [addr(f"ring-cross-{inst}-b-{i}") for i in range(4)]
        mule_a, mule_b = addr(f"ring-cross-mule-{inst}-a"), addr(f"ring-cross-mule-{inst}-b")
        day0 = int(self.rng.integers(5, 30))
        start_ts = self.start_ts + day0 * 86400 + 11 * 3600
        for wlt in fa + fb + [mule_a, mule_b]:
            self._register(wlt, start_ts)
        count, d = 0, day0
        while count < remaining and d < DAYS:
            for friends, payee, settle_to, mule in ((fa, mb, ma, mule_a), (fb, ma, mb, mule_b)):
                h = int(self.rng.integers(10, 21))
                base_ts = self.start_ts + d * 86400 + h * 3600
                total = 0
                for wlt in friends:
                    if count >= remaining:
                        break
                    ts = base_ts + int(self.rng.integers(0, 3600))
                    amount = round_1000(float(self.rng.lognormal(math.log(CATEGORY_MEAN[payee.category_id] * 1.3), 0.3)))
                    self.payments.append((ts, wlt, payee.address, payee.zone_id, amount, 1, "cross"))
                    total += amount
                    count += 1
                if total == 0:
                    continue
                t1 = base_ts + 3600 + int(self.rng.integers(300, 1200))
                self.transfers.append((t1, payee.address, settle_to.address, int(total * 0.97)))
                self.transfers.append((t1 + 900, settle_to.address, mule, int(total * 0.95)))
                share = int(total * 0.95 / len(friends))
                for i, wlt in enumerate(friends):
                    self.transfers.append((t1 + 1800 + 60 * i, mule, wlt, share))
            d += int(self.rng.integers(1, 3))
        return count

    # ------------------------------------------------------------------ assembly
    def person_mints(self, payments: pd.DataFrame) -> None:
        """Every regular person is minted by the bank before their first payment: 20% within 24h of
        it (new users start paying right away), the rest 1-30 days earlier. Without this, wallet age
        would separate rings from regulars by construction (train/serve mismatch: demo wallets are
        minutes old)."""
        first = payments[payments["is_collusion"] == 0].groupby("payer")["ts"].min()
        for payer, ts in first.sort_index().items():
            if self.rng.random() < 0.2:
                lead = int(self.rng.integers(60, 24 * 3600))
            else:
                lead = int(self.rng.integers(86400, 30 * 86400))
            self.transfers.append((int(ts) - lead, ZERO, payer, 1_000_000))

    def zone_hour_sales(self, cal: pd.DataFrame, payments: pd.DataFrame) -> pd.DataFrame:
        payments = payments.assign(hour_idx=(payments["ts"] - self.start_ts) // 3600)
        sales = payments.groupby(["zoneId", "hour_idx"])["amount"].sum()
        rows = []
        for zid, *_ in ZONES:
            for r in cal.itertuples(index=False):
                idx = r.day * 24 + r.hour
                rows.append((zid, self.start_ts + idx * 3600, int(sales.get((zid, idx), 0)), r.temp, r.rain_mm, r.is_holiday))
        return pd.DataFrame(rows, columns=["zoneId", "ts", "sales", "temp", "rain_mm", "is_holiday"])

    def run(self, out: Path) -> None:
        t0 = time.time()
        cal = self.calendar()
        self.gen_normal(cal)
        n_normal = len(self.payments)
        self.gen_rings(int(round(n_normal * TARGET_COLLUSION_RATIO / (1 - TARGET_COLLUSION_RATIO))))

        payments = pd.DataFrame(self.payments, columns=["ts", "payer", "merchant", "zoneId", "amount", "is_collusion", "ring_type"])
        payments = payments.sort_values(["ts", "payer", "merchant"], kind="mergesort").reset_index(drop=True)
        self.person_mints(payments)
        # Every payment is a payer -> merchant token transfer.
        pay_tr = payments[["ts", "payer", "merchant", "amount"]].rename(columns={"payer": "from", "merchant": "to"})
        extra_tr = pd.DataFrame(self.transfers, columns=["ts", "from", "to", "amount"])
        transfers = pd.concat([pay_tr, extra_tr], ignore_index=True)
        transfers = transfers.sort_values(["ts", "from", "to"], kind="mergesort").reset_index(drop=True)
        zhs = self.zone_hour_sales(cal, payments)

        out.mkdir(parents=True, exist_ok=True)
        zhs.to_csv(out / "zone_hour_sales.csv", index=False, float_format="%.1f")
        payments.to_csv(out / "payments.csv", index=False)
        transfers.to_csv(out / "transfers.csv", index=False)

        ratio = payments["is_collusion"].mean()
        print(f"rows: zone_hour_sales={len(zhs)} payments={len(payments)} transfers={len(transfers)}")
        print(f"collusion ratio: {ratio:.4f} ({int(payments['is_collusion'].sum())} of {len(payments)})")
        print("ring_type counts:", payments[payments["is_collusion"] == 1]["ring_type"].value_counts().sort_index().to_dict())
        daily = zhs.groupby("zoneId")["sales"].sum() / DAYS
        names = {z[0]: z[1] for z in ZONES}
        print("zone daily average sales:", {f"{k} {names[k]}": int(v) for k, v in daily.items()})
        print(f"done in {time.time() - t0:.1f}s -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=Path, default=Path("data"))
    args = ap.parse_args()
    Synth(args.seed).run(args.out)


if __name__ == "__main__":
    main()
