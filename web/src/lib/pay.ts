import { maxUint256, parseEventLogs, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { publicClient, walletFor } from "./chain";
import { addresses, localBoostAbi, tokenAbi } from "./contracts";
import { attest, type AttestResponse } from "./engine";

export interface PaidEvent {
  payer: `0x${string}`;
  personId: `0x${string}`;
  merchant: `0x${string}`;
  zoneId: number;
  amount: bigint;
  useCredit: bigint;
  boost: bigint;
  tier: number;
  pendingId: bigint;
}

export interface StoredSignature {
  attestation: AttestResponse["attestation"];
  signature: Hex;
  merchant: `0x${string}`;
  amount: number;
  useCredit: number;
  payerId: string;
}

export const LAST_SIGNATURE_KEY = "localboost.lastSignature";

export function saveLastSignature(s: StoredSignature): void {
  try {
    window.sessionStorage.setItem(LAST_SIGNATURE_KEY, JSON.stringify(s));
  } catch {
    // ignore storage failures
  }
}

export function loadLastSignature(): StoredSignature | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_SIGNATURE_KEY);
    return raw ? (JSON.parse(raw) as StoredSignature) : null;
  } catch {
    return null;
  }
}

export function attestationTuple(att: AttestResponse["attestation"]) {
  return {
    payer: att.payer,
    merchant: att.merchant,
    amount: BigInt(att.amount),
    tier: att.tier,
    nonce: BigInt(att.nonce),
    deadline: BigInt(att.deadline),
  };
}

export async function ensureAllowance(account: PrivateKeyAccount, needed: bigint, onStep?: (msg: string) => void): Promise<Hex | null> {
  const allowance = (await publicClient.readContract({
    address: addresses.MockIMKRW,
    abi: tokenAbi,
    functionName: "allowance",
    args: [account.address, addresses.LocalBoost],
  })) as bigint;
  if (allowance >= needed) return null;
  onStep?.("iMKRW 사용 승인(approve) 트랜잭션 전송 중…");
  const wallet = walletFor(account);
  const { request } = await publicClient.simulateContract({
    account,
    address: addresses.MockIMKRW,
    abi: tokenAbi,
    functionName: "approve",
    args: [addresses.LocalBoost, maxUint256],
  });
  const hash = await wallet.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Submits payWithBoost with an attestation and returns the receipt hash plus the decoded Paid event. */
export async function payWithBoost(
  account: PrivateKeyAccount,
  merchant: `0x${string}`,
  amount: bigint,
  useCredit: bigint,
  att: AttestResponse["attestation"],
  signature: Hex,
): Promise<{ hash: Hex; paid: PaidEvent | null; blockNumber: bigint }> {
  const wallet = walletFor(account);
  const { request } = await publicClient.simulateContract({
    account,
    address: addresses.LocalBoost,
    abi: localBoostAbi,
    functionName: "payWithBoost",
    args: [merchant, amount, useCredit, attestationTuple(att), signature],
  });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: localBoostAbi, logs: receipt.logs, eventName: "Paid" });
  const first = logs[0] as unknown as { args: PaidEvent } | undefined;
  const paid = first ? { ...first.args, zoneId: Number(first.args.zoneId), tier: Number(first.args.tier) } : null;
  return { hash, paid, blockNumber: receipt.blockNumber };
}

export interface PayFlowResult {
  approveHash: Hex | null;
  attest: AttestResponse;
  hash: Hex;
  paid: PaidEvent | null;
}

/** Full consumer flow: allowance -> /attest -> payWithBoost. `onStep` receives progress messages. */
export async function runPayFlow(
  account: PrivateKeyAccount,
  merchant: `0x${string}`,
  amount: number,
  useCredit: number,
  onStep?: (msg: string) => void,
): Promise<PayFlowResult> {
  const cash = BigInt(amount) - BigInt(useCredit);
  onStep?.("엔진에 위험 판정과 서명을 요청하는 중…");
  const att = await attest(account.address, merchant, amount); // engine first: no tx when the engine is down
  const approveHash = cash > 0n ? await ensureAllowance(account, cash, onStep) : null;
  onStep?.(`판정 tier ${att.tier}. payWithBoost 전송 중…`);
  const { hash, paid } = await payWithBoost(account, merchant, BigInt(amount), BigInt(useCredit), att.attestation, att.signature);
  saveLastSignature({
    attestation: att.attestation,
    signature: att.signature,
    merchant,
    amount,
    useCredit,
    payerId: account.address,
  });
  return { approveHash, attest: att, hash, paid };
}
