"use client";

import { RoleAvatar } from "@/components/PersonaSwitcher";
import { Card, Mono } from "@/components/ui";
import { short, won } from "@/lib/format";
import type { Persona } from "@/lib/personas";

export function WalletCard({ persona, balance, credit }: { persona: Persona; balance: bigint | null; credit: bigint | null }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <RoleAvatar role={persona.role} />
        <span className="text-[15px] font-semibold text-gray-900">{persona.label}</span>
        <Mono title={persona.account.address}>{short(persona.account.address, 6)}</Mono>
      </div>
      <p className="mt-6 text-[13px] text-gray-500">iMKRW 잔액</p>
      <p className="tnum mt-1 text-[34px] font-bold leading-none tracking-tight text-gray-900">{balance === null ? "—" : won(balance)}</p>
      <div className="mt-5 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-brand-800">보너스 크레딧</p>
          <p className="text-[12px] text-brand-700/80">결제할 때 현금 대신 쓸 수 있어요</p>
        </div>
        <p className="tnum text-[18px] font-bold text-brand-700">{credit === null ? "—" : won(credit)}</p>
      </div>
    </Card>
  );
}
