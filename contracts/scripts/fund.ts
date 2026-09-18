import { ethers } from "hardhat";
import { roleWallets } from "./accounts";

const AMOUNT = ethers.parseEther("0.5");
const SKIP_ABOVE = ethers.parseEther("0.3");

/** Deployer sends 0.5 KAIA to city, bank, oracle, payers 1-5 and merchants 1-3 (attester excluded).
 *  Accounts already holding >= 0.3 KAIA are skipped. */
async function main() {
  const w = roleWallets();
  const targets = [
    ["city", w.city.address],
    ["bank", w.bank.address],
    ["oracle", w.oracle.address],
    ...w.payers.map((p, i) => [`payer ${i + 1}`, p.address]),
    ...w.merchants.map((m, i) => [`merchant ${i + 1}`, m.address]),
  ] as Array<[string, string]>;
  for (const [role, to] of targets) {
    const bal = await ethers.provider.getBalance(to);
    if (bal >= SKIP_ABOVE) {
      console.log(`  ${role.padEnd(12)} ${to} has ${ethers.formatEther(bal)} KAIA, skip`);
      continue;
    }
    const tx = await w.deployer.sendTransaction({ to, value: AMOUNT });
    await tx.wait();
    console.log(`  ${role.padEnd(12)} ${to} funded 0.5 KAIA (${tx.hash})`);
  }
  console.log(`deployer balance now ${ethers.formatEther(await ethers.provider.getBalance(w.deployer.address))} KAIA`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
