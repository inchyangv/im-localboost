import { explorer } from "./config";

/** 1234567 -> "1,234,567원". Accepts bigint or number (whole won only). */
export function won(v: bigint | number | string): string {
  const n = typeof v === "bigint" ? v : BigInt(Math.trunc(Number(v)));
  return `${n.toLocaleString("ko-KR")}원`;
}

export function num(v: bigint | number): string {
  return (typeof v === "bigint" ? v : BigInt(Math.trunc(v))).toLocaleString("ko-KR");
}

/** 1000 bps -> "10.0%". */
export function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export function short(addr: string, n = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, 2 + n)}…${addr.slice(-n)}`;
}

/** KST wall time from a unix timestamp. */
export function kst(ts: number): string {
  return new Date(ts * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export function kstTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export function txUrl(hash: string): string | null {
  return explorer ? `${explorer.replace(/\/$/, "")}/tx/${hash}` : null;
}

export function addressUrl(addr: string): string | null {
  return explorer ? `${explorer.replace(/\/$/, "")}/address/${addr}` : null;
}
