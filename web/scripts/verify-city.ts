/**
 * Headless verification of the city page flows (T-17) using the page's own lib code.
 *   cd web && npx tsx --env-file=.env.local scripts/verify-city.ts
 */
import * as path from "path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "..", "..", ".env"), override: false, quiet: true });

async function main() {
  const { publicClient, walletFor } = await import("../src/lib/chain");
  const { addresses, tokenAbi } = await import("../src/lib/contracts");
  const city = await import("../src/lib/city");
  const { ratesPublish, ratesCurrent } = await import("../src/lib/engine");
  const { parseChainError } = await import("../src/lib/errors");
  const { personas } = await import("../src/lib/personas");
  const cityAcc = personas.find((p) => p.id === "city")!.account;
  const bankAcc = personas.find((p) => p.id === "bank")!.account;
  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const card = async (z: number) => (await city.readZoneCards()).cards.find((c) => c.zoneId === z)!;

  // 1. deposit 500,000 into zone 4 with allowance reset to 0 -> approve then deposit
  const w = walletFor(cityAcc);
  const h0 = await w.writeContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "approve", args: [addresses.LocalBoost, 0n] });
  await publicClient.waitForTransactionReceipt({ hash: h0 });
  const before = (await card(4)).budget;
  const steps: string[] = [];
  const dep = await city.depositBudget(cityAcc, 4, 500_000n, (s) => steps.push(s));
  const after = (await card(4)).budget;
  check("deposit: budget 0 -> 500,000 with approve first", before === 0n && after === 500_000n && dep.approveHash !== null, `approve=${dep.approveHash?.slice(0, 10)} deposit=${dep.hash.slice(0, 10)} steps=${steps.join(" | ")}`);

  // 2. publish with the fixed override -> card shows 10.0%, table bps 1000
  const pub = await ratesPublish({ "4": 1000 });
  const z4 = pub.rates.find((r) => r.zoneId === 4)!;
  const c4 = await card(4);
  const cur = await ratesCurrent();
  check("publish: zone 4 = 1000 bps on chain and in table", z4.bps === 1000 && c4.rateBps === 1000 && cur.find((r) => r.zoneId === 4)?.bps === 1000, `tx=${pub.txHash.slice(0, 10)} others=${pub.rates.filter((r) => r.zoneId !== 4).map((r) => `${r.zoneId}:${r.bps}`).join(",")}`);

  // 3/4. tier-1 payment (signed by the attester directly) -> pending row -> clawback restores budget
  const { execSync } = await import("child_process");
  const out = execSync("PAYER=1 MERCHANT=1 AMOUNT=10000 TIER=1 npx hardhat run scripts/demo-pay.ts --network localhost", { cwd: path.resolve(__dirname, "..", "..", "contracts") }).toString();
  const boost = BigInt(/"boost": "(\d+)"/.exec(out)![1]);
  const pendingId = BigInt(/"pendingId": "(\d+)"/.exec(out)![1]);
  const budgetAfterPay = (await card(4)).budget;
  const pend = await city.listPending(true);
  check("tier 1 payment creates a pending row", pend.some((p) => p.id === pendingId && p.status === 0 && p.amount === boost), `boost=${boost} pendingId=${pendingId} rows=${pend.length}`);
  try {
    await city.clawbackPending(cityAcc, pendingId);
    check("clawback by city rejected", false, "unexpectedly succeeded");
  } catch (e) {
    const p = parseChainError(e);
    check("clawback by city rejected with mapped error", p.name === "AccessControlUnauthorizedAccount", `${p.name}: ${p.message}`);
  }
  const hc = await city.clawbackPending(bankAcc, pendingId);
  const pend2 = await city.listPending(true);
  const budgetAfterClaw = (await card(4)).budget;
  check("clawback by bank: row gone, budget restored", !pend2.some((p) => p.id === pendingId) && budgetAfterClaw === budgetAfterPay + boost, `tx=${hc.slice(0, 10)} budget ${budgetAfterPay} -> ${budgetAfterClaw}`);

  // 5. caps timelock
  const { caps: c0 } = await city.readCaps();
  await city.proposeCaps(cityAcc, { ...c0, perTxBoost: 4000 });
  try {
    await city.applyCaps(cityAcc);
    check("apply right after propose rejected", false, "unexpectedly succeeded");
  } catch (e) {
    const p = parseChainError(e);
    check("apply right after propose -> CapsNotReady (Korean)", p.name === "CapsNotReady" && p.message.includes("대기 시간"), p.message);
  }
  await publicClient.request({ method: "evm_increaseTime" as never, params: [c0.capsDelay + 1] as never });
  await publicClient.request({ method: "evm_mine" as never, params: [] as never });
  await city.applyCaps(bankAcc);
  const { caps: c1, readyAt } = await city.readCaps();
  check("apply after capsDelay: perTxBoost 3000 -> 4000, readyAt reset", c1.perTxBoost === 4000 && readyAt === 0, `perTxBoost=${c1.perTxBoost}`);

  console.log(failures ? `${failures} check(s) failed` : "verify-city passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
