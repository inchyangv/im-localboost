"use client";

import type { ZoneCard } from "@/lib/city";
import { num, pct, won } from "@/lib/format";

export function ZoneCards({ cards, epoch }: { cards: ZoneCard[]; epoch: number | null }) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">상권 현황</h2>
        <span className="text-xs text-gray-500">{epoch !== null ? `epoch ${epoch} · 10초 갱신` : "읽는 중…"}</span>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const ratio = c.hourlyCap > 0n ? Math.min(100, Number((c.hourSpent * 100n) / c.hourlyCap)) : 0;
          return (
            <div key={c.zoneId} className="rounded border border-gray-200 bg-white p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">{c.name}</span>
                <span className={`text-sm font-semibold ${c.rateBps >= 1000 ? "text-blue-700" : c.rateBps > 0 ? "text-blue-500" : "text-gray-400"}`}>
                  {pct(c.rateBps)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">예산 잔액</p>
              <p className="text-sm font-medium">{won(c.budget)}</p>
              <p className="mt-1 text-xs text-gray-500">이번 시간 집행</p>
              <p className="text-xs">
                {num(c.hourSpent)} / {num(c.hourlyCap)}
              </p>
              <div className="mt-1 h-1.5 w-full rounded bg-gray-200">
                <div className="h-full rounded bg-blue-600" style={{ width: `${ratio}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
