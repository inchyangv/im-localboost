// DEMO ONLY: drives several persona keys from the browser to stage a collusion ring and a replay attack.
import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { publicClient, walletFor } from "./chain";
import { merchants } from "./config";
import { addresses, kstDay, localBoostAbi, registryAbi, tokenAbi, chainNow } from "./contracts";
import { parseChainError, reasonLabel } from "./errors";
import { attestationTuple, loadLastSignature, runPayFlow } from "./pay";
import { personas, type Persona } from "./personas";

export type DemoLog = (line: string) => void;

const RING_AMOUNT = 10_000;
const BACKFLOW_AMOUNT = 9_000;
const POLLER_WAIT_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RingStepResult {
  consumer: string;
  skipped?: string;
  tier?: number;
  reasons?: string[];
  boost?: bigint;
  pendingId?: bigint;
  txHash?: Hex;
  transferHash?: Hex;
  error?: string;
}

async function personIdOf(addr: `0x${string}`): Promise<`0x${string}`> {
  return (await publicClient.readContract({ address: addresses.MerchantRegistry, abi: registryAbi, functionName: "personOf", args: [addr] })) as `0x${string}`;
}

async function alreadyBoostedToday(payer: `0x${string}`, merchant: `0x${string}`): Promise<boolean> {
  const [pid, now] = await Promise.all([personIdOf(payer), chainNow()]);
  const pairDay = (await publicClient.readContract({ address: addresses.LocalBoost, abi: localBoostAbi, functionName: "pairDay", args: [pid, merchant] })) as bigint;
  return Number(pairDay) === kstDay(now);
}

/**
 * Collusion ring: consumer 1 pays merchant 2 normally, then for consumers 2..5 merchant 2 sends
 * 9,000 back (backflow), we wait for the poller, ask /attest and pay. Tiers are logged as they come:
 * tier 1 creates a pending bonus, tier 2 (rule or model) blocks the bonus outright.
 */
export async function runCollusionRing(log: DemoLog): Promise<RingStepResult[]> {
  const merchant = merchants[1];
  const merchantPersona = personas.find((p) => p.role === "merchant" && p.index === 1);
  const consumers = personas.filter((p) => p.role === "payer").sort((a, b) => a.index - b.index).slice(0, 5);
  if (!merchantPersona || consumers.length < 5) throw new Error("페르소나 키가 부족합니다 (가맹점 2, 소비자 1~5 필요)");
  const results: RingStepResult[] = [];
  log(`담합 링 시작: 가맹점 2(${merchant.name}) ↔ 소비자 1~5`);

  const payOne = async (c: Persona, transferHash?: Hex): Promise<RingStepResult> => {
    if (await alreadyBoostedToday(c.account.address, merchant.address)) {
      const msg = `${c.label}: 오늘 이미 이 가게에서 보너스를 받아 건너뜀 (pairDay)`;
      log(msg);
      return { consumer: c.label, skipped: msg, transferHash };
    }
    try {
      const r = await runPayFlow(c.account, merchant.address, RING_AMOUNT, 0, (s) => log(`${c.label}: ${s}`), false);
      const tier = r.attest.tier;
      const reasons = r.attest.reasons.map(reasonLabel).join(", ") || "없음";
      const boost = r.paid?.boost ?? 0n;
      const pendingId = r.paid?.pendingId ?? 0n;
      const verdict = tier === 0 ? "정상, 보너스 지급" : tier === 1 ? `보류 생성 (pendingId ${pendingId})` : "차단, 보너스 0원";
      log(`${c.label}: tier ${tier} (${reasons}, score ${r.attest.score.toFixed(3)}) → ${verdict}, boost ${boost.toLocaleString("ko-KR")}원`);
      return { consumer: c.label, tier, reasons: r.attest.reasons, boost, pendingId, txHash: r.hash, transferHash };
    } catch (e) {
      const p = parseChainError(e);
      log(`${c.label}: 실패 — ${p.message}`);
      return { consumer: c.label, error: p.message, transferHash };
    }
  };

  results.push(await payOne(consumers[0]));

  const merchantWallet = walletFor(merchantPersona.account);
  for (const c of consumers.slice(1)) {
    log(`가맹점 2 → ${c.label}: ${BACKFLOW_AMOUNT.toLocaleString("ko-KR")}원 환류 Transfer 전송 중…`);
    let transferHash: Hex;
    try {
      transferHash = await merchantWallet.writeContract({
        address: addresses.MockIMKRW,
        abi: tokenAbi,
        functionName: "transfer",
        args: [c.account.address, BigInt(BACKFLOW_AMOUNT)],
      });
      await publicClient.waitForTransactionReceipt({ hash: transferHash });
    } catch (e) {
      const p = parseChainError(e);
      log(`가맹점 2 → ${c.label}: Transfer 실패 — ${p.message}`);
      results.push({ consumer: c.label, error: p.message });
      continue;
    }
    log(`폴러 적재 대기 ${POLLER_WAIT_MS / 1000}초…`);
    await sleep(POLLER_WAIT_MS);
    results.push(await payOne(c, transferHash));
  }

  const flagged = results.filter((r) => (r.tier ?? 0) >= 1).length;
  const pending = results.filter((r) => (r.pendingId ?? 0n) > 0n).length;
  log(`담합 링 종료: 위험 판정 ${flagged}건, 보류 ${pending}건, 차단 ${results.filter((r) => r.tier === 2).length}건`);
  return results;
}

export interface ReplayResult {
  ok: boolean;
  errorName: string | null;
  message: string;
}

/** Re-submits the last stored attestation with identical arguments. Must revert with NonceUsed. */
export async function replayLastSignature(log: DemoLog): Promise<ReplayResult> {
  const last = loadLastSignature();
  if (!last) {
    const message = "먼저 소비자 화면에서 결제하세요 (보관된 서명이 없습니다)";
    log(message);
    return { ok: false, errorName: null, message };
  }
  const persona = personas.find((p) => p.account.address.toLowerCase() === last.payerId.toLowerCase());
  if (!persona) {
    const message = "보관된 서명의 결제자 페르소나를 찾을 수 없습니다";
    log(message);
    return { ok: false, errorName: null, message };
  }
  log(`${persona.label}의 직전 서명(nonce ${last.attestation.nonce.slice(0, 12)}…)을 같은 인자로 다시 제출합니다`);
  try {
    await publicClient.simulateContract({
      account: persona.account as PrivateKeyAccount,
      address: addresses.LocalBoost,
      abi: localBoostAbi,
      functionName: "payWithBoost",
      args: [last.merchant, BigInt(last.amount), BigInt(last.useCredit), attestationTuple(last.attestation), last.signature],
    });
    const message = "예상과 달리 재제출이 통과했습니다 (문제)";
    log(message);
    return { ok: false, errorName: null, message };
  } catch (e) {
    const p = parseChainError(e);
    log(`revert: ${p.message}${p.name ? ` [${p.name}]` : ""}`);
    return { ok: p.name === "NonceUsed", errorName: p.name, message: p.message };
  }
}
