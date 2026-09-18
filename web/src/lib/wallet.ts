// Browser wallet support. Kaia Wallet (window.klaytn) is the primary target; any EIP-1193 provider
// such as MetaMask (window.ethereum) also works. The user's keys never touch this code: every
// transaction is signed inside the wallet extension.
import { createWalletClient, custom, getAddress, hexToNumber, numberToHex, type Account, type Chain, type EIP1193Provider, type Transport, type WalletClient } from "viem";
import { chain, publicClient } from "./chain";
import { chainId, explorer, rpcUrl } from "./config";

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  isKaikas?: boolean;
  isKaiaWallet?: boolean;
}

/** Kaia Wallet (formerly Kaikas) extension object. Built on the MetaMask provider but the RPC
 *  namespace is `klay_*` and connection goes through `enable()`. */
export interface KaiaProvider extends Eip1193 {
  enable?(): Promise<string[]>;
  selectedAddress?: string | null;
  networkVersion?: string | number | null;
}

declare global {
  interface Window {
    ethereum?: Eip1193;
    kaia?: KaiaProvider;
    klaytn?: KaiaProvider;
  }
}

export type AppWalletClient = WalletClient<Transport, Chain, Account>;

export const KAIA_WALLET_URL = "https://www.kaiawallet.io/";

export interface DetectedProvider {
  /** Normalised EIP-1193 provider (Kaia Wallet is wrapped so viem can drive it). */
  provider: Eip1193;
  kind: "kaia" | "eip1193";
  name: string;
}

function isKaia(p: KaiaProvider | Eip1193 | undefined | null): p is KaiaProvider {
  return !!p && (!!(p as KaiaProvider).enable || !!p.isKaikas || !!p.isKaiaWallet);
}

/** Kaia Wallet first (window.klaytn / window.kaia), then any injected EIP-1193 provider. */
export function detectProvider(): DetectedProvider | null {
  if (typeof window === "undefined") return null;
  const kaia = window.klaytn ?? window.kaia;
  if (isKaia(kaia)) return { provider: wrapKaia(kaia), kind: "kaia", name: "Kaia Wallet" };
  if (window.ethereum) {
    const eth = window.ethereum;
    if (isKaia(eth)) return { provider: wrapKaia(eth as KaiaProvider), kind: "kaia", name: "Kaia Wallet" };
    return { provider: eth, kind: "eip1193", name: eth.isMetaMask ? "MetaMask" : "브라우저 지갑" };
  }
  return null;
}

const CHAIN_HEX = numberToHex(chainId);

/** Adapts Kaia Wallet's `klay_*` API to the `eth_*` calls viem and this app make. */
export function wrapKaia(k: KaiaProvider): Eip1193 {
  const raw = (method: string, params?: unknown[] | Record<string, unknown>) => k.request({ method, params });
  const chainHexFromWallet = async (): Promise<string> => {
    if (k.networkVersion !== undefined && k.networkVersion !== null && k.networkVersion !== "") return numberToHex(Number(k.networkVersion));
    const v = await raw("klay_chainId").catch(() => raw("eth_chainId"));
    return typeof v === "string" ? v : numberToHex(Number(v));
  };
  const wrapped: Eip1193 = {
    isKaikas: true,
    isKaiaWallet: true,
    async request({ method, params }) {
      const list = Array.isArray(params) ? params : [];
      switch (method) {
        case "eth_requestAccounts":
          if (k.enable) return k.enable();
          return raw("klay_requestAccounts");
        case "eth_accounts":
          if (k.selectedAddress) return [k.selectedAddress];
          return raw("klay_accounts").catch(() => []);
        case "eth_chainId":
          return chainHexFromWallet();
        case "wallet_switchEthereumChain":
          return raw("wallet_switchKlaytnChain", list).catch(() => raw("wallet_switchEthereumChain", list));
        case "wallet_addEthereumChain":
          return raw("wallet_addKlaytnChain", list).catch(() => raw("wallet_addEthereumChain", list));
        case "eth_sendTransaction": {
          // Kaia Wallet expects an explicit gas limit; estimate through the public RPC when viem left it out.
          const tx = { ...(list[0] as Record<string, unknown>) };
          if (tx.gas === undefined) {
            const est = await publicClient.estimateGas({
              account: tx.from as `0x${string}`,
              to: tx.to as `0x${string}`,
              data: tx.data as `0x${string}` | undefined,
              value: tx.value ? BigInt(tx.value as string) : undefined,
            });
            tx.gas = numberToHex((est * 12n) / 10n);
          }
          delete tx.type;
          delete tx.maxFeePerGas;
          delete tx.maxPriorityFeePerGas;
          return raw("klay_sendTransaction", [tx]);
        }
        default:
          return raw(method, params);
      }
    },
    on(event, listener) {
      // Kaia Wallet emits `networkChanged` with the network id string instead of `chainChanged`.
      k.on?.(event === "chainChanged" ? "networkChanged" : event, listener);
    },
    removeListener(event, listener) {
      k.removeListener?.(event === "chainChanged" ? "networkChanged" : event, listener);
    },
  };
  return wrapped;
}

export async function requestAccounts(p: Eip1193): Promise<`0x${string}`[]> {
  const raw = (await p.request({ method: "eth_requestAccounts" })) as string[];
  return raw.map((a) => getAddress(a));
}

/** Accounts the site is already allowed to see (no prompt). */
export async function silentAccounts(p: Eip1193): Promise<`0x${string}`[]> {
  try {
    const raw = (await p.request({ method: "eth_accounts" })) as string[];
    return raw.map((a) => getAddress(a));
  } catch {
    return [];
  }
}

export async function providerChainId(p: Eip1193): Promise<number> {
  const v = (await p.request({ method: "eth_chainId" })) as string | number;
  return typeof v === "string" ? hexToNumber(v as `0x${string}`) : Number(v);
}

/** Switches the wallet to the app chain, adding it first when the wallet does not know it. */
export async function switchToAppChain(p: Eip1193): Promise<void> {
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    const msg = String((e as Error)?.message ?? "");
    if (code === 4902 || /4902|unrecognized|not added|Unrecognized chain|not supported/i.test(msg)) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: chainId === 1001 ? "Kaia Kairos Testnet" : chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [rpcUrl],
            blockExplorerUrls: explorer ? [explorer] : [],
          },
        ],
      });
      return;
    }
    throw e;
  }
}

export function walletClientFor(p: Eip1193, address: `0x${string}`): AppWalletClient {
  return createWalletClient({ account: address, chain, transport: custom(p as unknown as EIP1193Provider) }) as unknown as AppWalletClient;
}

/** Subscribes to account and chain changes. Returns an unsubscribe function. */
export function subscribeProvider(
  p: Eip1193,
  handlers: { accounts?: (accounts: `0x${string}`[]) => void; chain?: (id: number) => void },
): () => void {
  const onAccounts = (...args: unknown[]) => {
    const list = (args[0] as string[]) ?? [];
    handlers.accounts?.(list.map((a) => getAddress(a)));
  };
  const onChain = (...args: unknown[]) => {
    const v = args[0];
    const id = typeof v === "string" && v.startsWith("0x") ? hexToNumber(v as `0x${string}`) : Number(v);
    if (Number.isFinite(id)) handlers.chain?.(id);
  };
  p.on?.("accountsChanged", onAccounts);
  p.on?.("chainChanged", onChain);
  return () => {
    p.removeListener?.("accountsChanged", onAccounts);
    p.removeListener?.("chainChanged", onChain);
  };
}
