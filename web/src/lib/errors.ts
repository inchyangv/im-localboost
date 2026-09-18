import { BaseError, ContractFunctionRevertedError } from "viem";

/** Custom error name -> Korean message. Names are fixed by the contract interface. */
export const ERROR_MESSAGES: Record<string, string> = {
  UnregisteredPayer: "등록되지 않은 결제자입니다 (personId 없음)",
  BadSigner: "서명자가 등록된 attester가 아닙니다",
  AttestationMismatch: "서명 내용이 결제 내용과 일치하지 않습니다",
  AttestationExpired: "서명이 만료되었습니다",
  NonceUsed: "이미 사용된 서명입니다 (재사용 차단)",
  MerchantInactive: "비활성 가맹점입니다",
  InsufficientCredit: "크레딧 잔액이 부족합니다",
  CreditExceedsAmount: "크레딧 사용액이 결제 금액을 초과합니다",
  RateTooHigh: "보너스율이 상한(maxRateBps)을 초과합니다",
  BadEpoch: "현재 또는 다음 시간에만 율을 게시할 수 있습니다",
  LengthMismatch: "상권 배열과 율 배열의 길이가 다릅니다",
  CapsNotProposed: "제안된 상한이 없습니다",
  CapsNotReady: "상한 변경 대기 시간이 지나지 않았습니다",
  NotPending: "보류 상태가 아닙니다 (이미 지급 또는 환수됨)",
  NotReleasable: "아직 지급 가능 시각이 되지 않았습니다",
  PersonAlreadyLinked: "이 personId에는 이미 다른 지갑이 연결되어 있습니다",
  ZeroAddress: "주소가 비어 있습니다",
  ZeroPerson: "personId가 비어 있습니다",
  AccessControlUnauthorizedAccount: "이 계정에는 해당 권한(역할)이 없습니다",
  ERC20InsufficientBalance: "iMKRW 잔액이 부족합니다",
  ERC20InsufficientAllowance: "iMKRW 사용 승인(allowance)이 부족합니다",
};

/** Engine reason code -> Korean label. */
export const REASON_LABELS: Record<string, string> = {
  backflow: "환류",
  pair_repeat: "쌍 반복",
  new_wallet_cluster: "신규 지갑 군집",
  sales_spike: "매출 이탈",
  model_score: "모델 점수",
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code;
}

export interface ParsedError {
  name: string | null;
  message: string;
}

/** Finds the custom error inside a viem error tree and maps it to Korean. Unknown names are shown as is. */
export function parseChainError(err: unknown): ParsedError {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.signature ?? null;
      if (name) return { name, message: ERROR_MESSAGES[name] ?? `컨트랙트 오류: ${name}` };
      return { name: null, message: revert.shortMessage };
    }
    // Hardhat node reports custom errors in the RPC message when the call is not simulated first.
    const m = /custom error '([A-Za-z0-9_]+)\(/.exec(err.message);
    if (m) return { name: m[1], message: ERROR_MESSAGES[m[1]] ?? `컨트랙트 오류: ${m[1]}` };
    return { name: null, message: err.shortMessage || err.message };
  }
  if (err instanceof Error) return { name: null, message: err.message };
  return { name: null, message: String(err) };
}
