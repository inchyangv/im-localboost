"use client";

import type { ReactNode } from "react";
import { RoleAvatar } from "@/components/PersonaSwitcher";
import { Badge, Card, Mono, cx } from "@/components/ui";
import { usePersona } from "@/components/PersonaProvider";
import { AddressAvatar, WalletIcon, formatKaia } from "@/components/WalletButton";
import { FAUCET_URL, LOW_GAS_WEI, chainId, chainLabel } from "@/lib/config";
import { addressUrl, short, won } from "@/lib/format";
import type { Persona } from "@/lib/personas";

/** Balance card for the paying account. Pass `persona` for a demo account, or `kind`/`label`/`address`
 *  for any account (connected wallet). */
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
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2.5">
        {kind === "wallet" ? <AddressAvatar address={address} className="h-8 w-8" /> : <RoleAvatar role="payer" />}
        <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-gray-900">
          {kind === "wallet" && <WalletIcon icon={wallet.icon} name={wallet.name} className="h-4 w-4" />}
          {label}
        </span>
        {explorerHref ? (
          <a href={explorerHref} target="_blank" rel="noreferrer" className="hover:underline" title="탐색기에서 보기">
            <Mono title={address}>{short(address, 6)}</Mono>
          </a>
        ) : (
          <Mono title={address}>{short(address, 6)}</Mono>
        )}
        {kind === "persona" && <Badge tone="gray">데모 계정</Badge>}
        {kind === "wallet" && (chainOk ? <Badge tone="gray">{chainLabel(chainId)}</Badge> : <Badge tone="red">잘못된 네트워크</Badge>)}
        {registered === false && <Badge tone="amber">은행 미등록</Badge>}
      </div>
      <p className="mt-6 text-[13px] text-gray-500">iMKRW 잔액</p>
      <p className={cx("tnum mt-1 text-[34px] font-bold leading-none tracking-tight", balance === 0n ? "text-gray-400" : "text-gray-900")}>
        {balance === null ? "—" : won(balance)}
      </p>
      <div className="mt-5 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-brand-800">보너스 크레딧</p>
          <p className="text-[12px] text-brand-700/80">결제할 때 현금 대신 쓸 수 있어요</p>
        </div>
        <p className="tnum text-[18px] font-bold text-brand-700">{credit === null ? "—" : won(credit)}</p>
      </div>
      {kind === "wallet" && (
        <div className="mt-3 flex items-center justify-between px-1 text-[12px]">
          <span className="text-gray-500">수수료용 KAIA</span>
          <span className="inline-flex items-center gap-2">
            <span className={cx("tnum font-medium", lowGas ? "text-amber-700" : "text-gray-700")}>{formatKaia(wallet.nativeBalance)}</span>
            {lowGas && FAUCET_URL && (
              <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline underline-offset-2">
                faucet에서 받기
              </a>
            )}
          </span>
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}
