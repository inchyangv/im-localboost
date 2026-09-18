"use client";

import { useEffect, useRef, useState } from "react";
import { usePersona } from "./PersonaProvider";
import { Badge, Button, ChevronDown, CloseIcon, Spinner, cx } from "./ui";
import { FAUCET_URL, LOW_GAS_WEI, chainId, chainLabel, isTestnet } from "@/lib/config";
import { addressUrl, short } from "@/lib/format";
import { KAIA_WALLET_URL, METAMASK_URL, type WalletOption } from "@/lib/wallet";

/* ---------- small pieces ---------- */

export function WalletGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 10.5h4.5v2H13a1 1 0 0 1 0-2Z" fill="currentColor" />
      <path d="M5 5V4.2A1.2 1.2 0 0 1 6.2 3H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Deterministic two-colour avatar from the address, like most wallet UIs. */
export function AddressAvatar({ address, className }: { address: string; className?: string }) {
  const n = parseInt(address.slice(2, 10), 16) || 0;
  const h1 = n % 360;
  const h2 = (h1 + 40 + (n % 80)) % 360;
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block shrink-0 rounded-full", className)}
      style={{ background: `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 70% 45%))` }}
    />
  );
}

export function WalletIcon({ icon, name, className }: { icon: string | null; name: string; className?: string }) {
  if (icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" aria-hidden="true" className={cx("rounded-md object-contain", className)} />;
  }
  return (
    <span className={cx("grid place-items-center rounded-md bg-gray-100 text-gray-700", className)} title={name}>
      <WalletGlyph className="h-[60%] w-[60%]" />
    </span>
  );
}

