import { getContract, type Abi } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import localBoostAbiJson from "@shared/abi/LocalBoost.json";
import registryAbiJson from "@shared/abi/MerchantRegistry.json";
import tokenAbiJson from "@shared/abi/MockIMKRW.json";
import { publicClient, walletFor } from "./chain";
import { caps, deployment } from "./config";

export const localBoostAbi = localBoostAbiJson as Abi;
export const registryAbi = registryAbiJson as Abi;
export const tokenAbi = tokenAbiJson as Abi;

const ZERO = "0x0000000000000000000000000000000000000000" as const;
export const addresses = {
  LocalBoost: deployment?.contracts.LocalBoost ?? ZERO,
  MerchantRegistry: deployment?.contracts.MerchantRegistry ?? ZERO,
  MockIMKRW: deployment?.contracts.MockIMKRW ?? ZERO,
};

export function localBoost(account?: PrivateKeyAccount) {
  return getContract({
    address: addresses.LocalBoost,
    abi: localBoostAbi,
    client: account ? { public: publicClient, wallet: walletFor(account) } : publicClient,
  });
}

export function registry(account?: PrivateKeyAccount) {
  return getContract({
    address: addresses.MerchantRegistry,
    abi: registryAbi,
    client: account ? { public: publicClient, wallet: walletFor(account) } : publicClient,
  });
}

export function token(account?: PrivateKeyAccount) {
  return getContract({
    address: addresses.MockIMKRW,
    abi: tokenAbi,
    client: account ? { public: publicClient, wallet: walletFor(account) } : publicClient,
  });
}

async function read<T>(address: `0x${string}`, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> {
  return (await publicClient.readContract({ address, abi, functionName, args })) as T;
}

export const hourEpoch = (ts: number) => Math.floor(ts / 3600);
export const kstDay = (ts: number) => Math.floor((ts + 9 * 3600) / 86400);

/** Latest block timestamp; the chain's clock, which may drift from the wall clock on Hardhat. */
export async function chainNow(): Promise<number> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return Number(block.timestamp);
}

export interface BoostState {
  now: number;
  epoch: number;
  day: number;
  personId: `0x${string}`;
  pairDay: number;
  currentRate: number;
  slotVolume: bigint;
  slotBaseline: bigint;
  slotCap: bigint;
  personDay: bigint;
  zoneHourSpent: bigint;
  zoneHourlyCap: bigint;
  zoneBudget: bigint;
  credit: bigint;
  merchantActive: boolean;
}

/** Everything the zero-bonus reason list needs, read with individual readContract calls
 *  (no multicall dependency). */
export async function readBoostState(
  payer: `0x${string}`,
  merchant: `0x${string}`,
  zoneId: number,
): Promise<BoostState> {
  const now = await chainNow();
  const epoch = hourEpoch(now);
  const day = kstDay(now);
  const lb = addresses.LocalBoost;
  const personId = await read<`0x${string}`>(addresses.MerchantRegistry, registryAbi, "personOf", [payer]);
  const m = await read<{ zoneId: number; categoryId: number; active: boolean; slotBaseline: bigint }>(
    addresses.MerchantRegistry,
    registryAbi,
    "get",
    [merchant],
  );
  const [pairDay, currentRate, slotVolume, personDay, zoneHourSpent, zoneHourlyCap, zoneBudget, credit] =
    await Promise.all([
      read<bigint>(lb, localBoostAbi, "pairDay", [personId, merchant]),
      read<number>(lb, localBoostAbi, "currentRate", [zoneId]),
      read<bigint>(lb, localBoostAbi, "slotVolume", [merchant, BigInt(epoch)]),
      read<bigint>(lb, localBoostAbi, "personDay", [personId, BigInt(day)]),
      read<bigint>(lb, localBoostAbi, "zoneHourSpent", [zoneId, BigInt(epoch)]),
      read<bigint>(lb, localBoostAbi, "zoneHourlyCap", [zoneId]),
      read<bigint>(lb, localBoostAbi, "zoneBudget", [zoneId]),
      read<bigint>(lb, localBoostAbi, "creditOf", [personId]),
    ]);
  const slotBaseline = BigInt(m.slotBaseline);
  return {
    now,
    epoch,
    day,
    personId,
    pairDay: Number(pairDay),
    currentRate: Number(currentRate),
    slotVolume,
    slotBaseline,
    slotCap: (slotBaseline * BigInt(caps.slotCapBps)) / 10000n,
    personDay,
    zoneHourSpent,
    zoneHourlyCap,
    zoneBudget,
    credit,
    merchantActive: m.active,
  };
}
