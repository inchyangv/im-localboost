"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoMark } from "@/components/Logo";
import { CountUp, Reveal } from "@/components/motion";
import { usePersona } from "@/components/PersonaProvider";
import { WalletGlyph, WalletPicker } from "@/components/WalletButton";
import { useZoneRates } from "@/components/ZoneMap";
import { Button, Icon, IconTile, LiveDot, Skeleton, cx, type IconName } from "@/components/ui";
import { caps, chainId, chainLabel, merchants, zones } from "@/lib/config";
import { hourEpoch } from "@/lib/contracts";
import { kstHourLabel, num, pct, won } from "@/lib/format";

/** Amount used for the worked example in the hero. Whole won, like every amount in the app. */
const EXAMPLE_AMOUNT = 30_000n;

const STEPS: Array<{ icon: IconName; title: string; desc: string }> = [
  { icon: "wallet", title: "지갑 연결", desc: "Kaia Wallet을 연결해요. 개인키는 지갑 밖으로 나가지 않아요." },
  { icon: "bank", title: "은행에서 iMKRW 받기", desc: "은행이 지갑을 등록하고 시작 자금과 수수료용 KAIA를 보내요." },
  { icon: "pay", title: "보너스 높은 상권에서 결제", desc: "예상 보너스를 미리 확인하고 결제하면 크레딧이 바로 쌓여요." },
];

const POINTS: Array<{ icon: IconName; title: string; desc: string }> = [
  { icon: "spark", title: "상권·시간대별 보너스", desc: "한 시간마다 상권별 보너스율이 새로 게시돼요. 율이 높은 곳에서 결제하면 크레딧을 더 받아요." },
  { icon: "shield", title: "결제 전 위험 판정", desc: "엔진이 이상 거래를 가려내요. 의심스러운 결제는 보너스만 보류하고 결제는 그대로 통과해요." },
  { icon: "list", title: "온체인 영수증", desc: "결제와 보너스는 모두 Kaia에 기록돼요. 탐색기에서 누구나 확인할 수 있어요." },
];

/** Bonus for EXAMPLE_AMOUNT at `bps`, limited by the on-chain per-payment cap. Integer math only. */
function exampleBoost(bps: number): bigint {
  const raw = (EXAMPLE_AMOUNT * BigInt(Math.max(0, Math.trunc(bps)))) / 10_000n;
  const cap = BigInt(caps.perTxBoost);
  return raw > cap ? cap : raw;
}

