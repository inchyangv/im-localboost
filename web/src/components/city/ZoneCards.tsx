"use client";

import { Card, Progress, cx } from "@/components/ui";
import type { ZoneCard } from "@/lib/city";
import { num, pct, won } from "@/lib/format";

export function ZoneCards({ cards, epoch }: { cards: ZoneCard[]; epoch: number | null }) {
  return (
    <section id="zones" className="scroll-mt-44 lg:scroll-mt-32">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold text-gray-900">상권 현황</h2>
        <span className="text-[12px] text-gray-500">{epoch !== null ? `epoch ${epoch} · 10초 갱신` : "읽는 중"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.length === 0 &&
          [1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[150px] animate-pulse rounded-2xl bg-white/70" aria-hidden="true" />)}
        {cards.map((c) => {
          const ratio = c.hourlyCap > 0n ? Math.min(100, Number((c.hourSpent * 100n) / c.hourlyCap)) : 0;
          const hot = c.rateBps >= 1000;
          return (
            <Card key={c.zoneId} padded={false} className={cx("p-4", hot && "ring-1 ring-brand-200")}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-semibold text-gray-900">{c.name}</p>
                <p className={cx("tnum text-[22px] font-bold leading-none tracking-tight", c.rateBps > 0 ? "text-brand-600" : "text-gray-300")}>{pct(c.rateBps)}</p>
              </div>
              <p className="mt-4 text-[12px] text-gray-500">예산 잔액</p>
              <p className={cx("tnum text-[15px] font-semibold", c.budget === 0n ? "text-red-600" : "text-gray-900")}>{won(c.budget)}</p>
              <div className="mt-3 flex items-baseline justify-between text-[12px]">
                <span className="text-gray-500">이번 시간 집행</span>
                <span className="tnum text-gray-700">
                  {num(c.hourSpent)} <span className="text-gray-400">/ {num(c.hourlyCap)}</span>
                </span>
              </div>
              <Progress ratio={ratio} tone={ratio >= 100 ? "red" : ratio >= 70 ? "amber" : "brand"} className="mt-1.5 h-1.5" />
            </Card>
          );
        })}
      </div>
    </section>
  );
}
