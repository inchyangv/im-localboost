import { artifacts, ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { CAPS, MERCHANTS, ZONES, merchantAddress } from "./demo-config";
import { intEnv, readDeployRecord, roleWallets } from "./accounts";

const SHARED = path.resolve(__dirname, "..", "..", "shared");
const EXPLORERS: Record<number, string | null> = { 31337: null, 1001: "https://kairos.kaiascan.io" };

/** Writes shared/deployments.json (keyed by chainId, other chains preserved) and shared/abi/*.json. */
async function main() {
  const w = roleWallets();
  const rec = await readDeployRecord();
  const merchantKeyAddresses = w.merchants.map((m) => m.address);

  const entry = {
    chainId: rec.chainId,
    explorer: EXPLORERS[rec.chainId] ?? null,
    startBlock: rec.startBlock,
    contracts: rec.contracts,
    zones: ZONES,
    merchants: MERCHANTS.map((m) => ({
      address: merchantAddress(m, merchantKeyAddresses),
      name: m.name,
      zoneId: m.zoneId,
      categoryId: m.categoryId,
      slotBaseline: m.slotBaseline,
      keyIndex: m.keyIndex,
      roadAddress: m.roadAddress,
      lat: m.lat,
      lng: m.lng,
    })),
    caps: {
      ...CAPS,
      pendingDelay: intEnv("PENDING_DELAY", 60),
      capsDelay: intEnv("CAPS_DELAY", 60),
    },
  };

  const file = path.join(SHARED, "deployments.json");
  let all: Record<string, unknown> = {};
  if (fs.existsSync(file)) all = JSON.parse(fs.readFileSync(file, "utf8"));
  all[String(rec.chainId)] = entry;
  fs.mkdirSync(SHARED, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");

  const abiDir = path.join(SHARED, "abi");
  fs.mkdirSync(abiDir, { recursive: true });
  for (const name of ["MockIMKRW", "MerchantRegistry", "DalgubeolPay"]) {
    const art = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(abiDir, `${name}.json`), JSON.stringify(art.abi, null, 2) + "\n");
  }

  const { chainId } = await ethers.provider.getNetwork();
  console.log(`wrote ${file} [${chainId}] and ${abiDir}/{MockIMKRW,MerchantRegistry,DalgubeolPay}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