export function formatKaia(wei: bigint | null): string {
  if (wei === null) return "—";
  const whole = wei / 10n ** 18n;
  const frac = ((wei % 10n ** 18n) / 10n ** 14n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("ko-KR")}${frac ? `.${frac}` : ""} KAIA`;
}

function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

/* ---------- wallet picker modal ---------- */

export function WalletPicker({ onClose }: { onClose: () => void }) {
  const { wallet, connectWallet, refreshWallet } = usePersona();
  const [choosing, setChoosing] = useState<string | null>(null);

  useEffect(() => {
    refreshWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wallet.address && !wallet.connecting) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, wallet.connecting]);

  async function pick(opt: WalletOption) {
    setChoosing(opt.id);
    await connectWallet(opt.id);
    setChoosing(null);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="지갑 연결" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-gray-900">지갑 연결</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-gray-500">
          {chainLabel(chainId)}
          {isTestnet(chainId) ? " 테스트넷" : ""}에서 결제해요. 서명은 지갑 안에서만 이루어지고 이 사이트는 개인키를 보관하지 않아요.
        </p>

        {wallet.options.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {wallet.options.map((opt) => {
              const busy = choosing === opt.id && wallet.connecting;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={wallet.connecting}
                    onClick={() => pick(opt)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                      busy ? "border-brand-300 bg-brand-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                      "disabled:opacity-60",
                    )}
                  >
                    <WalletIcon icon={opt.icon} name={opt.name} className="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-gray-900">{opt.name}</span>
                      <span className="block text-[12px] text-gray-500">{opt.id.startsWith("legacy:") ? "브라우저에 설치됨" : opt.id}</span>
                    </span>
                    {busy ? <Spinner className="h-4 w-4 text-brand-600" /> : <span className="text-[12px] font-medium text-brand-600">연결</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 p-4 text-[13px] text-gray-600">
            <p className="font-medium text-gray-800">설치된 지갑을 찾지 못했어요.</p>
            <p className="mt-1">지갑 확장 프로그램을 설치한 뒤 이 페이지를 새로고침해 주세요.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={KAIA_WALLET_URL} target="_blank" rel="noreferrer" className="rounded-full bg-gray-900 px-3 py-1.5 text-[12px] font-medium text-white">
                Kaia Wallet 설치
              </a>
              <a href={METAMASK_URL} target="_blank" rel="noreferrer" className="rounded-full bg-gray-100 px-3 py-1.5 text-[12px] font-medium text-gray-800">
                MetaMask 설치
              </a>
            </div>
          </div>
        )}

        {wallet.connecting && <p className="mt-3 text-[12px] text-gray-500">지갑 창에서 연결을 승인해 주세요.</p>}
        {wallet.error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-[12px] leading-relaxed text-red-700">
            {wallet.error}
          </p>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-gray-400">데모용 계정으로 둘러보려면 상단의 데모 계정 메뉴를 쓰세요.</p>
      </div>
    </div>
  );
}

/* ---------- chain pill ---------- */

export function ChainPill({ compact = false }: { compact?: boolean }) {
  const { wallet, switchChain } = usePersona();
  const connected = !!wallet.address;
  const current = wallet.chainId;
  const ok = !connected || current === chainId;

  if (!connected) {
    return (
      <span className={cx("inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700", compact && "h-9 px-2.5 text-[12px]")} title={`앱 네트워크: ${chainLabel(chainId)} (chainId ${chainId})`}>
        <KaiaDot className="h-4 w-4" />
        <span className="hidden sm:inline">{chainLabel(chainId)}</span>
      </span>
    );
  }
  if (ok) {
    return (
      <span className={cx("inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-800", compact && "h-9 px-2.5 text-[12px]")} title={`chainId ${chainId}`}>
        <KaiaDot className="h-4 w-4" />
        <span className="hidden sm:inline">{chainLabel(chainId)}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => switchChain()}
      className={cx("inline-flex h-10 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 text-[13px] font-semibold text-red-700 hover:bg-red-100", compact && "h-9 px-2.5 text-[12px]")}
      title={`지갑은 ${current === null ? "알 수 없는 네트워크" : chainLabel(current)}에 있어요. 눌러서 ${chainLabel(chainId)}(으)로 전환`}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
      잘못된 네트워크
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}

function KaiaDot({ className }: { className?: string }) {
  return (
    <span className={cx("grid place-items-center rounded-full bg-gray-900 text-[9px] font-bold text-white", className)} aria-hidden="true">
      K
    </span>
  );
}

/* ---------- connected address menu ---------- */

function AddressMenu({ onClose }: { onClose: () => void }) {
  const { wallet, mode, setMode, disconnectWallet, switchChain } = usePersona();
  const [copied, setCopied] = useState(false);
  if (!wallet.address) return null;
  const chainOk = wallet.chainId === chainId;
  const lowGas = wallet.nativeBalance !== null && wallet.nativeBalance < LOW_GAS_WEI;
  const explorerHref = addressUrl(wallet.address);

  async function copy() {
    try {
      await navigator.clipboard.writeText(wallet.address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked
    }
  }

  const item = "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[14px] font-medium text-gray-900 hover:bg-gray-50";

  return (
    <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-80 rounded-2xl bg-white p-2 shadow-pop ring-1 ring-gray-200/70">
      <div className="flex items-center gap-3 px-3 pb-3 pt-2">
        <AddressAvatar address={wallet.address} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
            <WalletIcon icon={wallet.icon} name={wallet.name} className="h-4 w-4" />
            {wallet.name}
          </p>
          <p className="truncate font-mono text-[12px] text-gray-500" title={wallet.address}>
            {short(wallet.address, 8)}
          </p>
        </div>
      </div>

      <div className="mx-1 mb-2 rounded-xl bg-gray-50 px-3 py-2.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-gray-500">네트워크</span>
          <span className={cx("font-medium", chainOk ? "text-gray-800" : "text-red-600")}>
            {wallet.chainId === null ? "확인 중" : chainLabel(wallet.chainId)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[12px]">
          <span className="text-gray-500">가스 잔액</span>
          <span className={cx("tnum font-medium", lowGas ? "text-amber-700" : "text-gray-800")}>{formatKaia(wallet.nativeBalance)}</span>
        </div>
        {lowGas && FAUCET_URL && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700">
            수수료용 KAIA가 부족해요. 아래 faucet에서 받거나 은행 온보딩으로 충전할 수 있어요.
          </p>
        )}
      </div>

      {mode !== "wallet" && (
        <button role="menuitem" onClick={() => { setMode("wallet"); onClose(); }} className={item}>
          이 지갑으로 결제하기 <Badge tone="brand">추천</Badge>
        </button>
      )}
      {!chainOk && (
        <button role="menuitem" onClick={() => { switchChain(); onClose(); }} className={cx(item, "text-red-700")}>
          {chainLabel(chainId)}(으)로 네트워크 전환
        </button>
      )}
      <button role="menuitem" onClick={copy} className={item}>
        주소 복사 <span className="text-[12px] text-gray-400">{copied ? "복사됨" : ""}</span>
      </button>
      {explorerHref && (
        <a role="menuitem" href={explorerHref} target="_blank" rel="noreferrer" className={item} onClick={onClose}>
          탐색기에서 보기 <ExternalGlyph />
        </a>
      )}
      {FAUCET_URL && (
        <a role="menuitem" href={FAUCET_URL} target="_blank" rel="noreferrer" className={item} onClick={onClose}>
          테스트 KAIA 받기 (faucet) <ExternalGlyph />
        </a>
      )}
      <button role="menuitem" onClick={() => { disconnectWallet(); onClose(); }} className={cx(item, "text-gray-600")}>
        연결 해제
      </button>
    </div>
  );
}

function ExternalGlyph() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M11 4h5v5M16 4l-7 7M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- top-bar control ---------- */

/** Top-bar wallet control: connect (picker) -> [chain pill] [avatar + address menu]. */
export function WalletButton() {
  const { wallet, mode } = usePersona();
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));

  if (!wallet.address) {
    return (
      <>
        <ChainPill />
        <Button size="sm" onClick={() => setPicker(true)} loading={wallet.connecting} className="h-10 rounded-full px-4">
          <WalletGlyph className="h-4 w-4" />
          지갑 연결
        </Button>
        {picker && <WalletPicker onClose={() => setPicker(false)} />}
      </>
    );
  }

  const active = mode === "wallet";
  return (
    <>
      <ChainPill />
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="연결된 지갑"
          className={cx(
            "flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
            active ? "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100" : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
          )}
        >
          <AddressAvatar address={wallet.address} className="h-7 w-7" />
          <span className="font-mono text-[12px] font-medium">{short(wallet.address, 4)}</span>
          <ChevronDown className={cx("h-4 w-4 text-gray-500 transition-transform", open && "rotate-180")} />
        </button>
        {open && <AddressMenu onClose={() => setOpen(false)} />}
      </div>
    </>
  );
}

/** Full-width banner under the top bar when the connected wallet is on another chain. */
export function NetworkBanner() {
  const { wallet, switchChain } = usePersona();
  if (!wallet.address || wallet.chainId === null || wallet.chainId === chainId) return null;
  return (
    <div className="border-b border-red-200 bg-red-50">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-2 px-5 py-2 text-[13px] text-red-800">
        <span>
          지갑이 <b>{chainLabel(wallet.chainId)}</b>에 연결돼 있어요. 이 앱은 <b>{chainLabel(chainId)}</b>(chainId {chainId})에서 동작해요.
        </span>
        <Button size="sm" variant="danger" onClick={() => switchChain()}>
          {chainLabel(chainId)}(으)로 전환
        </Button>
      </div>
    </div>
  );
}
