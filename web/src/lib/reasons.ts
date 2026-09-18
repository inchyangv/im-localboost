import type { BoostState } from "./contracts";
import { caps } from "./config";
import { reasonLabel } from "./errors";

export interface ReasonInput {
  state: BoostState;
  amount: bigint;
  useCredit: bigint;
  /** Engine tier when an attestation exists; undefined for the pre-payment preview. */
  tier?: number;
  engineReasons?: string[];
}

/** First matching zero-bonus reason in the fixed display order. Null when a bonus is expected. */
export function zeroBoostReason(input: ReasonInput): string | null {
  const { state, amount, useCredit, tier, engineReasons = [] } = input;
  const codes = engineReasons.map(reasonLabel).join(", ");
  if (tier !== undefined && tier >= 2) return `위험 등급 2: 보너스 미지급${codes ? ` (${codes})` : ""}`;
  if (amount > 0n && useCredit === amount) return "크레딧 결제분에는 보너스가 없음";
  if (state.pairDay === state.day) return "오늘 이미 보너스를 받은 가게";
  if (state.currentRate === 0) return "현재 시간 보너스율 0%";
  if (state.slotVolume >= state.slotCap) return "가맹점 슬롯 상한 도달";
  if (state.personDay >= BigInt(caps.personDailyBoost)) return "오늘 개인 보너스 한도 소진";
  if (state.zoneHourSpent >= state.zoneHourlyCap) return "상권 시간당 한도 소진";
  if (state.zoneBudget === 0n) return "상권 예산 소진";
  return null;
}

export function pendingNote(releaseAt: number, now: number, engineReasons: string[] = []): string {
  const secs = Math.max(0, releaseAt - now);
  const codes = engineReasons.map(reasonLabel).join(", ");
  return `보류: ${secs}초 뒤 지급 가능${codes ? ` (${codes})` : ""}`;
}
