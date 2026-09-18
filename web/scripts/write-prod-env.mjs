// Writes web/.env.production.local from the Kairos env file for a prebuilt Vercel deploy.
// Usage: node scripts/write-prod-env.mjs <ENGINE_URL> [ENV_FILE=.env.kairos]
// DEMO ONLY: the keys copied here are testnet throwaway keys and end up in the browser bundle.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const engineUrl = process.argv[2];
const envFile = path.resolve(root, process.argv[3] ?? ".env.kairos");

if (!engineUrl || !/^https?:\/\//.test(engineUrl)) {
  console.error("usage: node scripts/write-prod-env.mjs https://<engine-host> [.env.kairos]");
  process.exit(1);
}
if (!fs.existsSync(envFile)) {
  console.error(`env file not found: ${envFile}`);
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}
const required = ["RPC_URL", "PAYER_KEYS", "MERCHANT_KEYS", "CITY_KEY", "BANK_KEY"];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`missing in ${path.basename(envFile)}: ${missing.join(", ")}`);
  process.exit(1);
}

const out = [
  "# DEMO ONLY: testnet throwaway keys, inlined into the browser bundle",
  `NEXT_PUBLIC_CHAIN_ID=${env.CHAIN_ID ?? "1001"}`,
  `NEXT_PUBLIC_RPC_URL=${env.RPC_URL}`,
  `NEXT_PUBLIC_ENGINE_URL=${engineUrl.replace(/\/+$/, "")}`,
  "NEXT_PUBLIC_EXPLORER_URL=https://kairos.kaiascan.io",
  `NEXT_PUBLIC_PAYER_KEYS=${env.PAYER_KEYS}`,
  `NEXT_PUBLIC_MERCHANT_KEYS=${env.MERCHANT_KEYS}`,
  `NEXT_PUBLIC_CITY_KEY=${env.CITY_KEY}`,
  `NEXT_PUBLIC_BANK_KEY=${env.BANK_KEY}`,
  "",
].join("\n");

const target = path.resolve(here, "..", ".env.production.local");
fs.writeFileSync(target, out, { mode: 0o600 });
// Print key names only; never the values.
console.log(`wrote ${path.relative(root, target)} (${out.split("\n").filter((l) => l.includes("=")).length} vars)`);
