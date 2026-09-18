import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Environment file selection: ENV_FILE=.env.kairos for testnet, .env (repo root) by default.
const envFile = process.env.ENV_FILE ?? ".env";
dotenv.config({ path: path.resolve(__dirname, "..", envFile), quiet: true });

function keyList(): string[] {
  const single = ["DEPLOYER_KEY", "CITY_KEY", "BANK_KEY", "ORACLE_KEY", "ATTESTER_KEY"]
    .map((k) => process.env[k] ?? "")
    .filter((k) => k.length > 0);
  const multi = ["PAYER_KEYS", "MERCHANT_KEYS"]
    .flatMap((k) => (process.env[k] ?? "").split(","))
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  return [...single, ...multi];
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    kairos: {
      url: process.env.KAIROS_RPC_URL ?? "https://public-en-kairos.node.kaia.io",
      chainId: 1001,
      accounts: keyList(),
    },
  },
};

export default config;
