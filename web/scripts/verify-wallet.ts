/**
 * Headless proof of the real-wallet path: a throwaway key stands in for the user's Kaia Wallet.
 *   1. POST /onboard          -> bank links personId, mints starter iMKRW, tops up gas
 *   2. runPayFlow(signer)     -> /attest -> approve (first time) -> payWithBoost, exactly as the page does
 *
 *   cd web && npx tsx --env-file=.env.local scripts/verify-wallet.ts                 # local node + engine
 *   cd web && npx tsx --env-file=.env.production.local scripts/verify-wallet.ts      # Kairos + Railway
 *
 * Only NEXT_PUBLIC_CHAIN_ID / RPC_URL / ENGINE_URL are needed; no persona keys. MERCHANT=<index> picks
 * the demo merchant from shared/deployments.json for the chain (default 0 = the 북성로 restaurant, zone 4;
 * names differ between 31337 and 1001 and the script prints the one it uses), AMOUNT the won amount
 * (default 10000). A fresh seed leaves zone 4 unfunded for demo step 1 (city deposit), so the payment
 * there succeeds with boost 0; MERCHANT=4 (안지랑, zone 3) pays into a funded zone.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

async function main() {
  const { publicClient } = await import("../src/lib/chain");
  const { addresses, dalgubeolPayAbi, registryAbi, tokenAbi } = await import("../src/lib/contracts");
  const { merchants, chainId } = await import("../src/lib/config");
  const { onboard, onboardStatus, health } = await import("../src/lib/engine");
  const { runPayFlow } = await import("../src/lib/pay");
  const { personaSigner } = await import("../src/lib/signer");
  const { parseChainError } = await import("../src/lib/errors");

  const merchant = merchants[Number(process.env.MERCHANT ?? 0)];
  const amount = Number(process.env.AMOUNT ?? 10_000);
  const account = privateKeyToAccount(generatePrivateKey());
  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
    if (!ok) failures++;
  };
  const read = async <T,>(address: `0x${string}`, abi: typeof tokenAbi, functionName: string, args: unknown[]) =>
    (await publicClient.readContract({ address, abi, functionName, args })) as T;

  console.log(`chainId ${chainId}, throwaway wallet ${account.address.slice(0, 10)}…, merchant ${merchant.name}`);
  const h = await health();
  check("engine health", h.ok === true, `contract ${h.contract}`);
  check("engine contract matches shared/deployments.json", h.contract.toLowerCase() === addresses.DalgubeolPay.toLowerCase());

  const before = await onboardStatus(account.address);
  check("fresh wallet is unregistered", before.registered === false && before.mintedToday === false);

  const t0 = Date.now();
  const ob = await onboard(account.address);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check("onboard: personId linked", !!ob.personTx && ob.registered === false, `${secs}s`);
  check("onboard: starter iMKRW minted", ob.minted === ob.mintAmount && ob.mintAmount > 0, `${ob.mintAmount} won`);
  check("onboard: gas topped up", !!ob.gasTx && BigInt(ob.gasSentWei) > 0n);
  const personId = await read<`0x${string}`>(addresses.MerchantRegistry, registryAbi, "personOf", [account.address]);
  const bal = await read<bigint>(addresses.MockIMKRW, tokenAbi, "balanceOf", [account.address]);
  const native = await publicClient.getBalance({ address: account.address });
  check("on-chain: personId, balance and native gas", personId === ob.personId && bal === BigInt(ob.mintAmount) && native > 0n, `balance ${bal} native ${native}`);

  const again = await onboard(account.address);
  check("onboard again same day: no second mint", again.minted === 0 && again.mintedToday === true && again.personTx === null);

  const steps: string[] = [];
  try {
    const r = await runPayFlow(personaSigner(account), merchant.address, amount, 0, (s) => steps.push(s));
    const paid = r.paid;
    check("pay: transaction mined with Paid event", !!paid, r.hash);
    check("pay: first payment needed an approve", r.approveHash !== null);
    if (paid) {
      const credit = await read<bigint>(addresses.DalgubeolPay, dalgubeolPayAbi, "creditOf", [personId]);
      console.log(`     tier ${paid.tier}, boost ${paid.boost}, credit now ${credit}, steps: ${steps.join(" | ")}`);
      check("pay: amount debited", (await read<bigint>(addresses.MockIMKRW, tokenAbi, "balanceOf", [account.address])) === bal - BigInt(amount));
      check("pay: tier 0 (no hold) for a bank-onboarded wallet", paid.tier === 0, `tier ${paid.tier}, reasons ${r.attest.reasons.join(",") || "none"}`);
    }
  } catch (e) {
    check("pay flow", false, parseChainError(e).message);
  }
  console.log(failures ? `${failures} failure(s)` : "all checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
