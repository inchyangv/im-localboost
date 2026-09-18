import { ethers } from "ethers";
import DIRECTORY from "./merchant-directory.json";

/** Demo constants shared by seed.ts and write-shared.ts. Amounts are whole won. */

export interface ZoneDef {
  id: number;
  name: string;
  vulnerability: number;
  /** Zone centre for the partner map. */
  lat: number;
  lng: number;
}

export interface MerchantDef {
  name: string;
  zoneId: number;
  categoryId: number;
  /** Display-only subcategory for the map filter (e.g. 분식, 베이커리). */
  tag: string;
  slotBaseline: number;
  /** Street address shown on the map card (demo data based on real Daegu places; no affiliation). */
  roadAddress: string;
  /** Approximate WGS84 coordinates for the partner map. */
  lat: number;
  lng: number;
  /** Index into MERCHANT_KEYS (0..2) or null for receive-only merchants. */
  keyIndex: number | null;
  /** Derivation index n for receive-only merchants (4..8). */
  derivedIndex?: number;
}

export const ZONES: ZoneDef[] = [
  { id: 1, name: "동성로", vulnerability: 0.3, lat: 35.8693, lng: 128.5951 },
  { id: 2, name: "들안길", vulnerability: 0.6, lat: 35.8388, lng: 128.6172 },
  { id: 3, name: "안지랑", vulnerability: 0.8, lat: 35.8383, lng: 128.5766 },
  { id: 4, name: "북성로", vulnerability: 1.0, lat: 35.8737, lng: 128.5893 },
  { id: 5, name: "서문시장", vulnerability: 0.7, lat: 35.8697, lng: 128.5818 },
];

export const CATEGORIES: Record<number, string> = { 1: "식당", 2: "카페", 3: "소매", 4: "서비스" };

export const SLOT_BASELINE = 100_000;

// Demo merchants: independent small shops placed in each zone's real streets. Names are fictional or
// modelled on local independents (no franchises, no affiliation); coordinates are approximate.
// zoneId/categoryId are on-chain, the rest is display data. The first eight are the original seed set
// (keyed merchants 0..2 and receive-only 4..8); merchant-directory.json adds receive-only merchants 9+.
const CORE_MERCHANTS: MerchantDef[] = [
  { name: "북성로 연탄불고기 소나무식당", zoneId: 4, categoryId: 1, tag: "고기", slotBaseline: SLOT_BASELINE, keyIndex: 0, roadAddress: "대구 중구 북성로 (연탄불고기 골목)", lat: 35.8741, lng: 128.5889 },
  { name: "들안길 동네 로스터리", zoneId: 2, categoryId: 2, tag: "카페", slotBaseline: SLOT_BASELINE, keyIndex: 1, roadAddress: "대구 수성구 들안로 (들안길 먹거리타운)", lat: 35.8391, lng: 128.6168 },
  { name: "서문시장 대구건어물상회", zoneId: 5, categoryId: 3, tag: "반찬·식료품", slotBaseline: SLOT_BASELINE, keyIndex: 2, roadAddress: "대구 중구 큰장로26길 (서문시장 1지구)", lat: 35.8701, lng: 128.5822 },
  { name: "동성로 골목 헤어살롱", zoneId: 1, categoryId: 4, tag: "미용", slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 4, roadAddress: "대구 중구 동성로 (동성로 상권)", lat: 35.8689, lng: 128.5956 },
  { name: "충북곱창 안지랑 곱창골목", zoneId: 3, categoryId: 1, tag: "고기", slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 5, roadAddress: "대구 남구 대명로36길 (안지랑 곱창골목)", lat: 35.8380, lng: 128.5770 },
  { name: "믹스카페 북성로", zoneId: 4, categoryId: 2, tag: "카페", slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 6, roadAddress: "대구 중구 북성로 (공구골목)", lat: 35.8733, lng: 128.5899 },
  { name: "서문시장 4지구 옷수선", zoneId: 5, categoryId: 4, tag: "수선·세탁", slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 7, roadAddress: "대구 중구 큰장로 (서문시장 4지구)", lat: 35.8694, lng: 128.5812 },
  { name: "동성로 옛날 빵집", zoneId: 1, categoryId: 2, tag: "베이커리", slotBaseline: SLOT_BASELINE, keyIndex: null, derivedIndex: 8, roadAddress: "대구 중구 중앙대로 (동성로 입구)", lat: 35.8700, lng: 128.5940 },
];

export const MERCHANTS: MerchantDef[] = [
  ...CORE_MERCHANTS,
  ...DIRECTORY.map((d) => ({ ...d, slotBaseline: SLOT_BASELINE, keyIndex: null })),
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
