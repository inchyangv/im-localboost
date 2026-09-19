"use client";

import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import { CountUp } from "@/components/motion";
import { RoleAvatar } from "@/components/PersonaSwitcher";
import { Card, Icon, Skeleton, cx } from "@/components/ui";
import { usePersona } from "@/components/PersonaProvider";
import { AddressAvatar, WalletIcon, formatKaia } from "@/components/WalletButton";
import { FAUCET_URL, LOW_GAS_WEI, chainId, chainLabel } from "@/lib/config";
import { addressUrl, short, won } from "@/lib/format";
import type { Persona } from "@/lib/personas";

function Chip({ tone = "plain", children }: { tone?: "plain" | "warn" | "danger"; children: ReactNode }) {
  const cls = tone === "warn" ? "bg-amber-400/20 text-amber-200" : tone === "danger" ? "bg-red-500/25 text-red-200" : "bg-white/10 text-white/75";
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5", cls)}>{children}</span>;
}

/** Balance card for the paying account: the one deep-ink surface on consumer screens. Pass `persona` for a
 *  demo account, or `kind`/`label`/`address` for any account (connected wallet). */
export function WalletCard(props: {
  persona?: Persona;
  kind?: "wallet" | "persona";
  label?: string;
  address?: `0x${string}`;
  balance: bigint | null;
  credit: bigint | null;
  registered?: boolean | null;
  action?: ReactNode;
}) {
  const { balance, credit, action } = props;
  const kind = props.kind ?? "persona";
  const label = props.label ?? props.persona?.label ?? "계정";
  const address = props.address ?? props.persona?.account.address ?? "0x";
  const registered = props.registered ?? null;
  const { wallet } = usePersona();
  const explorerHref = addressUrl(address);
  const chainOk = kind !== "wallet" || wallet.chainId === chainId;
  const lowGas = kind === "wallet" && wallet.nativeBalance !== null && wallet.nativeBalance < LOW_GAS_WEI;
  const addressText = (
    <span className="font-mono text-[12px] text-white/55" title={address}>
      {short(address, 6)}
    </span>
  );
  return (
    <Card tone="ink" className="reveal relative overflow-hidden" style={{ ["--i" as string]: 1 }}>
      <LogoMark className="pointer-events-none absolute -right-7 -top-7 h-36 w-36 rotate-12 opacity-[0.07] grayscale" />

      <div className="relative flex items-center gap-3">
        {kind === "wallet" ? (
          <AddressAvatar address={address} className="h-9 w-9 ring-2 ring-white/15" />
        ) : (
          <RoleAvatar role="payer" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-white">
            {kind === "wallet" && <WalletIcon icon={wallet.icon} name={wallet.name} className="h-4 w-4" />}
            <span className="truncate">{label}</span>
          </p>
          {explorerHref ? (
            <a href={explorerHref} target="_blank" rel="noreferrer" className="hover:underline" title="탐색기에서 보기">
              {addressText}
            </a>
          ) : (
            addressText
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {kind === "persona" && <Chip>데모 계정</Chip>}
          {kind === "wallet" && (chainOk ? <Chip>{chainLabel(chainId)}</Chip> : <Chip tone="danger">잘못된 네트워크</Chip>)}
          {registered === false && <Chip tone="warn">은행 미등록</Chip>}
        </div>
      </div>

      <p className="relative mt-8 text-[13px] font-medium text-white/60">iMKRW 잔액</p>
      <p className={cx("num-display relative mt-2 text-[40px] sm:text-[44px]", balance === 0n ? "text-white/40" : "text-white")}>
        {balance === null ? <Skeleton className="h-10 w-44 rounded-xl" /> : <CountUp value={balance} format={won} />}
      </p>

      <div className="relative mt-7 flex items-center gap-3 rounded-2xl bg-white/[0.08] px-4 py-3.5 ring-1 ring-inset ring-white/10">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-400/25 text-brand-200">
          <Icon name="spark" className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white">보너스 크레딧</p>
          <p className="truncate text-[12px] text-white/55">결제할 때 현금 대신 쓸 수 있어요</p>
        </div>
        <p className="num-display text-[20px] text-brand-200">
          {credit === null ? <Skeleton className="h-5 w-16" /> : <CountUp value={credit} format={won} />}
        </p>
      </div>

      {(kind === "wallet" || action) && (
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {kind === "wallet" ? (
            <p className="flex items-center gap-2 text-[12px] text-white/55">
              수수료용 KAIA
              <span className={cx("tnum font-semibold", lowGas ? "text-amber-300" : "text-white/85")}>{formatKaia(wallet.nativeBalance)}</span>
              {lowGas && FAUCET_URL && (
                <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-200 underline underline-offset-2">
                  faucet에서 받기
                </a>
              )}
            </p>
          ) : (
            <span />
          )}
          {action && <div className="[&_button]:bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20">{action}</div>}
        </div>
      )}
    </Card>
  );
}
