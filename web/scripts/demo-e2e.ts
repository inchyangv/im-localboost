/**
 * Headless demo scenario (SPEC 11 steps 1-5) using the web app's own library code.
 * Use it when no browser is available, or as a smoke test before a live demo.
 *
 *   cd web && npx tsx --env-file=.env.local scripts/demo-e2e.ts
 *   ENV_FILE=.env.kairos ENGINE_URL=https://<engine> ... (production: set NEXT_PUBLIC_* accordingly)
 *
 * Preconditions: fresh seed (zone 4 budget 0, no payments today) so that step 2 earns a bonus.
 */
import * as path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", "..", process.env.ENV_FILE ?? ".env"), override: false, quiet: true });
if (process.env.ENGINE_URL) process.env.NEXT_PUBLIC_ENGINE_URL = process.env.ENGINE_URL;

// Minimal sessionStorage so pay.ts can remember the last signature outside a browser.
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
};

async function main() {
  const { publicClient } = await import("../src/lib/chain");
  const { addresses, dalgubeolPayAbi, readBoostState, tokenAbi } = await import("../src/lib/contracts");
  const { merchants, zoneName } = await import("../src/lib/config");
  const city = await import("../src/lib/city");
  const { ratesPublish, riskLog } = await import("../src/lib/engine");
  const { runPayFlow } = await import("../src/lib/pay");
  const { zeroBoostReason } = await import("../src/lib/reasons");
  const { runCollusionRing, replayLastSignature } = await import("../src/lib/demo");
  const { personas } = await import("../src/lib/personas");

  const log = (l: string) => console.log("   " + l);
  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const cityAcc = personas.find((p) => p.id === "city")!.account;
  const bankAcc = personas.find((p) => p.id === "bank")!.account;
  const consumer1 = personas.find((p) => p.id === "payer-1")!.account;
  const m1 = merchants[0];
  const m2 = merchants[1];
  const bal = async (a: `0x${string}`) => (await publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [a] })) as bigint;
  const rate = async (z: number) => Number(await publicClient.readContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName: "currentRate", args: [z] }));
  const budget = async (z: number) => (await publicClient.readContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName: "zoneBudget", args: [z] })) as bigint;

  console.log("step 1: /city deposit into 북성로 and publish rates (북성로 10% fixed)");
  const b0 = await budget(4);
  if (b0 === 0n) await city.depositBudget(cityAcc, 4, 500_000n, log);
  const pub = await ratesPublish({ "4": 1000 });
  check("북성로 rate 10.0%", (await rate(4)) === 1000 && pub.rates.find((r) => r.zoneId === 4)?.bps === 1000, `tx ${pub.txHash.slice(0, 10)}`);

  console.log("step 2: consumer 1 pays 북성로 식당 10,000");
  const m1Before = await bal(m1.address);
  const creditBefore = (await readBoostState(consumer1.address, m1.address, m1.zoneId)).credit;
  const r2 = await runPayFlow(consumer1, m1.address, 10_000, 0, log);
  const st2 = await readBoostState(consumer1.address, m1.address, m1.zoneId);
  check("credit +1,000, merchant +10,000, tier 0", r2.paid?.boost === 1000n && st2.credit - creditBefore === 1000n && (await bal(m1.address)) - m1Before === 10_000n && r2.attest.tier === 0, `boost=${r2.paid?.boost} tier=${r2.attest.tier} tx=${r2.hash.slice(0, 10)}`);

  console.log("step 3: same consumer pays the same merchant again");
  const r3 = await runPayFlow(consumer1, m1.address, 10_000, 0, log);
  const st3 = await readBoostState(consumer1.address, m1.address, m1.zoneId);
  const reason = zeroBoostReason({ state: st3, amount: 10_000n, useCredit: 0n, tier: r3.attest.tier, engineReasons: r3.attest.reasons });
  check("success, boost 0, reason 오늘 이미 보너스를 받은 가게", r3.paid?.boost === 0n && reason === "오늘 이미 보너스를 받은 가게", `reason=${reason}`);

  console.log("step 4: /city 담합 링 실행");
  const b2Before = await budget(2);
  const results = await runCollusionRing(log);
  const flagged = results.filter((r) => (r.tier ?? 0) >= 1 && (r.reasons ?? []).includes("backflow"));
  const tier1 = results.filter((r) => r.tier === 1 && (r.pendingId ?? 0n) > 0n);
  const tier2 = results.filter((r) => r.tier === 2);
  const risk = await riskLog(20);
  const riskBackflow = risk.filter((r) => r.tier >= 1 && r.reasons.includes("backflow"));
  check("risk log: >=3 entries tier>=1 with 환류", flagged.length >= 3 && riskBackflow.length >= 3, `flagged=${flagged.length} riskLog=${riskBackflow.length} tiers=${results.map((r) => r.tier ?? "-").join(",")}`);
  const pend = await city.listPending(true);
  check("tier 1 results have pending rows; tier 2 results have boost 0", tier1.every((r) => pend.some((p) => p.id === r.pendingId)) && tier2.every((r) => r.boost === 0n), `pending=${tier1.length} blocked=${tier2.length}`);
  if (tier1.length > 0) {
    const before = await budget(2);
    let sum = 0n;
    for (const r of tier1) {
      await city.clawbackPending(bankAcc, r.pendingId!);
      sum += r.boost ?? 0n;
    }
    const after = await budget(2);
    check("bank clawback restores 들안길 budget by the boost sum", after === before + sum, `${before} -> ${after} (+${sum})`);
  } else {
    const spent = b2Before - (await budget(2));
    const consumer1Boost = results[0]?.boost ?? 0n;
    check("no pending (all blocked): 들안길 budget only spent by consumer 1's normal bonus", spent === consumer1Boost, `spent=${spent} consumer1Boost=${consumer1Boost}`);
    console.log("   note: pending -> clawback path is exercised by verify-city.ts (tier 1 attestation) and demo-pay.ts TIER=1");
  }

  console.log("step 5: /city 서명 재사용 공격");
  const rep = await replayLastSignature(log);
  check("replay reverts with NonceUsed", rep.ok && rep.errorName === "NonceUsed" && rep.message.includes("이미 사용된 서명"), `${rep.errorName}: ${rep.message}`);

  console.log(`zones: ${merchants.slice(0, 2).map((m) => `${m.name}@${zoneName(m.zoneId)}`).join(", ")}`);
  console.log(failures ? `${failures} check(s) failed` : "demo-e2e passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
