import { ethers } from "hardhat";
import { readDeployRecord, roleWallets } from "./accounts";

/** Grants MINTER_ROLE on MockIMKRW to the bank account so the engine can issue iMKRW to
 *  onboarded wallets. Idempotent. New deployments get this from deploy.ts; this script is for
 *  deployments made before that line existed. */
async function main() {
  const w = roleWallets();
  const rec = await readDeployRecord();
  const token = await ethers.getContractAt("MockIMKRW", rec.contracts.MockIMKRW, w.deployer);
  const role = await token.MINTER_ROLE();
  if (await token.hasRole(role, w.bank.address)) {
    console.log(`bank ${w.bank.address} already has MINTER_ROLE on ${rec.contracts.MockIMKRW}`);
    return;
  }
  const tx = await token.grantRole(role, w.bank.address);
  await tx.wait();
  console.log(`granted MINTER_ROLE to bank ${w.bank.address} (${tx.hash})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
