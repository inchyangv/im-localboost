import { ethers } from "hardhat";
import { readDeployRecord, roleWallets } from "./accounts";
import { signAttestation } from "../test/eip712";

/**
 * Verification helper: signs an attestation with the attester key directly (bypassing the engine)
 * and submits payWithBoost. Also funds zone budget / publishes a rate when asked.
 *
 *   PAYER=1 MERCHANT=1 AMOUNT=10000 TIER=0 [USE_CREDIT=0] [FUND_ZONE=4:100000] [RATE=4:1000] \
 *     npx hardhat run scripts/demo-pay.ts --network localhost
 */
async function main() {
  const w = roleWallets();
  const rec = await readDeployRecord();
  const boost = await ethers.getContractAt("DalgubeolPay", rec.contracts.DalgubeolPay);
  const registry = await ethers.getContractAt("MerchantRegistry", rec.contracts.MerchantRegistry);
  const { chainId } = await ethers.provider.getNetwork();

  const payer = w.payers[Number(process.env.PAYER ?? "1") - 1];
  const merchant = w.merchants[Number(process.env.MERCHANT ?? "1") - 1].address;
  const amount = Number(process.env.AMOUNT ?? "10000");
  const tier = Number(process.env.TIER ?? "0");
  const useCredit = Number(process.env.USE_CREDIT ?? "0");

  if (process.env.FUND_ZONE) {
    const [z, amt] = process.env.FUND_ZONE.split(":").map(Number);
    await (await boost.connect(w.city).depositBudget(z, amt)).wait();
    console.log(`funded zone ${z} with ${amt}`);
  }
  if (process.env.RATE) {
    const [z, bps] = process.env.RATE.split(":").map(Number);
    const latest = await ethers.provider.getBlock("latest");
    const epoch = BigInt(latest!.timestamp) / 3600n;
    await (await boost.connect(w.oracle).setRates(epoch, [z], [bps])).wait();
    await (await boost.connect(w.oracle).setRates(epoch + 1n, [z], [bps])).wait();
    console.log(`rate zone ${z} = ${bps}bps for epochs ${epoch}, ${epoch + 1n}`);
  }

  const latest = await ethers.provider.getBlock("latest");
  const att = { payer: payer.address, merchant, amount, tier, nonce: BigInt(Date.now()), deadline: latest!.timestamp + 600 };
  const sig = await signAttestation(w.attester, rec.contracts.DalgubeolPay, chainId, att);
  const quote = await boost.quoteBoost(payer.address, merchant, amount, useCredit);
  const tx = await boost.connect(payer).payWithBoost(merchant, amount, useCredit, att, sig);
  const receipt = await tx.wait();
  const paid = receipt!.logs
    .map((l) => {
      try {
        return boost.interface.parseLog({ topics: [...l.topics], data: l.data });
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "Paid");
  const personId = await registry.personOf(payer.address);
  console.log(
    JSON.stringify(
      {
        txHash: receipt!.hash,
        block: receipt!.blockNumber,
        quote: quote.toString(),
        boost: paid?.args.boost.toString(),
        tier: Number(paid?.args.tier),
        pendingId: paid?.args.pendingId.toString(),
        credit: (await boost.creditOf(personId)).toString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
