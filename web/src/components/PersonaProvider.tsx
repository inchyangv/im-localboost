"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chainId } from "@/lib/config";

import { personas, type Persona } from "@/lib/personas";
import { personaSigner, walletSigner as makeWalletSigner, type Signer } from "@/lib/signer";
import {
  discoverWallets,
  nativeBalance,
  providerChainId,
  rememberWallet,
  rememberedWallet,
  requestAccounts,
  silentAccounts,
  subscribeProvider,
  switchToAppChain,
  walletErrorMessage,
  type Eip1193,
  type WalletOption,
} from "@/lib/wallet";

const STORAGE_KEY = "dalgubeolpay.persona";
const MODE_KEY = "dalgubeolpay.mode";

/** Who signs on the consumer screen: the user's browser wallet or a demo persona (bundle key). */
export type Mode = "persona" | "wallet";

export interface WalletState {
  /** At least one injected wallet was found. */
  available: boolean;
  /** Name of the connected (or last chosen) wallet, e.g. "Kaia Wallet". */
  name: string;
  /** EIP-6963 icon of the connected wallet, if it announced one. */
  icon: string | null;
  address: `0x${string}` | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  /** Wallets found in this browser (EIP-6963 + legacy injection). */
  options: WalletOption[];
  /** Native KAIA balance of the connected address (gas), refreshed after connect/switch/payment. */
  nativeBalance: bigint | null;
}

interface PersonaContextValue {
  persona: Persona | null;
  personas: Persona[];
  select: (id: string) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  wallet: WalletState;
  /** Connects a wallet. Without `optionId` the first (or remembered) wallet is used; the picker passes an id. */
  connectWallet: (optionId?: string) => Promise<void>;
  disconnectWallet: () => void;
  switchChain: () => Promise<void>;
  walletSigner: () => Signer | null;
  /** Re-runs wallet discovery (e.g. when the picker opens) and refreshes the native balance. */
  refreshWallet: () => Promise<void>;
}

const EMPTY_WALLET: WalletState = {
  available: false,
  name: "Kaia Wallet",
  icon: null,
  address: null,
  chainId: null,
  connecting: false,
  error: null,
  options: [],
  nativeBalance: null,
};

const PersonaContext = createContext<PersonaContextValue>({
  persona: null,
  personas,
  select: () => {},
  mode: "persona",
  setMode: () => {},
  wallet: EMPTY_WALLET,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  switchChain: async () => {},
  walletSigner: () => null,
  refreshWallet: async () => {},
});

