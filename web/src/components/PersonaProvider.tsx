"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chainId } from "@/lib/config";
import { parseChainError } from "@/lib/errors";
import { personas, type Persona } from "@/lib/personas";
import { personaSigner, walletSigner as makeWalletSigner, type Signer } from "@/lib/signer";
import {
  KAIA_WALLET_URL,
  detectProvider,
  providerChainId,
  requestAccounts,
  silentAccounts,
  subscribeProvider,
  switchToAppChain,
  type Eip1193,
} from "@/lib/wallet";

const STORAGE_KEY = "dalgubeolpay.persona";
const MODE_KEY = "dalgubeolpay.mode";

/** Who signs on the consumer screen: the user's browser wallet or a demo persona (bundle key). */
export type Mode = "persona" | "wallet";

export interface WalletState {
  available: boolean;
  name: string;
  address: `0x${string}` | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
}

interface PersonaContextValue {
  persona: Persona | null;
  personas: Persona[];
  select: (id: string) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  wallet: WalletState;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchChain: () => Promise<void>;
  walletSigner: () => Signer | null;
}

const EMPTY_WALLET: WalletState = { available: false, name: "Kaia Wallet", address: null, chainId: null, connecting: false, error: null };

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

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    save(MODE_KEY, m);
  }, []);

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

    const found = detectProvider();
    const p = found?.provider ?? null;
    providerRef.current = p;
    setWallet((w) => ({ ...w, available: p !== null, name: found?.name ?? "Kaia Wallet" }));
    if (!p) return;

    // Restore a previous wallet session without prompting.
    let alive = true;
    if (savedMode === "wallet") {
      (async () => {
        const [accounts, cid] = await Promise.all([silentAccounts(p), providerChainId(p).catch(() => null)]);
        if (!alive) return;
        if (accounts[0]) {
          setWallet((w) => ({ ...w, address: accounts[0], chainId: cid }));
          setModeState("wallet");
        }
      })();
    }
    const unsubscribe = subscribeProvider(p, {
      accounts: (accounts) => {
        setWallet((w) => ({ ...w, address: accounts[0] ?? null }));
        if (!accounts[0]) setMode("persona");
      },
      chain: (cid) => setWallet((w) => ({ ...w, chainId: cid })),
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [setMode]);

  const connectWallet = useCallback(async () => {
    // Detect at click time as well: the extension may inject after our first render.
    const found = detectProvider();
    const p = found?.provider ?? providerRef.current;
    providerRef.current = p;
    if (!p) {
      setWallet((w) => ({ ...w, available: false, error: `Kaia Wallet을 찾지 못했어요. ${KAIA_WALLET_URL} 에서 확장 프로그램을 설치한 뒤 다시 시도해 주세요.` }));
      return;
    }
    setWallet((w) => ({ ...w, connecting: true, error: null, name: found?.name ?? w.name }));
    try {
      const accounts = await requestAccounts(p);
      if (!accounts[0]) throw new Error("지갑에서 계정을 선택하지 않았어요");
      let cid = await providerChainId(p);
      if (cid !== chainId) {
        try {
          await switchToAppChain(p);
          cid = await providerChainId(p);
        } catch {
          // the mismatch is shown on the page with a retry button
        }
      }
      setWallet((w) => ({ ...w, address: accounts[0], chainId: cid, connecting: false, error: null }));
      setMode("wallet");
    } catch (e) {
      setWallet((w) => ({ ...w, connecting: false, error: parseChainError(e).message }));
    }
  }, [setMode]);

  const disconnectWallet = useCallback(() => {
    setWallet((w) => ({ ...w, address: null, chainId: null, error: null }));
    setMode("persona");
  }, [setMode]);

  const switchChain = useCallback(async () => {
    const p = providerRef.current;
    if (!p) return;
    try {
      await switchToAppChain(p);
      setWallet((w) => ({ ...w, error: null }));
    } catch (e) {
      setWallet((w) => ({ ...w, error: parseChainError(e).message }));
    }
    setWallet((w) => ({ ...w, chainId: null }));
    providerChainId(p)
      .then((cid) => setWallet((w) => ({ ...w, chainId: cid })))
      .catch(() => {});
  }, []);

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
    }),
    [id, mode, wallet, connectWallet, disconnectWallet, switchChain, setMode, signer],
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
      return { kind: "wallet", address: ctx.wallet.address, label: "내 지갑", signer: s, persona: null, chainOk: ctx.wallet.chainId === chainId };
    }
    if (ctx.persona?.role === "payer") {
      return { kind: "persona", address: ctx.persona.account.address, label: ctx.persona.label, signer: personaSigner(ctx.persona.account), persona: ctx.persona, chainOk: true };
    }
    return null;
  }, [ctx]);
}
