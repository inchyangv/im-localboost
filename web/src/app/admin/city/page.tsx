"use client";

import { useCallback, useEffect, useState } from "react";
import { PersonaGate } from "@/components/PersonaGate";
import { usePersona } from "@/components/PersonaProvider";
import { BudgetForm, RatesPanel } from "@/components/city/BudgetAndRates";
import { CapsPanel } from "@/components/city/CapsPanel";
import { DemoPanel } from "@/components/city/DemoPanel";
import { SimPanel } from "@/components/city/SimPanel";
import { ZoneCards } from "@/components/city/ZoneCards";
import { Badge, PageHeader, cx } from "@/components/ui";
import { readZoneCards, type ZoneCard } from "@/lib/city";
import { kstHourLabel } from "@/lib/format";

const CARDS_REFRESH_MS = 10_000;

const SECTIONS = [
  { id: "zones", label: "상권 현황" },
  { id: "budget", label: "예산·율" },
  { id: "caps", label: "상한" },
  { id: "demo", label: "데모" },
  { id: "sim", label: "시뮬레이션" },
];

function SectionNav() {
  return (
    <nav className="sticky top-[118px] z-20 -mx-4 mb-6 border-b border-gray-200/70 bg-page/90 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5 lg:top-16" aria-label="화면 내 이동">
      <ul className="scroll-thin flex gap-1 overflow-x-auto">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cx("block whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900")}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function CityPage() {
  const { persona } = usePersona();
  const [cards, setCards] = useState<ZoneCard[]>([]);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isCity = persona?.role === "city";
  const actor = isCity ? persona!.account : null;

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
    return <PersonaGate roles={["city"]} title="대구시 운영 화면이에요" desc="대구시 데모 계정을 고르면 상권 예산·보너스율·상한을 관리할 수 있어요." />;
  }

  return (
    <>
      <PageHeader
        title="대구시 운영"
        desc="상권별 예산을 예치하고 보너스율과 상한을 관리해요. 보류 환수와 정산은 은행 화면에서 해요."
        right={<Badge tone="gray">{epoch !== null ? `현재 시간대 ${kstHourLabel(epoch)}` : "읽는 중"}</Badge>}
      />
      <SectionNav />

      <div className="space-y-6">
        <ZoneCards cards={cards} epoch={epoch} />
        <div id="budget" className="grid scroll-mt-44 gap-6 lg:scroll-mt-32 lg:grid-cols-2 lg:items-start">
          <BudgetForm city={isCity ? actor : null} onDone={bump} />
          <RatesPanel enabled={isCity} onPublished={bump} />
        </div>
        <CapsPanel actor={actor} isCity={isCity} />
        <DemoPanel onChanged={bump} />
        <SimPanel />
      </div>
    </>
  );
}
