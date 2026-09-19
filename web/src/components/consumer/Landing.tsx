"use client";

import Link from "next/link";
import { useState } from "react";
import { usePersona } from "@/components/PersonaProvider";
import { WalletGlyph, WalletPicker } from "@/components/WalletButton";
import { useZoneRates } from "@/components/ZoneMap";
import { Button, Card, Icon, IconTile, LiveDot, Skeleton, cx, type IconName } from "@/components/ui";
import { caps, chainId, chainLabel, merchants, zones } from "@/lib/config";
import { hourEpoch } from "@/lib/contracts";
import { kstHourLabel, pct, won } from "@/lib/format";

const POINTS: Array<{ icon: IconName; title: string; desc: string }> = [
  { icon: "spark", title: "상권·시간대별 보너스", desc: "한 시간마다 상권별 보너스율이 새로 게시돼요. 율이 높은 곳에서 결제하면 크레딧을 더 받아요." },
  { icon: "shield", title: "결제 전 위험 판정", desc: "엔진이 이상 거래를 가려내요. 의심스러운 결제는 보너스만 보류하고 결제는 그대로 통과해요." },
  { icon: "list", title: "온체인 영수증", desc: "결제와 보너스는 모두 Kaia에 기록돼요. 탐색기에서 누구나 확인할 수 있어요." },
];

/** First screen before a wallet is connected. The rate board reads the chain directly, so it is live without a wallet. */
export function Landing() {
  const { wallet } = usePersona();
  const { rates } = useZoneRates();
  const [picker, setPicker] = useState(false);
  const loaded = Object.keys(rates).length > 0;
  const ranked = [...zones].sort((a, b) => (rates[b.id] ?? 0) - (rates[a.id] ?? 0));
  const top = Math.max(1, ...ranked.map((z) => rates[z.id] ?? 0));
  const epochLabel = kstHourLabel(hourEpoch(Math.floor(Date.now() / 1000)));

  return (
    <div className="pt-2 sm:pt-6">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14">
        <div>
          <p className="reveal inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-gray-700 shadow-card">
            <LiveDot />
            대구 상권 {zones.length}곳 · 제휴 가맹점 {merchants.length}곳
          </p>
          <h1
            className="reveal mt-5 text-[34px] font-bold leading-[1.18] tracking-display text-gray-900 text-balance sm:text-[46px]"
            style={{ ["--i" as string]: 1 }}
          >
            보너스가 높은 상권에서
            <br />
            결제하고 <span className="text-brand-600">돌려받아요</span>
          </h1>
          <p className="reveal mt-5 max-w-[30rem] text-[16px] leading-relaxed text-gray-600 sm:text-[17px]" style={{ ["--i" as string]: 2 }}>
            달구벌페이는 상권과 시간대에 따라 보너스율이 달라지는 대구 지역화폐예요. Kaia Wallet을 연결하면 은행에서 iMKRW를 받아 바로 결제할 수 있어요.
          </p>
          <div className="reveal mt-8 flex flex-wrap items-center gap-3" style={{ ["--i" as string]: 3 }}>
            <Button size="lg" onClick={() => setPicker(true)} loading={wallet.connecting} className="px-7">
              <WalletGlyph className="h-5 w-5" />
              지갑 연결
            </Button>
            <Link
              href="/map"
              className="inline-flex h-14 items-center gap-2 rounded-2xl bg-white px-6 text-[16px] font-semibold text-gray-800 shadow-card transition-[transform,box-shadow] duration-150 hover:shadow-raised active:scale-[0.97]"
            >
              가맹점 지도 보기
              <Icon name="arrow" className="h-4 w-4 text-gray-400" />
            </Link>
          </div>
          <p className="reveal mt-4 text-[13px] text-gray-400" style={{ ["--i" as string]: 4 }}>
            {chainLabel(chainId)}에서 동작해요. 다른 네트워크에 있으면 연결 후 전환을 안내해요.
          </p>
          {wallet.error && !picker && (
            <p role="alert" className="mt-3 text-[13px] text-red-600">
              {wallet.error}
            </p>
          )}
        </div>

        <Card className="reveal shadow-raised" style={{ ["--i" as string]: 2 }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold tracking-heading text-gray-900">지금 상권별 보너스율</h2>
              <p className="mt-1 text-[13px] text-gray-500">{epochLabel} 기준</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700">
              <LiveDot />
              실시간
            </span>
          </div>
          <ul className="mt-5 space-y-1">
            {ranked.map((z, i) => {
              const bps = rates[z.id] ?? 0;
              const lead = loaded && i === 0 && bps > 0;
              return (
                <li key={z.id} className={cx("flex items-center gap-3 rounded-2xl px-3 py-3", lead && "bg-brand-50")}>
                  <span className={cx("tnum w-4 text-center text-[13px] font-bold", lead ? "text-brand-600" : "text-gray-400")}>{i + 1}</span>
                  <span className="w-[68px] shrink-0 text-[15px] font-semibold text-gray-900">{z.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span
                      className={cx("block h-full rounded-full transition-[width] duration-700 ease-out", bps > 0 ? "bg-brand-500" : "bg-transparent")}
                      style={{ width: `${loaded ? Math.round((bps / top) * 100) : 0}%` }}
                    />
                  </span>
                  <span className={cx("num-display w-[58px] text-right text-[17px]", bps > 0 ? "text-brand-600" : "text-gray-400")}>
                    {loaded ? pct(bps) : <Skeleton className="h-4 w-10" />}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
            <div>
              <p className="text-[12px] text-gray-500">건당 최대 보너스</p>
              <p className="num-display mt-1.5 text-[18px] text-gray-900">{won(caps.perTxBoost)}</p>
            </div>
            <div>
              <p className="text-[12px] text-gray-500">하루 최대 보너스</p>
              <p className="num-display mt-1.5 text-[18px] text-gray-900">{won(caps.personDailyBoost)}</p>
            </div>
          </div>
        </Card>
      </div>

      <ul className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-3">
        {POINTS.map((p, i) => (
          <li key={p.title} className="reveal rounded-3xl bg-white p-6 shadow-card" style={{ ["--i" as string]: 4 + i }}>
            <IconTile name={p.icon} tone="brand" />
            <h3 className="mt-4 text-[16px] font-bold tracking-heading text-gray-900">{p.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-500">{p.desc}</p>
          </li>
        ))}
      </ul>

      {picker && <WalletPicker onClose={() => setPicker(false)} />}
    </div>
  );
}
