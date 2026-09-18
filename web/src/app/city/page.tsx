"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersona } from "@/components/PersonaProvider";
import { BudgetForm, RatesPanel } from "@/components/city/BudgetAndRates";
import { CapsPanel } from "@/components/city/CapsPanel";
import { DemoBadge } from "@/components/city/DemoBadge";
import { PendingTable, RiskLogTable } from "@/components/city/RiskAndPending";
import { ZoneCards } from "@/components/city/ZoneCards";
import { readZoneCards, type ZoneCard } from "@/lib/city";

const CARDS_REFRESH_MS = 10_000;

export default function CityPage() {
  const { persona } = usePersona();
  const [cards, setCards] = useState<ZoneCard[]>([]);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isCity = persona?.role === "city";
  const isBank = persona?.role === "bank";
  const actor = persona && (isCity || isBank) ? persona.account : null;

  const refreshCards = useCallback(async () => {
    try {
      const r = await readZoneCards();
      setCards(r.cards);
      setEpoch(r.epoch);
    } catch {
      // keep last values
    }
  }, []);

  useEffect(() => {
    refreshCards();
    const id = setInterval(refreshCards, CARDS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshCards, refreshKey]);

  const bump = () => {
    setRefreshKey((k) => k + 1);
    refreshCards();
  };

  if (!persona || !actor) {
    return (
      <section className="rounded border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-semibold">대구시 · 은행</h1>
        <p className="mt-2 text-sm text-gray-600">상단에서 대구시 또는 은행 페르소나를 선택하세요.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{persona.label} 운영 화면</h1>
        <span className="text-xs text-gray-500">{isCity ? "예산·율·상한 담당" : "환수 담당"}</span>
      </div>
      <ZoneCards cards={cards} epoch={epoch} />
      <div className="grid gap-6 lg:grid-cols-2">
        <BudgetForm city={isCity ? actor : null} onDone={bump} />
        <RatesPanel enabled={isCity} onPublished={bump} />
      </div>
      <RiskLogTable />
      <PendingTable actor={actor} isBank={isBank} onChanged={bump} refreshKey={refreshKey} />
      <CapsPanel actor={actor} isCity={isCity} />
      <section className="rounded border border-dashed border-purple-300 bg-white p-4">
        <h2 className="text-base font-semibold">
          데모 보조
          <DemoBadge />
        </h2>
        <p className="mt-1 text-xs text-gray-500">담합 링 실행·서명 재사용 공격 버튼은 다음 단계에서 추가됩니다.</p>
      </section>
      <section className="rounded border border-dashed border-purple-300 bg-white p-4">
        <h2 className="text-base font-semibold">
          시뮬레이션
          <DemoBadge />
        </h2>
        <p className="mt-1 text-xs text-gray-500">결과 파일이 없습니다. `make sim`을 실행하세요.</p>
      </section>
    </div>
  );
}