/** First screen before a wallet is connected. Rates are read from the chain, so every number here is live. */
export function Landing() {
  const { wallet } = usePersona();
  const { rates } = useZoneRates();
  const [picker, setPicker] = useState(false);
  const loaded = Object.keys(rates).length > 0;
  const ranked = [...zones].sort((a, b) => (rates[b.id] ?? 0) - (rates[a.id] ?? 0));
  const topBps = ranked.length > 0 ? (rates[ranked[0].id] ?? 0) : 0;
  const scale = Math.max(1, topBps);
  const epochLabel = kstHourLabel(hourEpoch(Math.floor(Date.now() / 1000)));
  const boost = exampleBoost(topBps);

  return (
    <div className="-mt-2 sm:-mt-4">
      {/* ---------- Hero ---------- */}
      <section className="surface-hero relative overflow-hidden rounded-[28px] shadow-ink sm:rounded-[36px] xl:-mx-6">
        <span className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative grid gap-x-10 px-6 pt-10 sm:px-10 sm:pt-14 lg:min-h-[640px] lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:px-14 lg:pt-20">
          <div className="pb-10 lg:pb-32">
            <p className="reveal inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white/85 ring-1 ring-inset ring-white/15">
              <LiveDot />
              대구 상권 {zones.length}곳 · 제휴 가맹점 {num(merchants.length)}곳
            </p>
            <h1
              className="reveal mt-6 text-[34px] font-bold leading-[1.16] tracking-[-0.04em] text-white text-balance sm:text-[52px] lg:text-[60px]"
              style={{ ["--i" as string]: 1 }}
            >
              보너스가 높은 상권에서 <br className="hidden sm:block" />
              결제하고 <span className="text-brand-300">돌려받아요</span>
            </h1>
            <p className="reveal mt-6 max-w-[31rem] text-[16px] leading-[1.7] text-white/65 sm:text-[18px]" style={{ ["--i" as string]: 2 }}>
              달구벌페이는 상권과 시간대에 따라 보너스율이 달라지는 대구 지역화폐예요. Kaia Wallet을 연결하면 은행에서 iMKRW를 받아 바로 결제할 수 있어요.
            </p>
            <div className="reveal mt-9 flex flex-wrap items-center gap-3" style={{ ["--i" as string]: 3 }}>
              <Button size="lg" onClick={() => setPicker(true)} loading={wallet.connecting} className="px-8">
                <WalletGlyph className="h-5 w-5" />
                지갑 연결하고 시작하기
              </Button>
              <Link
                href="/map"
                className="inline-flex h-14 items-center gap-2 rounded-2xl bg-white/10 px-6 text-[16px] font-semibold text-white ring-1 ring-inset ring-white/15 transition-[transform,background-color] duration-150 hover:bg-white/[0.16] active:scale-[0.97]"
              >
                가맹점 지도 보기
                <Icon name="arrow" className="h-4 w-4 text-white/60" />
              </Link>
            </div>
            <ul className="reveal mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-white/60" style={{ ["--i" as string]: 4 }}>
              {[`건당 최대 ${won(caps.perTxBoost)} 보너스`, "결제 전 위험 판정", `${chainLabel(chainId)} 온체인 기록`].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Icon name="check" className="h-4 w-4 text-brand-300" />
                  {t}
                </li>
              ))}
            </ul>
            {wallet.error && !picker && (
              <p role="alert" className="mt-4 text-[13px] text-red-300">
                {wallet.error}
              </p>
            )}
          </div>

          {/* Phone: a miniature of the pay screen fed by the live rates. Its lower edge is cropped by the hero. */}
          <div className="reveal relative mx-auto -mb-44 w-[300px] sm:-mb-40 lg:-mb-24 lg:mt-2 xl:right-10" style={{ ["--i" as string]: 2 }}>
            <div className="float-slow" role="img" aria-label={loaded ? `지금 가장 높은 상권 ${ranked[0]?.name ?? ""} ${pct(topBps)}` : "상권별 보너스율을 불러오는 중"}>
              <div className="rounded-[46px] bg-ink-900 p-2.5 shadow-[0_50px_90px_-24px_rgba(0,0,0,0.7)] ring-1 ring-white/20">
                <div className="relative overflow-hidden rounded-[37px] bg-page">
                  <span className="absolute left-1/2 top-2.5 z-10 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-ink-900" />
                  <div className="flex items-center gap-2 bg-white px-5 pb-3 pt-11">
                    <LogoMark className="h-6 w-6" />
                    <span className="text-[14px] font-bold tracking-heading text-gray-900">결제하기</span>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                      <LiveDot />
                      {epochLabel}
                    </span>
                  </div>
                  <div className="space-y-2.5 p-3">
                    <div className="surface-ink rounded-[22px] p-4">
                      <p className="text-[11px] font-medium text-white/60">지금 가장 높은 상권</p>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p className="text-[17px] font-bold tracking-heading text-white">{loaded ? (ranked[0]?.name ?? "—") : <Skeleton className="h-5 w-20" />}</p>
                        <p className="num-display text-[30px] text-brand-200">{loaded ? pct(topBps) : <Skeleton className="h-7 w-20" />}</p>
                      </div>
                    </div>
                    <div className="rounded-[22px] bg-white p-3 shadow-card">
                      <ul className="space-y-0.5">
                        {ranked.map((z, i) => {
                          const bps = rates[z.id] ?? 0;
                          return (
                            <li key={z.id} className={cx("flex items-center gap-2.5 rounded-xl px-2 py-2", loaded && i === 0 && bps > 0 && "bg-brand-50")}>
                              <span className="w-[52px] shrink-0 text-[12px] font-semibold text-gray-800">{z.name}</span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                                <span
                                  className="block h-full rounded-full bg-brand-500 transition-[width] duration-1000 ease-out"
                                  style={{ width: `${loaded ? Math.round((bps / scale) * 100) : 0}%` }}
                                />
                              </span>
                              <span className={cx("tnum w-[42px] text-right text-[12px] font-bold", bps > 0 ? "text-brand-600" : "text-gray-400")}>
                                {loaded ? pct(bps) : "—"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div className="rounded-[22px] bg-white p-4 shadow-card">
                      <div className="flex items-center justify-between text-[12px] text-gray-500">
                        <span>예시 결제 금액</span>
                        <span className="tnum font-semibold text-gray-900">{won(EXAMPLE_AMOUNT)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5">
                        <span className="text-[12px] font-semibold text-brand-800">예상 보너스</span>
                        <span className="num-display text-[18px] text-brand-600">+{won(boost)}</span>
                      </div>
                      <div className="mt-3 grid h-11 place-items-center rounded-xl bg-brand-500 text-[13px] font-semibold text-white">결제하기</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating notes, wide screens only; they overlap the bezel, never the screen content. The example
                figure comes from the live top rate and the on-chain per-payment cap. */}
            <div className="float-slow absolute -left-[176px] -top-9 hidden w-[204px] items-center gap-3 rounded-2xl bg-white p-3.5 shadow-raised xl:flex" style={{ ["--i" as string]: 1 }} aria-hidden="true">
              <IconTile name="spark" tone="brand" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-500">예시 · {won(EXAMPLE_AMOUNT)} 결제</p>
                <p className="num-display mt-1 text-[17px] text-brand-600">{loaded ? `+${won(boost)} 적립` : <Skeleton className="h-4 w-20" />}</p>
              </div>
            </div>
            <div className="float-slow absolute -right-[156px] top-[318px] hidden w-[176px] items-center gap-3 rounded-2xl bg-white p-3.5 shadow-raised xl:flex" style={{ ["--i" as string]: 2 }} aria-hidden="true">
              <IconTile name="shield" tone="brand" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-500">결제 전 위험 판정</p>
                <p className="mt-1 text-[13px] font-bold tracking-heading text-gray-900">정상이면 즉시 적립</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Facts band: every figure is on-chain configuration or the deployment list ---------- */}
      <div className="relative z-10 mx-3 -mt-10 grid grid-cols-2 overflow-hidden rounded-3xl bg-white shadow-raised sm:mx-8 lg:mx-12 lg:grid-cols-4">
        {[
          { label: "대구 상권", value: BigInt(zones.length), format: (v: bigint) => `${num(v)}곳` },
          { label: "제휴 가맹점", value: BigInt(merchants.length), format: (v: bigint) => `${num(v)}곳` },
          { label: "최대 보너스율", value: BigInt(caps.maxRateBps), format: (v: bigint) => pct(Number(v)) },
          { label: "하루 최대 보너스", value: BigInt(caps.personDailyBoost), format: won },
        ].map((f, i) => (
          <div key={f.label} className={cx("px-5 py-5 sm:px-7 sm:py-6", i % 2 === 1 && "border-l border-gray-100", i >= 2 && "border-t border-gray-100 lg:border-t-0", i === 2 && "lg:border-l")}>
            <p className="text-[12px] font-medium text-gray-500 sm:text-[13px]">{f.label}</p>
            <p className="num-display mt-2 text-[24px] text-gray-900 sm:text-[30px]">
              <CountUp value={f.value} format={f.format} />
            </p>
          </div>
        ))}
      </div>

      {/* ---------- Steps ---------- */}
      <section className="mt-16 sm:mt-24">
        <Reveal>
          <p className="text-[13px] font-semibold text-brand-600">시작하기</p>
          <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-display text-gray-900 sm:text-[34px]">세 단계면 첫 결제까지 끝나요</h2>
        </Reveal>
        <ol className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-5">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} index={i} className="relative rounded-3xl bg-white p-6 shadow-card transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-raised">
              <div className="flex items-center justify-between">
                <IconTile name={s.icon} tone="solid" />
                <span className="num-display text-[34px] text-gray-200">{i + 1}</span>
              </div>
              <h3 className="mt-5 text-[17px] font-bold tracking-heading text-gray-900">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500">{s.desc}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- Why ---------- */}
      <section className="mt-16 sm:mt-24">
        <Reveal>
          <p className="text-[13px] font-semibold text-brand-600">달구벌페이가 다른 점</p>
          <h2 className="mt-2 text-[26px] font-bold leading-tight tracking-display text-gray-900 sm:text-[34px]">보너스는 필요한 곳에, 기록은 모두에게</h2>
        </Reveal>
        <ul className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-5">
          {POINTS.map((p, i) => (
            <Reveal as="li" key={p.title} index={i} className="rounded-3xl bg-white p-6 shadow-card transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-raised">
              <IconTile name={p.icon} tone="brand" />
              <h3 className="mt-5 text-[17px] font-bold tracking-heading text-gray-900">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500">{p.desc}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ---------- Closing call to action ---------- */}
      <Reveal as="section" className="mt-16 sm:mt-24">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-brand-50 p-7 ring-1 ring-inset ring-brand-100 sm:flex-row sm:items-center sm:rounded-[32px] sm:p-10">
          <div>
            <h2 className="text-[24px] font-bold leading-tight tracking-display text-gray-900 sm:text-[30px]">{loaded && topBps > 0 ? `지금 ${ranked[0]?.name} 보너스율 ${pct(topBps)}` : "지금 보너스율을 확인해 보세요"}</h2>
            <p className="mt-2 text-[15px] text-gray-600">지갑을 연결하면 바로 결제하고 보너스 크레딧을 받을 수 있어요.</p>
          </div>
          <Button size="lg" onClick={() => setPicker(true)} loading={wallet.connecting} className="shrink-0 px-8">
            <WalletGlyph className="h-5 w-5" />
            지갑 연결
          </Button>
        </div>
      </Reveal>

      {picker && <WalletPicker onClose={() => setPicker(false)} />}
    </div>
  );
}
