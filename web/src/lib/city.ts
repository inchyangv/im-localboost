import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { publicClient, walletFor } from "./chain";
import { caps as defaultCaps, zones, type Caps } from "./config";
import { addresses, chainNow, hourEpoch, dalgubeolPayAbi, tokenAbi } from "./contracts";
import { ensureAllowance } from "./pay";

export interface ZoneCard {
  zoneId: number;
  name: string;
  budget: bigint;
  rateBps: number;
  hourSpent: bigint;
  hourlyCap: bigint;
}

export interface PendingRow {
  id: bigint;
  personId: `0x${string}`;
  zoneId: number;
  amount: bigint;
  releaseAt: number;
  status: number;
}

async function readLB<T>(functionName: string, args: unknown[] = []): Promise<T> {
  return (await publicClient.readContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName, args })) as T;
}

async function writeLB(account: PrivateKeyAccount, functionName: string, args: unknown[]): Promise<Hex> {
  const { request } = await publicClient.simulateContract({ account, address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName, args });
  const hash = await walletFor(account).writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function readZoneCards(): Promise<{ cards: ZoneCard[]; now: number; epoch: number }> {
  const now = await chainNow();
  const epoch = hourEpoch(now);
  const cards = await Promise.all(
    zones.map(async (z) => {
      const [budget, rateBps, hourSpent, hourlyCap] = await Promise.all([
        readLB<bigint>("zoneBudget", [z.id]),
        readLB<number>("currentRate", [z.id]),
        readLB<bigint>("zoneHourSpent", [z.id, BigInt(epoch)]),
        readLB<bigint>("zoneHourlyCap", [z.id]),
      ]);
      return { zoneId: z.id, name: z.name, budget, rateBps: Number(rateBps), hourSpent, hourlyCap };
    }),
  );
  return { cards, now, epoch };
}

export async function cityBalance(address: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [address] })) as bigint;
}

/** approve (if needed) then depositBudget. Returns both hashes. */
export async function depositBudget(
  city: PrivateKeyAccount,
  zoneId: number,
  amount: bigint,
  onStep?: (m: string) => void,
): Promise<{ approveHash: Hex | null; hash: Hex }> {
  const bal = await cityBalance(city.address);
  if (bal < amount) throw new Error(`대구시 계정의 iMKRW 잔액이 부족합니다 (잔액 ${bal.toLocaleString("ko-KR")}원)`);
  const approveHash = await ensureAllowance(city, amount, onStep);
  onStep?.("depositBudget 전송 중…");
  const hash = await writeLB(city, "depositBudget", [zoneId, amount]);
  return { approveHash, hash };
}

export async function readCaps(): Promise<{ caps: Caps; pending: Caps; readyAt: number }> {
  const toCaps = (t: readonly unknown[]): Caps => ({
    maxRateBps: Number(t[0]),
    perTxBoost: Number(t[1]),
    personDailyBoost: Number(t[2]),
    slotCapBps: Number(t[3]),
    pendingDelay: Number(t[4]),
    capsDelay: Number(t[5]),
  });
  const [c, p, r] = await Promise.all([
    readLB<readonly unknown[]>("caps"),
    readLB<readonly unknown[]>("pendingCaps"),
    readLB<bigint>("capsReadyAt"),
  ]);
  return { caps: toCaps(c), pending: toCaps(p), readyAt: Number(r) };
}

export function capsTuple(c: Caps) {
  return {
    maxRateBps: c.maxRateBps,
    perTxBoost: BigInt(c.perTxBoost),
    personDailyBoost: BigInt(c.personDailyBoost),
    slotCapBps: c.slotCapBps,
    pendingDelay: c.pendingDelay,
    capsDelay: c.capsDelay,
  };
}

export const proposeCaps = (city: PrivateKeyAccount, c: Caps) => writeLB(city, "proposeCaps", [capsTuple(c)]);
export const applyCaps = (anyone: PrivateKeyAccount) => writeLB(anyone, "applyCaps", []);
export const releasePending = (anyone: PrivateKeyAccount, id: bigint) => writeLB(anyone, "release", [id]);
export const clawbackPending = (bank: PrivateKeyAccount, id: bigint) => writeLB(bank, "clawback", [id]);

export async function listPending(onlyOpen = true): Promise<PendingRow[]> {
  const next = await readLB<bigint>("nextPendingId");
  const ids: bigint[] = [];
  for (let i = 1n; i < next; i++) ids.push(i);
  const rows = await Promise.all(
    ids.map(async (id) => {
      const p = await readLB<readonly [`0x${string}`, number, bigint, bigint, number]>("pendings", [id]);
      return { id, personId: p[0], zoneId: Number(p[1]), amount: p[2], releaseAt: Number(p[3]), status: Number(p[4]) };
    }),
  );
  return onlyOpen ? rows.filter((r) => r.status === 0) : rows;
}

export const DEFAULT_CAPS = defaultCaps;
