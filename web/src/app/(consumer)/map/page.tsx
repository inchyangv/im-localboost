"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useZoneRates } from "@/components/ZoneMap";
import { Badge, Card, CardHeader, PageHeader, Spinner, cx } from "@/components/ui";
import { CATEGORY_NAMES, merchants, zoneName, zones, type Merchant } from "@/lib/config";
import { pct } from "@/lib/format";
import { buildPayUrl } from "@/lib/qr";

// Leaflet touches `window` at import time, so the map only renders on the client.
const PartnerMap = dynamic(() => import("@/components/consumer/PartnerMap").then((m) => m.PartnerMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center rounded-2xl bg-gray-100">
      <Spinner className="h-6 w-6 text-gray-400" />
    </div>
  ),
});

/** Partner merchants on a map with the live zone bonus rate; tap a store to pay it. */
export default function MapPage() {
  const { rates } = useZoneRates();
  const [zone, setZone] = useState<number | null>(null);
  const [selected, setSelected] = useState<`0x${string}` | null>(null);

  const list = useMemo(() => (zone ? merchants.filter((m) => m.zoneId === zone) : merchants), [zone]);
  const chosen = merchants.find((m) => m.address === selected) ?? null;

  const payHref = (m: Merchant) => {
    const u = new URL(buildPayUrl(typeof window !== "undefined" ? window.location.origin : "http://localhost", { merchant: m.address, amount: 10_000, ref: null }));
    return `${u.pathname}${u.search}`;
  };

  return (
    <>
      <PageHeader
        title="가맹점 지도"
        desc="상권마다 지금 보너스율이 달라요. 가게를 누르면 바로 결제 화면으로 갈 수 있어요."
        right={<span className="text-[12px] text-gray-500">지도 © OpenStreetMap</span>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="p-2">
          <div className="h-[460px] sm:h-[560px]">
            <PartnerMap rates={rates} selected={selected} onSelect={(m) => setSelected(m.address)} className="h-full w-full" />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="상권" desc="누르면 그 상권의 가게만 보여요." />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setZone(null)}
                className={cx("rounded-full px-3 py-1 text-[12px] font-medium", zone === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
              >
                전체
              </button>
              {zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setZone(zone === z.id ? null : z.id)}
                  className={cx("rounded-full px-3 py-1 text-[12px] font-medium", zone === z.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                >
                  {z.name} <span className={cx("tnum ml-1", (rates[z.id] ?? 0) > 0 ? "text-brand-500" : "text-gray-400")}>{pct(rates[z.id] ?? 0)}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="제휴 가맹점" desc={`${list.length}곳`} />
            <ul className="mt-2 divide-y divide-gray-100">
              {list.map((m) => {
                const active = m.address === selected;
                return (
                  <li key={m.address}>
                    <button
                      type="button"
                      onClick={() => setSelected(m.address)}
                      className={cx("flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left", active ? "bg-brand-50/70" : "hover:bg-gray-50")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-gray-900">{m.name}</span>
                        <span className="block truncate text-[12px] text-gray-500">
                          {zoneName(m.zoneId)} · {CATEGORY_NAMES[m.categoryId] ?? m.categoryId}
                          {m.roadAddress ? ` · ${m.roadAddress}` : ""}
                        </span>
                      </span>
                      <Badge tone={(rates[m.zoneId] ?? 0) > 0 ? "brand" : "gray"} className="tnum">
                        {pct(rates[m.zoneId] ?? 0)}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
            {chosen && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span className="text-[13px] text-gray-700">
                  <b>{chosen.name}</b>에 결제하기
                </span>
                <Link href={payHref(chosen)} className="rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-600">
                  결제 화면으로
                </Link>
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              가맹점 정보는 실제 대구 상권의 가게를 참고한 데모 데이터예요. 실제 제휴 관계가 아니며 위치는 대략적이에요.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
