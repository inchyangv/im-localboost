import type { Signer, TypedDataDomain, TypedDataField } from "ethers";

export interface AttestationStruct {
  payer: string;
  merchant: string;
  amount: bigint | number;
  tier: number;
  nonce: bigint | number;
  deadline: bigint | number;
}

export const ATTESTATION_TYPES: Record<string, TypedDataField[]> = {
  Attestation: [
    { name: "payer", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "tier", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export function attestationDomain(contractAddress: string, chainId: bigint | number): TypedDataDomain {
  return { name: "DalgubeolPay", version: "1", chainId, verifyingContract: contractAddress };
}

/** Sign an Attestation with the EIP-712 domain DalgubeolPay/1 bound to the given contract. */
export async function signAttestation(
  signer: Signer,
  contractAddress: string,
  chainId: bigint | number,
  att: AttestationStruct,
): Promise<string> {
  return signer.signTypedData(attestationDomain(contractAddress, chainId), ATTESTATION_TYPES, att);
}
