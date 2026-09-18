import type { PrivateKeyAccount } from "viem/accounts";
import { publicClient } from "./chain";
import { addresses, tokenAbi } from "./contracts";
import { personas } from "./personas";
import { transfers, type TransferRow } from "./engine";
import { merchantByAddress } from "./config";
import { toSigner, type Signer } from "./signer";

/**
 * Settlement without a contract change (SPEC 7.3): a merchant redeems iMKRW by transferring it to the
 * bank; the bank pays KRW off-chain and retires the tokens by sending them to the sink address.
 * Both legs are ordinary ERC-20 transfers, so the engine's Transfer table is the ledger.
 */
export const SINK = "0x000000000000000000000000000000000000dEaD" as const;

export function bankAddress(): `0x${string}` | null {
  return personas.find((p) => p.role === "bank")?.account.address ?? null;
}

export async function requestSettlement(who: PrivateKeyAccount | Signer, amount: bigint): Promise<`0x${string}`> {
  const bank = bankAddress();
  if (!bank) throw new Error("은행 주소를 찾을 수 없어요.");
  const signer = toSigner(who);
  const { request } = await publicClient.simulateContract({
    account: signer.wallet.account,
    address: addresses.MockIMKRW,
    abi: tokenAbi,
    functionName: "transfer",
    args: [bank, amount],
  });
  const hash = await signer.wallet.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Bank marks a request as paid out in KRW: the redeemed iMKRW leaves circulation. */
export async function retireSettled(bank: PrivateKeyAccount | Signer, amount: bigint): Promise<`0x${string}`> {
  const signer = toSigner(bank);
  const { request } = await publicClient.simulateContract({
    account: signer.wallet.account,
    address: addresses.MockIMKRW,
    abi: tokenAbi,
    functionName: "transfer",
    args: [SINK, amount],
  });
  const hash = await signer.wallet.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export interface SettlementRequest extends TransferRow {
  merchantName: string;
}

export interface SettlementLedger {
  requests: SettlementRequest[]; // merchant -> bank, newest first
  payouts: TransferRow[]; // bank -> sink, newest first
  requestedTotal: bigint;
  paidTotal: bigint;
  /** Requested but not yet retired (FIFO by amount, since transfers carry no reference). */
  outstanding: bigint;
}

export async function loadSettlementLedger(): Promise<SettlementLedger> {
  const bank = bankAddress();
  if (!bank) return { requests: [], payouts: [], requestedTotal: 0n, paidTotal: 0n, outstanding: 0n };
  const [incoming, outgoing] = await Promise.all([transfers({ to: bank, limit: 200 }), transfers({ from: bank, to: SINK, limit: 200 })]);
  const requests = incoming
    .filter((t) => merchantByAddress(t.from))
    .map((t) => ({ ...t, merchantName: merchantByAddress(t.from)!.name }));
  const requestedTotal = requests.reduce((s, t) => s + BigInt(t.amount), 0n);
  const paidTotal = outgoing.reduce((s, t) => s + BigInt(t.amount), 0n);
  return { requests, payouts: outgoing, requestedTotal, paidTotal, outstanding: requestedTotal > paidTotal ? requestedTotal - paidTotal : 0n };
}
