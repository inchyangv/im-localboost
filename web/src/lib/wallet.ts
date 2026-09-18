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
  /** Normalised EIP-1193 provider (legacy Kaia Wallet `klay_*` API is wrapped so viem can drive it). */
  provider: Eip1193;
  kind: "kaia" | "eip1193";
  name: string;
}

/** One connectable wallet, as shown in the picker. `id` is the EIP-6963 rdns or a legacy pseudo id. */
export interface WalletOption extends DetectedProvider {
  id: string;
  /** Data URI from EIP-6963, or null for legacy-injected providers (the UI draws a generic glyph). */
  icon: string | null;
}

export const LAST_WALLET_KEY = "dalgubeolpay.wallet";
export const METAMASK_URL = "https://metamask.io/download/";

function isKaia(p: KaiaProvider | Eip1193 | undefined | null): p is KaiaProvider {
  return !!p && (!!(p as KaiaProvider).enable || !!p.isKaikas || !!p.isKaiaWallet);
}

/** Speaks `eth_*` already (Kaia Wallet's window.ethereum, MetaMask, EIP-6963 providers)? Then no adapter is needed. */
function normalise(p: Eip1193 | KaiaProvider, preferAdapter: boolean): { provider: Eip1193; kind: "kaia" | "eip1193" } {
  if (preferAdapter && isKaia(p)) return { provider: wrapKaia(p), kind: "kaia" };
  return { provider: p, kind: isKaia(p) ? "kaia" : "eip1193" };
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
}

/**
 * Discovers wallets the DeFi way: EIP-6963 announcements (name + icon + rdns) first, then the
 * legacy `window.ethereum` / `window.klaytn` injections for wallets that do not announce.
 * Resolves after `waitMs` so late announcers are included.
 */
export async function discoverWallets(waitMs = 250): Promise<WalletOption[]> {
  if (typeof window === "undefined") return [];
  const found = new Map<string, WalletOption>();
  const onAnnounce = (e: Event) => {
    const d = (e as CustomEvent<Eip6963Detail>).detail;
    if (!d?.info?.rdns || !d.provider || found.has(d.info.rdns)) return;
    const n = normalise(d.provider, false);
    found.set(d.info.rdns, { id: d.info.rdns, name: d.info.name, icon: d.info.icon ?? null, provider: n.provider, kind: n.kind });
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((r) => setTimeout(r, waitMs));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);

  // Legacy fallbacks (deduplicated against the announced providers by object identity).
  const announced = new Set(Array.from(found.values()).map((o) => o.provider));
  const eth = window.ethereum;
  if (eth && !announced.has(eth)) {
    const n = normalise(eth, false);
    const name = isKaia(eth) ? "Kaia Wallet" : eth.isMetaMask ? "MetaMask" : "브라우저 지갑";
    found.set(`legacy:${name}`, { id: `legacy:${name}`, name, icon: null, provider: n.provider, kind: n.kind });
  }
  const kaia = window.klaytn ?? window.kaia;
  if (kaia && !announced.has(kaia as Eip1193) && kaia !== (eth as unknown) && !Array.from(found.values()).some((o) => o.name === "Kaia Wallet")) {
    const n = normalise(kaia, true);
    found.set("legacy:kaia", { id: "legacy:kaia", name: "Kaia Wallet", icon: null, provider: n.provider, kind: n.kind });
  }
  // Kaia first, then the rest in announcement order.
  return Array.from(found.values()).sort((a, b) => Number(b.name === "Kaia Wallet") - Number(a.name === "Kaia Wallet"));
}

/** Synchronous best guess used before discovery finishes (and for tests): Kaia Wallet first, then any injected provider. */
export function detectProvider(): DetectedProvider | null {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (eth && isKaia(eth)) return { ...normalise(eth, false), name: "Kaia Wallet" };
  const kaia = window.klaytn ?? window.kaia;
  if (isKaia(kaia)) return { ...normalise(kaia, true), name: "Kaia Wallet" };
  if (eth) return { ...normalise(eth, false), name: eth.isMetaMask ? "MetaMask" : "브라우저 지갑" };
  return null;
}

export function rememberWallet(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(LAST_WALLET_KEY, id);
    else window.localStorage.removeItem(LAST_WALLET_KEY);
  } catch {
    // storage may be unavailable
  }
}

export function rememberedWallet(): string | null {
  try {
    return window.localStorage.getItem(LAST_WALLET_KEY);
  } catch {
    return null;
  }
}

/** Native (KAIA) balance of an address on the app chain, for the gas hint. */
export async function nativeBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.getBalance({ address });
}

/** Wallet error codes users actually hit, mapped to short Korean. */
export function walletErrorMessage(e: unknown): string {
  const code = (e as { code?: number })?.code;
  const msg = String((e as Error)?.message ?? e ?? "");
  if (code === 4001 || /user rejected|User denied|rejected the request/i.test(msg)) return "지갑에서 요청을 거절했어요.";
  if (code === -32002 || /already pending/i.test(msg)) return "지갑에 처리 중인 요청이 있어요. 지갑 창을 확인해 주세요.";
  if (code === 4902) return "지갑에 이 네트워크가 없어요. 네트워크 추가를 승인해 주세요.";
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
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
