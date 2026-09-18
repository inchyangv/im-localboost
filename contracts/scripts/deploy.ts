import { ethers } from "hardhat";
import { CAPS } from "./demo-config";
import { intEnv, roleWallets, writeDeployRecord } from "./accounts";

/** Deploys MockIMKRW, MerchantRegistry and LocalBoost, wires roles, and records addresses
 *  in contracts/.deploy-<chainId>.json for seed.ts / write-shared.ts. Network-agnostic. */
async function main() {
  const w = roleWallets();
  const { chainId } = await ethers.provider.getNetwork();
  const caps = {
    ...CAPS,
    pendingDelay: intEnv("PENDING_DELAY", 60),
    capsDelay: intEnv("CAPS_DELAY", 60),
  };
  console.log(`deploying on chainId=${chainId} as ${w.deployer.address}`);

  const token = await ethers.deployContract("MockIMKRW", [], w.deployer);
  const tokenTx = token.deploymentTransaction();
  await token.waitForDeployment();
  const tokenReceipt = await tokenTx!.wait();
  const startBlock = tokenReceipt!.blockNumber;

  const registry = await ethers.deployContract("MerchantRegistry", [], w.deployer);
  await registry.waitForDeployment();

  const boost = await ethers.deployContract(
    "LocalBoost",
    [await token.getAddress(), await registry.getAddress(), caps],
    w.deployer,
  );
  await boost.waitForDeployment();

  // Roles
  await (await registry.grantRole(await registry.BANK_ROLE(), w.bank.address)).wait();
  await (await boost.grantRole(await boost.CITY_ROLE(), w.city.address)).wait();
  await (await boost.grantRole(await boost.BANK_ROLE(), w.bank.address)).wait();
  await (await boost.grantRole(await boost.ORACLE_ROLE(), w.oracle.address)).wait();
  await (await boost.connect(w.bank).setAttester(w.attester.address, true)).wait();

  const rec = {
    chainId: Number(chainId),
    startBlock,
    contracts: {
      MockIMKRW: await token.getAddress(),
      MerchantRegistry: await registry.getAddress(),
      LocalBoost: await boost.getAddress(),
    },
  };
  writeDeployRecord(rec);
  console.log(JSON.stringify(rec, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
