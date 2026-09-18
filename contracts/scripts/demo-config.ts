import { ethers } from "ethers";

/** Demo constants shared by seed.ts and write-shared.ts. Amounts are whole won. */

export interface ZoneDef {
  id: number;
  name: string;
  vulnerability: number;
}

export interface MerchantDef {
  name: string;
  zoneId: number;
  categoryId: number;
  slotBaseline: number;
  /** Index into MERCHANT_KEYS (0..2) or null for receive-only merchants. */
  keyIndex: number | null;
  /** Derivation index n for receive-only merchants (4..8). */
  derivedIndex?: number;
}

export const ZONES: ZoneDef[] = [
  { id: 1, name: "동성로", vulnerability: 0.3 },
  { id: 2, name: "들안길", vulnerability: 0.6 },
  { id: 3, name: "안지랑", vulnerability: 0.8 },
  { id: 4, name: "북성로", vulnerability: 1.0 },
  { id: 5, name: "서문시장", vulnerability: 0.7 },
];

export const CATEGORIES: Record<number, string> = { 1: "식당", 2: "카페", 3: "소매", 4: "서비스" };

export const SLOT_BASELINE = 100_000;

export const MERCHANTS: MerchantDef[] = [
  { name: "북성로 한식당", zoneId: 4, categoryId: 1, slotBaseline: SLOT_BASELINE, keyIndex: 0 },
  { name: "들안길 카페", zoneId: 2, categoryId: 2, slotBaseline: SLOT_BASELINE, keyIndex: 1 },
  { name: "서문시장 소매", zoneId: 5, categoryId: 3, slotBaseline: SLOT_BASELINE, keyIndex: 2 },
  { name: "동성로 미용실", zoneId: 1, categoryId: 4, slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 4 },
  { name: "안지랑 곱창집", zoneId: 3, categoryId: 1, slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 5 },
  { name: "북성로 카페", zoneId: 4, categoryId: 2, slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 6 },
  { name: "서문시장 세탁소", zoneId: 5, categoryId: 4, slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 7 },
  { name: "동성로 편의점", zoneId: 1, categoryId: 3, slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 8 },
];

export const SEED = {
  payerMint: 1_000_000,
  merchantMint: 500_000,
  cityMint: 5_000_000,
  zoneDeposit: 1_000_000,
  /** Zones funded at seed time. Zone 4 (북성로) stays at 0 for demo step 1. */
  fundedZones: [1, 2, 3, 5],
  zoneHourlyCap: 300_000,
};

export const CAPS = {
  maxRateBps: 1500,
  perTxBoost: 3000,
  personDailyBoost: 5000,
  slotCapBps: 15000,
};

export function personId(n: number): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`person-${n}`));
}

/** Receive-only demo merchant address, deterministic across networks. */
export function derivedMerchantAddress(n: number): string {
  const key = ethers.keccak256(ethers.toUtf8Bytes(`달구벌페이/demo-merchant/${n}`));
  return new ethers.Wallet(key).address;
}

export function merchantAddress(m: MerchantDef, merchantKeyAddresses: string[]): string {
  if (m.keyIndex !== null) return merchantKeyAddresses[m.keyIndex];
  return derivedMerchantAddress(m.derivedIndex!);
}
