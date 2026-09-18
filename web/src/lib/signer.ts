// A signer is either a demo persona (private key in the bundle, demo only) or the user's own
// browser wallet. Payment code only depends on this interface.
import type { PrivateKeyAccount } from "viem/accounts";
import { walletFor } from "./chain";
import { walletClientFor, type AppWalletClient, type Eip1193 } from "./wallet";

export type SignerKind = "persona" | "wallet";

export interface Signer {
  kind: SignerKind;
  address: `0x${string}`;
  wallet: AppWalletClient;
}

export function personaSigner(account: PrivateKeyAccount): Signer {
  return { kind: "persona", address: account.address, wallet: walletFor(account) as unknown as AppWalletClient };
}

export function walletSigner(provider: Eip1193, address: `0x${string}`): Signer {
  return { kind: "wallet", address, wallet: walletClientFor(provider, address) };
}

export function isSigner(x: unknown): x is Signer {
  return typeof x === "object" && x !== null && "kind" in x && "wallet" in x;
}

export function toSigner(x: PrivateKeyAccount | Signer): Signer {
  return isSigner(x) ? x : personaSigner(x);
}
