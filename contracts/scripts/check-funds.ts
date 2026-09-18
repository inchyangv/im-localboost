import { ethers } from "hardhat";
import { roleWallets } from "./accounts";

const MIN_DEPLOYER = ethers.parseEther("10");
const MIN_DEMO = ethers.parseEther("0.3");

/** Prints native balances of the 13 role accounts. Exit 1 when the deployer holds < 10 KAIA. */
async function main() {
  const w = roleWallets();
  const { chainId } = await ethers.provider.getNetwork();
  const rows: Array<[string, string, boolean]> = [
    ["deployer", w.deployer.address, true],
    ["city", w.city.address, false],
    ["bank", w.bank.address, false],
    ["oracle", w.oracle.address, false],
    ["attester", w.attester.address, false],
    ...w.payers.map((p, i) => [`payer ${i + 1}`, p.address, false] as [string, string, boolean]),
    ...w.merchants.map((m, i) => [`merchant ${i + 1}`, m.address, false] as [string, string, boolean]),
  ];
  console.log(`balances on chainId ${chainId}`);
  let deployerBalance = 0n;
  let lowDemo = 0;
  for (const [role, address, isDeployer] of rows) {
    const bal = await ethers.provider.getBalance(address);
    if (isDeployer) deployerBalance = bal;
    else if (role !== "attester" && bal < MIN_DEMO) lowDemo++;
    console.log(`  ${role.padEnd(12)} ${address}  ${ethers.formatEther(bal).padStart(14)} KAIA`);
  }
  console.log(`demo accounts below 0.3 KAIA (excluding attester): ${lowDemo}`);
  if (deployerBalance < MIN_DEPLOYER) {
    console.error(
      `\ndeployer ${w.deployer.address} holds ${ethers.formatEther(deployerBalance)} KAIA (< 10).\n` +
        `Get test KAIA at https://faucet.kaia.io for that address, then run again.`,
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
