import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/** Named Hardhat default accounts. Index assignment: #0 deployer, #1 city, #2 bank, #3 oracle,
 *  #4 attester, #5..#9 payers 1-5, #10..#12 merchants 1-3. */
export interface Accounts {
  deployer: HardhatEthersSigner;
  city: HardhatEthersSigner;
  bank: HardhatEthersSigner;
  oracle: HardhatEthersSigner;
  attester: HardhatEthersSigner;
  payers: HardhatEthersSigner[];
  merchants: HardhatEthersSigner[];
  /** An account outside every role, for unauthorized-call tests. */
  stranger: HardhatEthersSigner;
}

export async function getAccounts(): Promise<Accounts> {
  const s = await ethers.getSigners();
  return {
    deployer: s[0],
    city: s[1],
    bank: s[2],
    oracle: s[3],
    attester: s[4],
    payers: s.slice(5, 10),
    merchants: s.slice(10, 13),
    stranger: s[13],
  };
}

export function personId(n: number): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`person-${n}`));
}
