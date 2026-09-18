/**
 * Headless verification of the consumer page flow (T-15). Runs the same library code the page
 * uses (runPayFlow, quoteBoost + zeroBoostReason, readBoostState) against the local chain + engine.
 *
 *   cd web && npx tsx --env-file=.env.local scripts/verify-consumer.ts            # steps 1-4
 *   cd web && NEXT_PUBLIC_ENGINE_URL=http://127.0.0.1:1 npx tsx --env-file=.env.local scripts/verify-consumer.ts engine-down
 *
 * Needs root .env for CITY_KEY / ORACLE_KEY (read via dotenv from ../.env).
 */
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

loadEnv({ path: path.resolve(__dirname, "..", "..", ".env"), override: false, quiet: true });

async function main() {
  const { publicClient, walletFor } = await import("../src/lib/chain");
  const { addresses, dalgubeolPayAbi, readBoostState, tokenAbi } = await import("../src/lib/contracts");
  const { merchants } = await import("../src/lib/config");
  const { runPayFlow } = await import("../src/lib/pay");
  const { zeroBoostReason } = await import("../src/lib/reasons");
  const { personas } = await import("../src/lib/personas");
  const { parseChainError } = await import("../src/lib/errors");
  const { EngineError } = await import("../src/lib/engine");

  const mode = process.argv[2] ?? "flow";
  const payer1 = personas.find((p) => p.id === "payer-1")!.account;
  const payer5 = personas.find((p) => p.id === "payer-5")!.account;
  const m1 = merchants[0];
  const m2 = merchants[1];
  const city = privateKeyToAccount(process.env.CITY_KEY as `0x${string}`);
  const oracle = privateKeyToAccount(process.env.ORACLE_KEY as `0x${string}`);
  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const bal = async (addr: `0x${string}`) =>
    (await publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [addr] })) as bigint;
  const quote = async (payer: `0x${string}`, merchant: `0x${string}`, amount: number, useCredit: number) =>
    (await publicClient.readContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName: "quoteBoost", args: [payer, merchant, BigInt(amount), BigInt(useCredit)] })) as bigint;

  if (mode === "engine-down") {
    const nonceBefore = await publicClient.getTransactionCount({ address: payer1.address });
    try {
      await runPayFlow(payer1, m1.address, 10_000, 0);
      check("engine down -> error", false, "flow unexpectedly succeeded");
    } catch (e) {
      const msg = e instanceof EngineError ? e.message : parseChainError(e).message;
      check("engine down -> Korean connection error", msg.includes("엔진에 연결할 수 없습니다"), msg);
    }
    const nonceAfter = await publicClient.getTransactionCount({ address: payer1.address });
    check("engine down -> no transaction sent", nonceAfter === nonceBefore, `nonce ${nonceBefore} -> ${nonceAfter}`);
    process.exit(failures ? 1 : 0);
  }

  // Step 1 stand-in for demo step 1: fund zone 4 and publish 10% for zones 4 and 2 (current + next hour).
  const cityWallet = walletFor(city);
  const oracleWallet = walletFor(oracle);
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const epoch = block.timestamp / 3600n;
  const h1 = await cityWallet.writeContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName: "depositBudget", args: [4, 500_000n] });
  await publicClient.waitForTransactionReceipt({ hash: h1 });
  for (const e of [epoch, epoch + 1n]) {
    const h = await oracleWallet.writeContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName: "setRates", args: [e, [4, 2], [1000, 1000]] });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }
  console.log("setup: zone 4 funded 500,000; rates 10% for zones 4, 2");

  // Step 2: consumer 1 pays merchant 1 (북성로 식당) 10,000 -> boost 1,000, credit 1,000, merchant +10,000
  const m1Before = await bal(m1.address);
  const q1 = await quote(payer1.address, m1.address, 10_000, 0);
  check("preview quote 1,000", q1 === 1000n, q1.toString());
  const r1 = await runPayFlow(payer1, m1.address, 10_000, 0, (s) => console.log("   step:", s));
  check("paid: boost 1,000 tier 0", r1.paid?.boost === 1000n && r1.paid?.tier === 0, `boost=${r1.paid?.boost} tier=${r1.paid?.tier} tx=${r1.hash}`);
  const st1 = await readBoostState(payer1.address, m1.address, m1.zoneId);
  check("credit 1,000", st1.credit === 1000n, st1.credit.toString());
  check("merchant +10,000", (await bal(m1.address)) - m1Before === 10_000n);

  // Step 3: same pair again -> quote 0 with reason, payment succeeds with boost 0 and the same reason
  const q2 = await quote(payer1.address, m1.address, 10_000, 0);
  const st2 = await readBoostState(payer1.address, m1.address, m1.zoneId);
  const reason2 = zeroBoostReason({ state: st2, amount: 10_000n, useCredit: 0n });
  check("preview quote 0 + reason", q2 === 0n && reason2 === "오늘 이미 보너스를 받은 가게", `quote=${q2} reason=${reason2}`);
  const r2 = await runPayFlow(payer1, m1.address, 10_000, 0);
  const st3 = await readBoostState(payer1.address, m1.address, m1.zoneId);
  const reason3 = zeroBoostReason({ state: st3, amount: 10_000n, useCredit: 0n, tier: r2.attest.tier, engineReasons: r2.attest.reasons });
  check("repeat: tx success, boost 0, reason on result", r2.paid?.boost === 0n && reason3 === "오늘 이미 보너스를 받은 가게", `boost=${r2.paid?.boost} reason=${reason3} tier=${r2.attest.tier}`);

  // Step 4: consumer 1 pays merchant 2 (들안길 카페, zone 2 at 10%) 10,000 using 1,000 credit -> merchant +10,000, boost 900
  const m2Before = await bal(m2.address);
  const q3 = await quote(payer1.address, m2.address, 10_000, 1000);
  check("preview quote 900 with credit", q3 === 900n, q3.toString());
  const r3 = await runPayFlow(payer1, m2.address, 10_000, 1000);
  check("credit payment: merchant +10,000, boost 900", (await bal(m2.address)) - m2Before === 10_000n && r3.paid?.boost === 900n, `boost=${r3.paid?.boost} tier=${r3.attest.tier}`);

  // Step 5: consumer 5 with allowance 0 -> approve first, then pay
  const w5 = walletFor(payer5);
  const h0 = await w5.writeContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "approve", args: [addresses.DalgubeolPay, 0n] });
  await publicClient.waitForTransactionReceipt({ hash: h0 });
  const r5 = await runPayFlow(payer5, m1.address, 10_000, 0, (s) => console.log("   step:", s));
  const allowance = (await publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "allowance", args: [payer5.address, addresses.DalgubeolPay] })) as bigint;
  check("allowance 0 -> approve tx then payment", r5.approveHash !== null && r5.paid !== null && allowance === maxUint256, `approve=${r5.approveHash} pay=${r5.hash}`);

  console.log(failures ? `${failures} check(s) failed` : "verify-consumer passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
