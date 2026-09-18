"use client";

import { useEffect, useRef, useState } from "react";
import { usePersona } from "./PersonaProvider";
import { Badge, Button, ChevronDown, cx } from "./ui";
import { chainId, chainLabel } from "@/lib/config";
import { short } from "@/lib/format";

export function WalletGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 10.5h4.5v2H13a1 1 0 0 1 0-2Z" fill="currentColor" />
      <path d="M5 5V4.2A1.2 1.2 0 0 1 6.2 3H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Top-bar control for the user's own wallet: connect, switch network, use for payment, disconnect. */
export function WalletButton() {
  const { wallet, mode, connectWallet, disconnectWallet, switchChain, setMode } = usePersona();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!wallet.address) {
    return (
      <div className="relative">
        <Button size="sm" onClick={() => connectWallet()} loading={wallet.connecting} className="h-10 rounded-full px-4" title="Kaia Wallet 또는 EIP-1193 지갑">
          <WalletGlyph className="h-4 w-4" />
          Kaia Wallet 연결
        </Button>
        {wallet.error && (
          <p role="alert" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl bg-white p-3 text-[12px] leading-relaxed text-red-700 shadow-pop ring-1 ring-gray-200/70">
            {wallet.error}
          </p>
        )}
      </div>
    );
  }

  const active = mode === "wallet";
  const chainOk = wallet.chainId === chainId;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="연결된 지갑"
        className={cx(
          "flex h-10 items-center gap-2 rounded-full border pl-2 pr-3 text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
          active ? "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100" : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
        )}
      >
        <span className={cx("grid h-6 w-6 place-items-center rounded-full", active ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600")}>
          <WalletGlyph className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[12px] font-medium">{short(wallet.address, 4)}</span>
        {!chainOk && <Badge tone="amber">네트워크</Badge>}
        <ChevronDown className={cx("h-4 w-4 text-gray-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl bg-white p-2 shadow-pop ring-1 ring-gray-200/70">
          <div className="px-3 pb-2 pt-1.5">
            <p className="text-[13px] font-semibold text-gray-900">{wallet.name}</p>
            <p className="break-all font-mono text-[11px] text-gray-500">{wallet.address}</p>
            <p className="mt-1 text-[12px] text-gray-500">
              {chainOk ? `${chainLabel(chainId)}에 연결됨` : `지갑 네트워크(${wallet.chainId ?? "?"})가 앱(${chainId})과 달라요`}
            </p>
          </div>
          {!active && (
            <button role="menuitem" onClick={() => { setMode("wallet"); setOpen(false); }} className="block w-full rounded-xl px-3 py-2 text-left text-[14px] font-medium text-gray-900 hover:bg-gray-50">
              이 지갑으로 결제하기
            </button>
          )}
          {!chainOk && (
            <button role="menuitem" onClick={() => { switchChain(); setOpen(false); }} className="block w-full rounded-xl px-3 py-2 text-left text-[14px] font-medium text-gray-900 hover:bg-gray-50">
              {chainLabel(chainId)}(으)로 네트워크 전환
            </button>
          )}
          <button role="menuitem" onClick={() => { disconnectWallet(); setOpen(false); }} className="block w-full rounded-xl px-3 py-2 text-left text-[14px] font-medium text-gray-600 hover:bg-gray-50">
            연결 해제
          </button>
          <p className="px-3 pb-1 pt-2 text-[11px] leading-relaxed text-gray-400">서명은 지갑 안에서만 이루어져요. 이 사이트는 개인키를 보관하지 않아요.</p>
        </div>
      )}
    </div>
  );
}
