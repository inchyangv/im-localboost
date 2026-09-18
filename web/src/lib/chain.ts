// DEMO ONLY: private keys are read from public env vars. Never do this in production.
// The persona accounts below are testnet/local throwaway keys inlined into the browser bundle.
import { createPublicClient, createWalletClient, defineChain, http, type Chain } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { chainId, rpcUrl } from "./config";

export const hardhatLocal: Chain = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

export const kairos: Chain = defineChain({
  id: 1001,
  name: "Kaia Kairos",
  nativeCurrency: { name: "KAIA", symbol: "KAIA", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "KaiaScan", url: "https://kairos.kaiascan.io" } },
  testnet: true,
});

export const chain: Chain =
  chainId === 1001
    ? kairos
    : chainId === 31337
      ? hardhatLocal
      : defineChain({
          id: chainId,
          name: `chain-${chainId}`,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [rpcUrl] } },
        });

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

export function accountFromKey(key: string): PrivateKeyAccount | null {
  const k = key.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
  try {
    return privateKeyToAccount(k as `0x${string}`);
  } catch {
    return null;
  }
}

export function walletFor(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}
