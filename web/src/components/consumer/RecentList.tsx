"use client";

import { Card, CardHeader, TxLink, cx } from "@/components/ui";
import { merchantByAddress } from "@/lib/config";
import type { PaymentRow } from "@/lib/engine";
import { kstShort, num, short, won } from "@/lib/format";

export function RecentList({ rows }: { rows: PaymentRow[] }) {
  return (
    <Card>
      <CardHeader title="최근 결제" right={<span>엔진 기록 · 10초 갱신</span>} />
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-gray-500">아직 결제 기록이 없어요.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {rows.map((p) => {
            const name = merchantByAddress(p.merchant)?.name ?? short(p.merchant);
            const bonus =
              p.boost > 0 && p.tier === 1
                ? { text: `보류 ${num(p.boost)}원`, cls: "text-amber-700" }
                : p.boost > 0
                  ? { text: `+${num(p.boost)}원 적립`, cls: "text-brand-600" }
                  : { text: "보너스 없음", cls: "text-gray-400" };
            return (
              <li key={`${p.txHash}-${p.blockNumber}`} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-gray-900">{name}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[12px] text-gray-500">
                    <span className="tnum">{kstShort(p.ts)}</span>
                    <TxLink hash={p.txHash} />
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-[14px] font-semibold text-gray-900">{won(p.amount)}</p>
                  <p className={cx("tnum mt-0.5 text-[12px] font-medium", bonus.cls)}>{bonus.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
