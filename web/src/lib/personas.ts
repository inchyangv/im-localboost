// DEMO ONLY: persona accounts are built from NEXT_PUBLIC_* private keys (testnet throwaway keys).
import type { PrivateKeyAccount } from "viem/accounts";
import { accountFromKey } from "./chain";

export type Role = "payer" | "merchant" | "city" | "bank";

export interface Persona {
  id: string;
  label: string;
  role: Role;
  /** Index within the role (payer 1..5 -> 0..4, merchant 1..3 -> 0..2). */
  index: number;
  account: PrivateKeyAccount;
}

// Next.js only inlines NEXT_PUBLIC_* when accessed as literal properties, so no dynamic lookups here.
const PAYER_KEYS = process.env.NEXT_PUBLIC_PAYER_KEYS ?? "";
const MERCHANT_KEYS = process.env.NEXT_PUBLIC_MERCHANT_KEYS ?? "";
const CITY_KEY = process.env.NEXT_PUBLIC_CITY_KEY ?? "";
const BANK_KEY = process.env.NEXT_PUBLIC_BANK_KEY ?? "";

function split(value: string): string[] {
  return value
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function build(): Persona[] {
  const out: Persona[] = [];
  split(PAYER_KEYS).forEach((k, i) => {
    const account = accountFromKey(k);
    if (account) out.push({ id: `payer-${i + 1}`, label: `소비자 ${i + 1}`, role: "payer", index: i, account });
  });
  split(MERCHANT_KEYS).forEach((k, i) => {
    const account = accountFromKey(k);
    if (account) out.push({ id: `merchant-${i + 1}`, label: `가맹점 ${i + 1}`, role: "merchant", index: i, account });
  });
  const city = accountFromKey(CITY_KEY);
  if (city) out.push({ id: "city", label: "대구시", role: "city", index: 0, account: city });
  const bank = accountFromKey(BANK_KEY);
  if (bank) out.push({ id: "bank", label: "은행", role: "bank", index: 0, account: bank });
  return out;
}

export const personas: Persona[] = build();

export const ROLE_LABELS: Record<Role, string> = { payer: "소비자", merchant: "가맹점", city: "대구시", bank: "은행" };

/** Page each role works on. Selecting a persona moves the user there. */
export function roleHome(role: Role): string {
  return role === "payer" ? "/" : role === "merchant" ? "/merchant" : "/city";
}
