import deployments from "@shared/deployments.json";

export interface Zone {
  id: number;
  name: string;
  vulnerability: number;
}

export interface Merchant {
  address: `0x${string}`;
  name: string;
  zoneId: number;
  categoryId: number;
  slotBaseline: number;
  keyIndex: number | null;
}

export interface Caps {
  maxRateBps: number;
  perTxBoost: number;
  personDailyBoost: number;
  slotCapBps: number;
  pendingDelay: number;
  capsDelay: number;
}

export interface Deployment {
  chainId: number;
  explorer: string | null;
  startBlock: number;
  contracts: { MockIMKRW: `0x${string}`; MerchantRegistry: `0x${string}`; DalgubeolPay: `0x${string}` };
  zones: Zone[];
  merchants: Merchant[];
  caps: Caps;
}

export const CATEGORY_NAMES: Record<number, string> = { 1: "식당", 2: "카페", 3: "소매", 4: "서비스" };

export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
export const engineUrl = (process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const explorerEnv = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "";

const all = deployments as unknown as Record<string, Deployment>;

/** Deployment entry for NEXT_PUBLIC_CHAIN_ID, or null when shared/deployments.json has no entry. */
export const deployment: Deployment | null = all[String(chainId)] ?? null;

export const zones: Zone[] = deployment?.zones ?? [];
export const merchants: Merchant[] = deployment?.merchants ?? [];
export const caps: Caps = deployment?.caps ?? {
  maxRateBps: 1500,
  perTxBoost: 3000,
  personDailyBoost: 5000,
  slotCapBps: 15000,
  pendingDelay: 60,
  capsDelay: 60,
};
export const explorer: string | null = explorerEnv || deployment?.explorer || null;

export function zoneName(id: number): string {
  return zones.find((z) => z.id === id)?.name ?? `상권 ${id}`;
}

export function merchantByAddress(address: string): Merchant | undefined {
  const a = address.toLowerCase();
  return merchants.find((m) => m.address.toLowerCase() === a);
}

/** Human label for the configured chain, shown in the top bar and footer. */
export function chainLabel(id: number): string {
  if (id === 31337) return "로컬 체인";
  if (id === 1001) return "Kaia Kairos";
  return `chain ${id}`;
}
