import { isAddress } from "viem";
import { merchantByAddress, type Merchant } from "./config";

/**
 * Merchant-presented (MPM) payment QR. The QR carries a URL of this site so a phone camera opens it
 * directly, and the in-app scanner parses the same URL. Nothing here touches signatures or amounts
 * on-chain: it only pre-fills the consumer pay screen (SPEC 7.1).
 */
export const PAY_PATH = "/pay";
export const MIN_QR_AMOUNT = 1_000;
export const MAX_QR_AMOUNT = 100_000_000;
const REF_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const REF_LENGTH = 8;

export interface PayRequest {
  merchant: `0x${string}`;
  amount: number;
  /** Optional 8-char reference the merchant screen uses to match the incoming payment. */
  ref: string | null;
}

export function newRef(): string {
  const bytes = new Uint8Array(REF_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

export function buildPayUrl(origin: string, req: PayRequest): string {
  const u = new URL(PAY_PATH, origin);
  u.searchParams.set("m", req.merchant);
  u.searchParams.set("a", String(req.amount));
  if (req.ref) u.searchParams.set("r", req.ref);
  return u.toString();
}

export type ParseError = "not_pay_url" | "bad_merchant" | "unknown_merchant" | "bad_amount";

export interface ParsedPay {
  request: PayRequest;
  merchantInfo: Merchant;
}

/** Parses a scanned/pasted string or the current page's search params. `origin` restricts to this site when given. */
export function parsePayInput(input: string, origin?: string): { ok: true; value: ParsedPay } | { ok: false; error: ParseError } {
  let params: URLSearchParams;
  try {
    const u = new URL(input.trim(), origin ?? "http://localhost");
    if (u.pathname !== PAY_PATH) return { ok: false, error: "not_pay_url" };
    if (origin && u.origin !== origin) return { ok: false, error: "not_pay_url" };
    params = u.searchParams;
  } catch {
    return { ok: false, error: "not_pay_url" };
  }
  return parsePayParams(params);
}

export function parsePayParams(params: URLSearchParams): { ok: true; value: ParsedPay } | { ok: false; error: ParseError } {
  const m = params.get("m") ?? "";
  const a = params.get("a") ?? "";
  const r = params.get("r");
  if (!isAddress(m)) return { ok: false, error: "bad_merchant" };
  const info = merchantByAddress(m);
  if (!info) return { ok: false, error: "unknown_merchant" };
  if (!/^\d{1,9}$/.test(a)) return { ok: false, error: "bad_amount" };
  const amount = parseInt(a, 10);
  if (amount < MIN_QR_AMOUNT || amount > MAX_QR_AMOUNT) return { ok: false, error: "bad_amount" };
  const ref = r && /^[a-z0-9]{1,16}$/.test(r) ? r : null;
  return { ok: true, value: { request: { merchant: info.address, amount, ref }, merchantInfo: info } };
}

export const PARSE_ERROR_MESSAGES: Record<ParseError, string> = {
  not_pay_url: "달구벌페이 결제 QR이 아니에요.",
  bad_merchant: "가맹점 주소가 올바르지 않아요.",
  unknown_merchant: "등록되지 않은 가맹점이에요.",
  bad_amount: `결제 금액은 ${MIN_QR_AMOUNT.toLocaleString("ko-KR")}원 이상의 정수여야 해요.`,
};
