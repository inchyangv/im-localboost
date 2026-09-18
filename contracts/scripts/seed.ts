import { ethers } from "hardhat";
import { MERCHANTS, SEED, ZONES, merchantAddress, personId } from "./demo-config";
import { readDeployRecord, roleWallets } from "./accounts";

/** Seeds the demo state (SPEC 3.4). Not idempotent: a second run fails on setPerson or mints twice,
 *  so the failure reason is printed instead of silently continuing. */
async function main() {
  const w = roleWallets();
  const rec = await readDeployRecord();
  const token = await ethers.getContractAt("MockIMKRW", rec.contracts.MockIMKRW, w.deployer);
  const registry = await ethers.getContractAt("MerchantRegistry", rec.contracts.MerchantRegistry, w.bank);
  const boost = await ethers.getContractAt("LocalBoost", rec.contracts.LocalBoost, w.city);
  const boostAddr = rec.contracts.LocalBoost;

  // Guard against a second run: payer 1 already linked means the seed has been applied.
  const existing = await registry.personOf(w.payers[0].address);
  if (existing !== ethers.ZeroHash) {
    throw new Error(`seed already applied on chainId=${rec.chainId} (payer 1 is linked to ${existing})`);
  }

  const merchantKeyAddresses = w.merchants.map((m) => m.address);

  console.log("registering merchants");
  for (const m of MERCHANTS) {
    const addr = merchantAddress(m, merchantKeyAddresses);
    await (await registry.register(addr, m.zoneId, m.categoryId, m.slotBaseline)).wait();
    console.log(`  ${m.name} zone=${m.zoneId} cat=${m.categoryId} ${addr}`);
  }

  console.log("linking persons and minting payers");
  for (let i = 0; i < w.payers.length; i++) {
    await (await registry.setPerson(w.payers[i].address, personId(i + 1))).wait();
    await (await token.mint(w.payers[i].address, SEED.payerMint)).wait();
    await (await token.connect(w.payers[i]).approve(boostAddr, ethers.MaxUint256)).wait();
    console.log(`  payer ${i + 1} ${w.payers[i].address} person-${i + 1}`);
  }

  console.log("minting merchants and city");
  for (const m of w.merchants) await (await token.mint(m.address, SEED.merchantMint)).wait();
  await (await token.mint(w.city.address, SEED.cityMint)).wait();

  console.log("depositing budgets and hourly caps");
  await (await token.connect(w.city).approve(boostAddr, ethers.MaxUint256)).wait();
  for (const z of SEED.fundedZones) {
    await (await boost.depositBudget(z, SEED.zoneDeposit)).wait();
  }
  for (const z of ZONES) {
    await (await boost.setZoneHourlyCap(z.id, SEED.zoneHourlyCap)).wait();
  }
  console.log("seed complete");
}

main().catch((e) => {
  console.error("seed failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
