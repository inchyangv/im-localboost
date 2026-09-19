"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useZoneRates } from "@/components/ZoneMap";
import { Badge, Card, CardHeader, PageHeader, Spinner, cx } from "@/components/ui";
import { CATEGORY_COLORS, CATEGORY_NAMES, merchants, zoneName, zones, type Merchant } from "@/lib/config";
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

const CATEGORY_IDS = [1, 2, 3, 4];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("rounded-full px-3 py-1 text-[12px] font-medium", active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
    >
      {children}
    </button>
  );
}

/** Partner merchants on a map with the live zone bonus rate; filter by category, zone or name, tap a store to pay it. */
export default function MapPage() {
  const { rates } = useZoneRates();
  const [zone, setZone] = useState<number | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<`0x${string}` | null>(null);

  const zoneCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const m of merchants) c[m.zoneId] = (c[m.zoneId] ?? 0) + 1;
    return c;
  }, []);

  const q = query.trim();
  // Zone and name narrow everything; category/tag counts are taken after those so the chips show what is left.
  const base = useMemo(
    () => merchants.filter((m) => (zone === null || m.zoneId === zone) && (q === "" || m.name.includes(q) || (m.tag ?? "").includes(q))),
    [zone, q],
  );
  const tags = useMemo(() => {
    if (category === null) return [];
    const counts = new Map<string, number>();
    for (const m of base) if (m.categoryId === category && m.tag) counts.set(m.tag, (counts.get(m.tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [base, category]);
  const list = useMemo(
    () => base.filter((m) => (category === null || m.categoryId === category) && (tag === null || m.tag === tag)),
    [base, category, tag],
  );
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card padded={false} className="reveal p-2 lg:sticky lg:top-24 lg:self-start" style={{ ["--i" as string]: 1 }}>
          <div className="h-[420px] overflow-hidden rounded-[18px] sm:h-[560px] lg:h-[calc(100vh-15rem)] lg:max-h-[860px] lg:min-h-[560px]">
            <PartnerMap items={list} rates={rates} selected={selected} onSelect={(m) => setSelected(m.address)} className="h-full w-full" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-1 pt-2.5 text-[12px] text-gray-500">
            {CATEGORY_IDS.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
                {CATEGORY_NAMES[c]}
              </span>
            ))}
            <span className="ml-auto">원은 상권, 색이 진할수록 보너스가 높아요</span>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="찾기" desc="상권과 업종을 골라 보거나 가게 이름으로 찾아보세요." />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="가게 이름이나 업종 (예: 국밥, 베이커리)"
              className="mt-3 w-full rounded-xl bg-gray-100 px-3.5 py-2.5 text-[14px] text-gray-900 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-500/40"
            />

            <p className="mt-4 text-[12px] font-semibold text-gray-500">상권 · 지금 보너스율</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={zone === null} onClick={() => setZone(null)}>
                전체 <span className="tnum ml-0.5 opacity-60">{merchants.length}</span>
              </Chip>
              {zones.map((z) => (
                <Chip key={z.id} active={zone === z.id} onClick={() => setZone(zone === z.id ? null : z.id)}>
                  {z.name} <span className="tnum opacity-60">{zoneCounts[z.id] ?? 0}</span> <span className={cx("tnum ml-1 font-semibold", (rates[z.id] ?? 0) > 0 ? "text-brand-500" : "text-gray-400")}>{pct(rates[z.id] ?? 0)}</span>
                </Chip>
              ))}
            </div>

            <p className="mt-4 text-[12px] font-semibold text-gray-500">업종</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip active={category === null} onClick={() => { setCategory(null); setTag(null); }}>
                전체 <span className="tnum ml-0.5 opacity-60">{base.length}</span>
              </Chip>
              {CATEGORY_IDS.map((c) => (
                <Chip key={c} active={category === c} onClick={() => { setCategory(category === c ? null : c); setTag(null); }}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CATEGORY_COLORS[c] }} />
                  {CATEGORY_NAMES[c]} <span className="tnum ml-0.5 opacity-60">{base.filter((m) => m.categoryId === c).length}</span>
                </Chip>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-l-2 border-gray-100 pl-2.5">
                {tags.map(([t, n]) => (
                  <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {t} <span className="tnum ml-0.5 opacity-60">{n}</span>
                  </Chip>
                ))}
              </div>
            )}

          </Card>

          <Card>
            <CardHeader title="제휴 가맹점" desc={list.length === merchants.length ? `${merchants.length}곳` : `${merchants.length}곳 중 ${list.length}곳`} />
            {list.length === 0 && <p className="py-8 text-center text-[13px] text-gray-400">조건에 맞는 가게가 없어요.</p>}
            <ul className="-mx-2 mt-2 max-h-[420px] divide-y divide-gray-100 overflow-y-auto px-2">
              {list.map((m) => {
                const active = m.address === selected;
                return (
                  <li key={m.address}>
                    <button
                      type="button"
                      onClick={() => setSelected(m.address)}
                      className={cx("flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left", active ? "bg-brand-50/70" : "hover:bg-gray-50")}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[m.categoryId] ?? "#6b7280" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-gray-900">{m.name}</span>
                        <span className="block truncate text-[12px] text-gray-500">
                          {zoneName(m.zoneId)} · {m.tag ?? CATEGORY_NAMES[m.categoryId] ?? m.categoryId}
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
              가맹점은 대구 각 상권의 거리에 배치한 동네 소상공인 데모 데이터예요. 프랜차이즈는 넣지 않았어요. 실제 제휴 관계가 아니며 가게 이름과 위치는 가상이거나 대략적이에요.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
