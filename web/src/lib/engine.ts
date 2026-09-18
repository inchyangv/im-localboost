import { engineUrl } from "./config";

export interface AttestResponse {
  tier: number;
  score: number;
  reasons: string[];
  attestation: { payer: `0x${string}`; merchant: `0x${string}`; amount: number; tier: number; nonce: string; deadline: number };
  signature: `0x${string}`;
}

export interface RateRow {
  zoneId: number;
  name: string;
  bps: number;
  slack: number;
  predictedSales: number;
  baseline: number;
}

export interface PublishResponse {
  txHash: string;
  nextTxHash: string;
  rates: RateRow[];
}

export interface RiskLogRow {
  ts: number;
  payer: string;
  merchant: string;
  amount: number;
  tier: number;
  score: number;
  reasons: string[];
}

export interface PaymentRow {
  ts: number;
  txHash: string;
  blockNumber: number;
  payer: string;
  personId: string;
  merchant: string;
  zoneId: number;
  amount: number;
  useCredit: number;
  boost: number;
  tier: number;
  pendingId: number;
}

export interface HealthResponse {
  ok: boolean;
  chainId: number;
  contract: string;
  lastBlock: number | null;
  dbPath: string;
  model?: boolean;
}

export interface OnboardResponse {
  wallet: string;
  personId: string;
  registered: boolean;
  personTx: string | null;
  minted: number;
  mintTx: string | null;
  mintedToday: boolean;
  mintAmount: number;
  gasSentWei: string;
  gasTx: string | null;
  balance: number;
}

export interface OnboardStatus {
  wallet: string;
  registered: boolean;
  personId: string | null;
  mintedToday: boolean;
  mintAmount: number;
  gasWei: string;
}

export class EngineError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${engineUrl}${path}`, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    throw new EngineError(`엔진에 연결할 수 없습니다 (${engineUrl})`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new EngineError(`엔진 오류 ${res.status}: ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const attest = (payer: string, merchant: string, amount: number) =>
  call<AttestResponse>("/attest", json({ payer, merchant, amount }));
export const ratesCurrent = () => call<RateRow[]>("/rates/current");
export const ratesPublish = (overrides: Record<string, number> = {}) =>
  call<PublishResponse>("/rates/publish", json({ overrides }), 120_000);
export const riskLog = (limit = 50) => call<RiskLogRow[]>(`/risk/log?limit=${limit}`);
export const payments = (params: { merchant?: string; payer?: string; limit?: number } = {}) => {
  const q = new URLSearchParams();
  if (params.merchant) q.set("merchant", params.merchant);
  if (params.payer) q.set("payer", params.payer);
  q.set("limit", String(params.limit ?? 50));
  return call<PaymentRow[]>(`/payments?${q.toString()}`);
};
export const health = () => call<HealthResponse>("/health", undefined, 5_000);

export interface TransferRow {
  ts: number;
  txHash: string;
  blockNumber: number;
  from: string;
  to: string;
  amount: number;
}

/** iMKRW Transfer logs the poller stored (settlement requests/payouts are plain transfers). */
export const transfers = (params: { from?: string; to?: string; limit?: number } = {}) => {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.limit) q.set("limit", String(params.limit));
  return call<TransferRow[]>(`/transfers?${q.toString()}`);
};
/** Bank-side onboarding for a browser wallet: personId link, starter iMKRW, gas top-up (three txs, allow time). */
export const onboard = (wallet: string) => call<OnboardResponse>("/onboard", json({ wallet }), 180_000);
export const onboardStatus = (wallet: string) => call<OnboardStatus>(`/onboard/status?wallet=${encodeURIComponent(wallet)}`);
