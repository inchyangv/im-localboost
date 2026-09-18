import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { personId, SEED } from "./demo-config";
import { roleWallets } from "./accounts";

/** Checks the seeded state against shared/deployments.json for the active network. Exit 1 on mismatch. */
async function main() {
  const w = roleWallets();
  const { chainId } = await ethers.provider.getNetwork();
  const file = path.resolve(__dirname, "..", "..", "shared", "deployments.json");
  const dep = JSON.parse(fs.readFileSync(file, "utf8"))[String(chainId)];
  if (!dep) throw new Error(`no deployments.json entry for chainId ${chainId}`);

  const token = await ethers.getContractAt("MockIMKRW", dep.contracts.MockIMKRW);
  const registry = await ethers.getContractAt("MerchantRegistry", dep.contracts.MerchantRegistry);
  const boost = await ethers.getContractAt("LocalBoost", dep.contracts.LocalBoost);
  const merchant1 = dep.merchants[0].address;

  const checks: Array<[string, bigint | boolean | string, bigint | boolean | string]> = [];
  const expectedCity = BigInt(SEED.cityMint - SEED.zoneDeposit * SEED.fundedZones.length);
  checks.push(["payer1 balance", await token.balanceOf(w.payers[0].address), BigInt(SEED.payerMint)]);
  checks.push(["merchant1 balance", await token.balanceOf(w.merchants[0].address), BigInt(SEED.merchantMint)]);
  checks.push(["city balance", await token.balanceOf(w.city.address), expectedCity]);
  checks.push(["zoneBudget(1)", await boost.zoneBudget(1), BigInt(SEED.zoneDeposit)]);
  checks.push(["zoneBudget(4)", await boost.zoneBudget(4), 0n]);
  checks.push(["zoneHourlyCap(4)", await boost.zoneHourlyCap(4), BigInt(SEED.zoneHourlyCap)]);
  checks.push(["merchant1 slotBaseline", (await registry.get(merchant1)).slotBaseline, 100_000n]);
  checks.push(["merchant1 == MERCHANT_KEYS[0]", merchant1.toLowerCase(), w.merchants[0].address.toLowerCase()]);
  checks.push(["personOf(payer1)", await registry.personOf(w.payers[0].address), personId(1)]);
  checks.push(["allowance(payer1)", await token.allowance(w.payers[0].address, dep.contracts.LocalBoost), ethers.MaxUint256]);
  checks.push(["attesters(attester)", await boost.attesters(w.attester.address), true]);
  checks.push(["merchants count", BigInt(dep.merchants.length), 8n]);
  checks.push(["zones count", BigInt(dep.zones.length), 5n]);

  let failed = 0;
  for (const [name, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
  }
  if (failed > 0) throw new Error(`${failed} check(s) failed`);
  console.log(`verify-seed passed on chainId ${chainId}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
