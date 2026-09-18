import { ethers } from "hardhat";
import { Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";

/** Role wallets built from the environment file (loaded by hardhat.config.ts), bound to the
 *  active network provider. Works the same on localhost (Hardhat default keys) and Kairos. */
export interface RoleWallets {
  deployer: Wallet;
  city: Wallet;
  bank: Wallet;
  oracle: Wallet;
  attester: Wallet;
  payers: Wallet[];
  merchants: Wallet[];
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing ${name} in environment file`);
  return v;
}

function list(name: string, count: number): string[] {
  const keys = need(name)
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (keys.length !== count) throw new Error(`${name} must contain ${count} keys, got ${keys.length}`);
  return keys;
}

export function roleWallets(): RoleWallets {
  const p = ethers.provider;
  return {
    deployer: new Wallet(need("DEPLOYER_KEY"), p),
    city: new Wallet(need("CITY_KEY"), p),
    bank: new Wallet(need("BANK_KEY"), p),
    oracle: new Wallet(need("ORACLE_KEY"), p),
    attester: new Wallet(need("ATTESTER_KEY"), p),
    payers: list("PAYER_KEYS", 5).map((k) => new Wallet(k, p)),
    merchants: list("MERCHANT_KEYS", 3).map((k) => new Wallet(k, p)),
  };
}

export interface DeployRecord {
  chainId: number;
  startBlock: number;
  contracts: { MockIMKRW: string; MerchantRegistry: string; LocalBoost: string };
}

export function deployRecordPath(chainId: number | bigint): string {
  return path.resolve(__dirname, "..", `.deploy-${chainId}.json`);
}

export function writeDeployRecord(rec: DeployRecord): void {
  fs.writeFileSync(deployRecordPath(rec.chainId), JSON.stringify(rec, null, 2) + "\n");
}

export async function readDeployRecord(): Promise<DeployRecord> {
  const { chainId } = await ethers.provider.getNetwork();
  const p = deployRecordPath(chainId);
  if (!fs.existsSync(p)) throw new Error(`deploy record ${p} not found; run scripts/deploy.ts first`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as DeployRecord;
}

export function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`${name} must be an integer`);
  return n;
}