function save(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage may be unavailable
  }
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string>(personas[0]?.id ?? "");
  const [mode, setModeState] = useState<Mode>("persona");
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const providerRef = useRef<Eip1193 | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    save(MODE_KEY, m);
  }, []);

  const refreshNative = useCallback(async (address: `0x${string}` | null) => {
    if (!address) {
      setWallet((w) => ({ ...w, nativeBalance: null }));
      return;
    }
    try {
      const b = await nativeBalance(address);
      setWallet((w) => (w.address === address ? { ...w, nativeBalance: b } : w));
    } catch {
      // RPC hiccup: keep the previous value
    }
  }, []);

  /** Binds a provider: subscribes to account/chain events and reads the current chain. */
  const bind = useCallback(
    async (opt: WalletOption, address: `0x${string}`) => {
      unsubscribeRef.current?.();
      providerRef.current = opt.provider;
      const cid = await providerChainId(opt.provider).catch(() => null);
      setWallet((w) => ({ ...w, name: opt.name, icon: opt.icon, address, chainId: cid, error: null }));
      unsubscribeRef.current = subscribeProvider(opt.provider, {
        accounts: (accounts) => {
          const next = accounts[0] ?? null;
          setWallet((w) => ({ ...w, address: next, nativeBalance: null }));
          if (!next) {
            rememberWallet(null);
            setMode("persona");
          } else refreshNative(next);
        },
        chain: (id) => {
          setWallet((w) => ({ ...w, chainId: id }));
          refreshNative(address);
        },
      });
      rememberWallet(opt.id);
      refreshNative(address);
    },
    [refreshNative, setMode],
  );

  const refreshWallet = useCallback(async () => {
    const options = await discoverWallets();
    setWallet((w) => ({ ...w, available: options.length > 0, options }));
    if (wallet.address) refreshNative(wallet.address);
  }, [wallet.address, refreshNative]);

  useEffect(() => {
    let saved: string | null = null;
    let savedMode: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
      savedMode = window.localStorage.getItem(MODE_KEY);
    } catch {
      // keep defaults
    }
    if (saved && personas.some((p) => p.id === saved)) setId(saved);

    let alive = true;
    (async () => {
      const options = await discoverWallets();
      if (!alive) return;
      setWallet((w) => ({ ...w, available: options.length > 0, options }));
      // Restore the previous wallet session without prompting (eth_accounts is silent).
      const last = rememberedWallet();
      const opt = options.find((o) => o.id === last) ?? (savedMode === "wallet" ? options[0] : undefined);
      if (!opt) return;
      const accounts = await silentAccounts(opt.provider);
      if (!alive || !accounts[0]) return;
      await bind(opt, accounts[0]);
      if (savedMode === "wallet") setModeState("wallet");
    })();
    return () => {
      alive = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [bind]);

  const connectWallet = useCallback(
    async (optionId?: string) => {
      // Discover at click time as well: the extension may inject after our first render.
      const options = await discoverWallets(150);
      setWallet((w) => ({ ...w, available: options.length > 0, options }));
      const opt = options.find((o) => o.id === (optionId ?? rememberedWallet())) ?? options[0];
      if (!opt) {
        setWallet((w) => ({ ...w, error: "브라우저에서 지갑을 찾지 못했어요. Kaia Wallet 또는 MetaMask를 설치한 뒤 새로고침해 주세요." }));
        return;
      }
      setWallet((w) => ({ ...w, connecting: true, error: null, name: opt.name, icon: opt.icon }));
      try {
        const accounts = await requestAccounts(opt.provider);
        if (!accounts[0]) throw new Error("지갑에서 계정을 선택하지 않았어요.");
        await bind(opt, accounts[0]);
        setWallet((w) => ({ ...w, connecting: false }));
        setMode("wallet");
        // Ask for the app chain right away, like most dApps; a refusal is shown as the network banner.
        const cid = await providerChainId(opt.provider).catch(() => null);
        if (cid !== chainId) {
          try {
            await switchToAppChain(opt.provider);
            const now = await providerChainId(opt.provider);
            setWallet((w) => ({ ...w, chainId: now }));
          } catch {
            // banner + button on the page handle the retry
          }
        }
      } catch (e) {
        setWallet((w) => ({ ...w, connecting: false, error: walletErrorMessage(e) }));
      }
    },
    [bind, setMode],
  );

  const disconnectWallet = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    providerRef.current = null;
    rememberWallet(null);
    setWallet((w) => ({ ...w, address: null, chainId: null, error: null, nativeBalance: null, icon: null }));
    setMode("persona");
  }, [setMode]);

  const switchChain = useCallback(async () => {
    const p = providerRef.current;
    if (!p) return;
    try {
      await switchToAppChain(p);
      setWallet((w) => ({ ...w, error: null }));
    } catch (e) {
      setWallet((w) => ({ ...w, error: walletErrorMessage(e) }));
    }
    providerChainId(p)
      .then((cid) => {
        setWallet((w) => ({ ...w, chainId: cid }));
        if (wallet.address) refreshNative(wallet.address);
      })
      .catch(() => {});
  }, [wallet.address, refreshNative]);

  const signer = useMemo<Signer | null>(() => {
    const p = providerRef.current;
    if (!p || !wallet.address) return null;
    return makeWalletSigner(p, wallet.address);
  }, [wallet.address]);

  const value = useMemo<PersonaContextValue>(
    () => ({
      persona: personas.find((p) => p.id === id) ?? null,
      personas,
      select: (next: string) => {
        setId(next);
        save(STORAGE_KEY, next);
        setMode("persona");
      },
      mode,
      setMode,
      wallet,
      connectWallet,
      disconnectWallet,
      switchChain,
      walletSigner: () => signer,
      refreshWallet,
    }),
    [id, mode, wallet, connectWallet, disconnectWallet, switchChain, setMode, signer, refreshWallet],
  );

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  return useContext(PersonaContext);
}

/** The account that pays on the consumer screen: connected wallet first, otherwise a payer persona. */
export interface Actor {
  kind: Mode;
  address: `0x${string}`;
  label: string;
  signer: Signer;
  persona: Persona | null;
  chainOk: boolean;
}

export function useConsumerActor(): Actor | null {
  const ctx = usePersona();
  return useMemo(() => {
    if (ctx.mode === "wallet" && ctx.wallet.address) {
      const s = ctx.walletSigner();
      if (!s) return null;
      return { kind: "wallet", address: ctx.wallet.address, label: ctx.wallet.name || "내 지갑", signer: s, persona: null, chainOk: ctx.wallet.chainId === chainId };
    }
    if (ctx.persona?.role === "payer") {
      return { kind: "persona", address: ctx.persona.account.address, label: ctx.persona.label, signer: personaSigner(ctx.persona.account), persona: ctx.persona, chainOk: true };
    }
    return null;
  }, [ctx]);
}
