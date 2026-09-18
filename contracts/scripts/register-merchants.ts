import { ethers } from "hardhat";
import { MERCHANTS, merchantAddress } from "./demo-config";
import { readDeployRecord, roleWallets } from "./accounts";

/** Registers every MERCHANTS entry that is missing on-chain or whose zone/category/baseline differs.
 *  Idempotent: re-running after a partial failure only sends the remaining txs. */
async function main() {
  const w = roleWallets();
  const rec = await readDeployRecord();
  const registry = await ethers.getContractAt("MerchantRegistry", rec.contracts.MerchantRegistry, w.bank);
  const merchantKeyAddresses = w.merchants.map((m) => m.address);

  let nonce = await w.bank.getNonce("pending");
  const pending: Promise<unknown>[] = [];
  let skipped = 0;
  for (const m of MERCHANTS) {
    const addr = merchantAddress(m, merchantKeyAddresses);
    const cur = await registry.get(addr);
    if (cur.active && Number(cur.zoneId) === m.zoneId && Number(cur.categoryId) === m.categoryId && cur.slotBaseline === BigInt(m.slotBaseline)) {
      skipped++;
      continue;
    }
    const tx = await registry.register(addr, m.zoneId, m.categoryId, m.slotBaseline, { nonce: nonce++ });
    console.log(`  ${m.name} zone=${m.zoneId} cat=${m.categoryId} ${addr} ${tx.hash}`);
    pending.push(tx.wait());
    // Keep a bounded number of txs in flight so public RPCs do not drop them.
    if (pending.length >= 20) await Promise.all(pending.splice(0));
  }
  await Promise.all(pending);
  console.log(`merchants: ${MERCHANTS.length} total, ${MERCHANTS.length - skipped} registered now, ${skipped} already up to date`);
}

main().catch((e) => {
  console.error("register-merchants failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
