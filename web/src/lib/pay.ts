import { maxUint256, parseEventLogs, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { publicClient } from "./chain";
import { addresses, dalgubeolPayAbi, tokenAbi } from "./contracts";
import { attest, type AttestResponse } from "./engine";
import { toSigner, type Signer } from "./signer";

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

export const LAST_SIGNATURE_KEY = "dalgubeolpay.lastSignature";

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

/** Accepts a demo persona account or any Signer (browser wallet). */
export async function ensureAllowance(who: PrivateKeyAccount | Signer, needed: bigint, onStep?: (msg: string) => void): Promise<Hex | null> {
  const signer = toSigner(who);
  const allowance = (await publicClient.readContract({
    address: addresses.MockIMKRW,
    abi: tokenAbi,
    functionName: "allowance",
    args: [signer.address, addresses.DalgubeolPay],
  })) as bigint;
  if (allowance >= needed) return null;
  onStep?.(signer.kind === "wallet" ? "지갑에서 iMKRW 사용 승인(approve)을 확인해 주세요" : "iMKRW 사용 승인(approve) 트랜잭션 전송 중…");
  const { request } = await publicClient.simulateContract({
    account: signer.wallet.account,
    address: addresses.MockIMKRW,
    abi: tokenAbi,
    functionName: "approve",
    args: [addresses.DalgubeolPay, maxUint256],
  });
  const hash = await signer.wallet.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Submits payWithBoost with an attestation and returns the receipt hash plus the decoded Paid event. */
export async function payWithBoost(
  who: PrivateKeyAccount | Signer,
  merchant: `0x${string}`,
  amount: bigint,
  useCredit: bigint,
  att: AttestResponse["attestation"],
  signature: Hex,
): Promise<{ hash: Hex; paid: PaidEvent | null; blockNumber: bigint }> {
  const signer = toSigner(who);
  const { request } = await publicClient.simulateContract({
    account: signer.wallet.account,
    address: addresses.DalgubeolPay,
    abi: dalgubeolPayAbi,
    functionName: "payWithBoost",
    args: [merchant, amount, useCredit, attestationTuple(att), signature],
  });
  const hash = await signer.wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: dalgubeolPayAbi, logs: receipt.logs, eventName: "Paid" });
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

/** The risk model reacts strongly to payments made within the first seconds after the hour
 *  boundary (`secs_since_rate_change`, SPEC 5.2). Waiting this long avoids a spurious hold. */
export const HOUR_GUARD_SECS = 45;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Full consumer flow: allowance -> /attest -> payWithBoost. `onStep` receives progress messages. */
export async function runPayFlow(
  who: PrivateKeyAccount | Signer,
  merchant: `0x${string}`,
  amount: number,
  useCredit: number,
  onStep?: (msg: string) => void,
  remember = true,
): Promise<PayFlowResult> {
  const signer = toSigner(who);
  const cash = BigInt(amount) - BigInt(useCredit);
  const offset = Math.floor(Date.now() / 1000) % 3600;
  if (offset < HOUR_GUARD_SECS) {
    for (let left = HOUR_GUARD_SECS - offset; left > 0; left--) {
      onStep?.(`정시 직후에는 위험 판정이 민감해서 ${left}초 뒤에 요청해요`);
      await sleep(1000);
    }
  }
  onStep?.("엔진에 위험 판정과 서명을 요청하는 중…");
  const att = await attest(signer.address, merchant, amount); // engine first: no tx when the engine is down
  const approveHash = cash > 0n ? await ensureAllowance(signer, cash, onStep) : null;
  onStep?.(signer.kind === "wallet" ? `판정 tier ${att.tier}. 지갑에서 결제 서명을 확인해 주세요` : `판정 tier ${att.tier}. payWithBoost 전송 중…`);
  const { hash, paid } = await payWithBoost(signer, merchant, BigInt(amount), BigInt(useCredit), att.attestation, att.signature);
  if (remember) {
    saveLastSignature({
      attestation: att.attestation,
      signature: att.signature,
      merchant,
      amount,
      useCredit,
      payerId: signer.address,
    });
  }
  return { approveHash, attest: att, hash, paid };
}
