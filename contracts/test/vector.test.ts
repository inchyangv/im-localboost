import { expect } from "chai";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { ATTESTATION_TYPES, attestationDomain, signAttestation } from "./eip712";

// Fixed vector shared with the Python engine (engine/tests/test_signer.py).
// Hardhat default account #4 is the attester; the verifying contract is a fixed constant.
const ATTESTER_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";
const PAYER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"; // account #5
const MERCHANT = "0xBcd4042DE499D14e55001CcbB24a551F3b954096"; // account #10
const VERIFYING_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CHAIN_ID = 31337;

const VECTOR_PATH = path.resolve(__dirname, "..", "..", "shared", "test-vectors", "attestation.json");

describe("EIP-712 attestation test vector", () => {
  it("writes shared/test-vectors/attestation.json (or matches the existing one)", async () => {
    const wallet = new ethers.Wallet(ATTESTER_KEY);
    const message = {
      payer: PAYER,
      merchant: MERCHANT,
      amount: 10000,
      tier: 0,
      nonce: 12345,
      deadline: 1900000000,
    };
    const signature = await signAttestation(wallet, VERIFYING_CONTRACT, CHAIN_ID, message);
    expect(signature).to.match(/^0x[0-9a-f]{130}$/);

    const domain = attestationDomain(VERIFYING_CONTRACT, CHAIN_ID);
    const recovered = ethers.verifyTypedData(domain, ATTESTATION_TYPES, message, signature);
    expect(recovered).to.equal(wallet.address);

    const vector = {
      domain: { name: "DalgubeolPay", version: "1", chainId: CHAIN_ID, verifyingContract: VERIFYING_CONTRACT },
      types: ATTESTATION_TYPES,
      primaryType: "Attestation",
      message,
      signerKey: ATTESTER_KEY,
      signer: wallet.address,
      signature,
    };
    const json = JSON.stringify(vector, null, 2) + "\n";

    if (fs.existsSync(VECTOR_PATH)) {
      const existing = fs.readFileSync(VECTOR_PATH, "utf8");
      expect(existing, "existing vector differs from freshly signed one").to.equal(json);
    } else {
      fs.mkdirSync(path.dirname(VECTOR_PATH), { recursive: true });
      fs.writeFileSync(VECTOR_PATH, json);
    }
  });
});
