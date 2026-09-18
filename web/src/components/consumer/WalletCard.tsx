"use client";

import type { ReactNode } from "react";
import { RoleAvatar } from "@/components/PersonaSwitcher";
import { Badge, Card, Mono, cx } from "@/components/ui";
import { WalletGlyph } from "@/components/WalletButton";
import { short, won } from "@/lib/format";
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
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2.5">
        {kind === "wallet" ? (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-white" aria-hidden="true">
            <WalletGlyph className="h-4 w-4" />
          </span>
        ) : (
          <RoleAvatar role="payer" />
        )}
        <span className="text-[15px] font-semibold text-gray-900">{label}</span>
        <Mono title={address}>{short(address, 6)}</Mono>
        {kind === "persona" && <Badge tone="gray">데모 계정</Badge>}
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
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}
