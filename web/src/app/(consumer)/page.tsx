"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CountUp } from "@/components/motion";
import { useConsumerActor, usePersona } from "@/components/PersonaProvider";
import { Landing } from "@/components/consumer/Landing";
import { OnboardCard } from "@/components/consumer/OnboardCard";
import { RecentList } from "@/components/consumer/RecentList";
import { ResultCard } from "@/components/consumer/ResultCard";
import { QrScanner } from "@/components/consumer/QrScanner";
import { WalletCard } from "@/components/consumer/WalletCard";
import { ZoneLegend, ZoneMap, rateLevel, useZoneRates } from "@/components/ZoneMap";
import { AmountInput, Badge, Button, CATEGORY_ICONS, Card, CardHeader, Icon, IconTile, LiveDot, Mono, Notice, PageHeader, Skeleton, cx, inputSoftCls } from "@/components/ui";
import { publicClient } from "@/lib/chain";
import { CATEGORY_NAMES, FAUCET_URL, LOW_GAS_WEI, caps, chainId, chainLabel, merchants, zoneName, zones } from "@/lib/config";
import { addresses, dalgubeolPayAbi, readBoostState, registryAbi, tokenAbi, type BoostState } from "@/lib/contracts";
import { payments as fetchPayments, type PaymentRow } from "@/lib/engine";
import { parseChainError } from "@/lib/errors";
import { pct, won } from "@/lib/format";
import { useHourLabel } from "@/lib/useHourLabel";
import { runPayFlow, type PayFlowResult } from "@/lib/pay";
import { zeroBoostReason } from "@/lib/reasons";

const QUOTE_DEBOUNCE_MS = 500;
const ZERO_PERSON = "0x0000000000000000000000000000000000000000000000000000000000000000";
const PAYMENTS_REFRESH_MS = 10_000;
const QUICK_AMOUNTS = [10_000, 30_000, 50_000, 100_000];
/** Show the name search once the list is too long to scan. */
const SEARCH_THRESHOLD = 8;

interface Quote {
  boost: bigint;
  reason: string | null;
  state: BoostState;
}

function RateBadge({ bps }: { bps: number }) {
  const lv = rateLevel(bps);
  return (
    <Badge tone={lv === "none" ? "gray" : "brand"} className={cx("tnum", lv === "high" && "bg-brand-500 text-white")}>
      {pct(bps)}
    </Badge>
  );
}

export default function ConsumerPage() {
  const actor = useConsumerActor(true);
  const { switchChain, wallet } = usePersona();
  const { rates } = useZoneRates();
  const [zone, setZone] = useState<number | null>(null);
  const [merchant, setMerchant] = useState<`0x${string}`>(merchants[0]?.address ?? "0x");
  const [amount, setAmount] = useState<number>(10_000);
  const [useCredit, setUseCredit] = useState<number>(0);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [credit, setCredit] = useState<bigint | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<PayFlowResult | null>(null);
  const [error, setError] = useState<{ name: string | null; message: string } | null>(null);
  const [recent, setRecent] = useState<PaymentRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");

  const zoneMerchants = useMemo(() => (zone ? merchants.filter((m) => m.zoneId === zone) : merchants), [zone]);
  const visibleMerchants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zoneMerchants;
    return zoneMerchants.filter((m) => `${m.name} ${zoneName(m.zoneId)} ${CATEGORY_NAMES[m.categoryId] ?? ""}`.toLowerCase().includes(q));
  }, [zoneMerchants, query]);
  const selected = merchants.find((m) => m.address === merchant);
  const address = actor?.address ?? null;
  const isWallet = actor?.kind === "wallet";
  const epochLabel = useHourLabel();

  useEffect(() => {
    if (zone && selected && selected.zoneId !== zone && zoneMerchants[0]) setMerchant(zoneMerchants[0].address);
  }, [zone, selected, zoneMerchants]);

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      const [bal, personId] = await Promise.all([
        publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
        publicClient.readContract({ address: addresses.MerchantRegistry, abi: registryAbi, functionName: "personOf", args: [address] }) as Promise<`0x${string}`>,
      ]);
      const cr = (await publicClient.readContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName: "creditOf", args: [personId] })) as bigint;
      setBalance(bal);
      setCredit(cr);
      setRegistered(personId !== ZERO_PERSON);
    } catch {
      setBalance(null);
      setCredit(null);
      setRegistered(null);
    }
  }, [address]);

  const refreshRecent = useCallback(async () => {
    if (!address) return;
    try {
      setRecent(await fetchPayments({ payer: address, limit: 10 }));
    } catch {
      // engine down: keep the last list
    }
  }, [address]);

  useEffect(() => {
    setBalance(null);
    setCredit(null);
    setRegistered(null);
    setRecent([]);
    setResult(null);
    setError(null);
    setShowOnboard(false);
    refreshBalances();
    refreshRecent();
    const id = setInterval(refreshRecent, PAYMENTS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshBalances, refreshRecent]);

  // Debounced quoteBoost + zero-bonus reason preview.
  useEffect(() => {
    if (!address || !selected || amount <= 0) {
      setQuote(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const payer = address;
        const [boost, state] = await Promise.all([
          publicClient.readContract({
            address: addresses.DalgubeolPay,
            abi: dalgubeolPayAbi,
            functionName: "quoteBoost",
            args: [payer, selected.address, BigInt(amount), BigInt(useCredit)],
          }) as Promise<bigint>,
          readBoostState(payer, selected.address, selected.zoneId),
        ]);
        const reason = boost === 0n ? zeroBoostReason({ state, amount: BigInt(amount), useCredit: BigInt(useCredit) }) : null;
        setQuote({ boost, reason, state });
        setQuoteError(null);
      } catch (e) {
        setQuote(null);
        setQuoteError(parseChainError(e).message);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [address, selected, amount, useCredit, result]);

  async function onPay() {
    if (!actor || !selected) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (isWallet && !actor.chainOk) {
        setStep("지갑 네트워크를 전환하는 중");
        await switchChain();
      }
      const r = await runPayFlow(actor.signer, selected.address, amount, useCredit, setStep);
      setResult(r);
      setUseCredit(0);
      await refreshBalances();
      setTimeout(refreshRecent, 3000);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(parseChainError(e));
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  if (!actor || !address) {
    return <Landing />;
  }

  const creditMax = credit ?? 0n;
  const useCreditInvalid = BigInt(useCredit) > creditMax || useCredit > amount || useCredit < 0;
  const needsOnboard = isWallet && (registered === false || balance === 0n);
  const lowGas = isWallet && wallet.nativeBalance !== null && wallet.nativeBalance < LOW_GAS_WEI;
  const canPay = !isWallet || (registered === true && actor.chainOk && !lowGas);
  const personRemaining =
    quote && quote.state.personDay < BigInt(caps.personDailyBoost) ? BigInt(caps.personDailyBoost) - quote.state.personDay : 0n;

  return (
    <>
      <PageHeader
        title="결제하기"
        desc="지금 보너스율이 높은 상권에서 결제하면 크레딧을 더 받아요."
        right={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-3.5 text-[13px] font-medium text-gray-700 shadow-card">
              <LiveDot />
              현재 시간대 {epochLabel}
            </span>
            <Button type="button" variant="dark" size="sm" className="h-10 rounded-full px-4" onClick={() => setScanning(true)}>
              <Icon name="qr" className="h-4 w-4" />
              QR 스캔
            </Button>
          </span>
        }
      />
      {scanning && <QrScanner onClose={() => setScanning(false)} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5 sm:space-y-6">
          <WalletCard
            kind={actor.kind}
            label={actor.label}
            address={address}
            balance={balance}
            credit={credit}
            registered={isWallet ? registered : null}
            action={
              isWallet &&
              !needsOnboard && (
                <Button variant="secondary" size="sm" onClick={() => setShowOnboard((v) => !v)}>
                  은행에서 iMKRW 받기
                </Button>
              )
            }
          />

          <Card className="reveal" style={{ ["--i" as string]: 2 }}>
            <CardHeader
              title="지금 상권별 보너스율"
              desc="상권을 누르면 그 상권의 가게만 골라 볼 수 있어요."
              right={
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500">
                  <LiveDot />
                  10초마다 갱신
                </span>
              }
            />
            <ZoneMap className="mt-4" rates={rates} selected={zone} onSelect={setZone} />
            <ZoneLegend className="mt-4" />
          </Card>
        </div>

        <div className="space-y-5 sm:space-y-6">
          {isWallet && !actor.chainOk && (
            <Notice tone="warn" title="지갑 네트워크가 앱과 달라요">
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span>
                  앱은 {chainLabel(chainId)} (chainId {chainId})에서 동작해요. 지갑은 {wallet.chainId ?? "알 수 없음"}에 연결돼 있어요.
                </span>
                <Button size="sm" variant="dark" onClick={() => switchChain()}>
                  네트워크 전환
                </Button>
              </div>
            </Notice>
          )}
          {isWallet && (needsOnboard || showOnboard) && (
            <OnboardCard
              address={address}
              registered={registered === true}
              onDone={() => {
                refreshBalances();
                setTimeout(refreshBalances, 3000);
              }}
              onClose={!needsOnboard ? () => setShowOnboard(false) : undefined}
            />
          )}
          {result && <ResultCard result={result} onClose={() => setResult(null)} />}

          <Card className="reveal" style={{ ["--i" as string]: 2 }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onPay();
              }}
            >
              <CardHeader title="어디서 결제할까요?" />

              <div className="scroll-none -mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="상권 필터">
                <ZoneChip active={zone === null} onClick={() => setZone(null)}>
                  전체
                </ZoneChip>
                {zones.map((z) => (
                  <ZoneChip key={z.id} active={zone === z.id} onClick={() => setZone(zone === z.id ? null : z.id)}>
                    {z.name}
                    <span className={cx("tnum ml-1", (rates[z.id] ?? 0) > 0 ? "text-brand-600" : "text-gray-400")}>{pct(rates[z.id] ?? 0)}</span>
                  </ZoneChip>
                ))}
              </div>

              {zoneMerchants.length > SEARCH_THRESHOLD && (
                <div className="relative mt-3">
                  <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="가게 이름, 업종으로 찾기"
                    aria-label="가맹점 검색"
                    className={cx(inputSoftCls, "h-11 rounded-xl pl-10 pr-4 text-[15px]")}
                  />
                </div>
              )}

              <ul
                className={cx(
                  "scroll-thin -mx-2 mt-3 max-h-[396px] space-y-0.5 overflow-y-auto px-2 py-0.5",
                  // Fade the last row out so a long list reads as scrollable rather than cut off.
                  visibleMerchants.length > 6 && "pb-6 [mask-image:linear-gradient(to_bottom,#000_calc(100%-40px),transparent)]",
                )}
                role="radiogroup"
                aria-label="가맹점"
              >
                {visibleMerchants.map((m) => {
                  const active = m.address === merchant;
                  return (
                    <li key={m.address}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMerchant(m.address)}
                        className={cx(
                          "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150",
                          active ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : "hover:bg-gray-50 active:bg-gray-100",
                        )}
                      >
                        <IconTile name={CATEGORY_ICONS[m.categoryId] ?? "store"} tone={active ? "solid" : "gray"} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-gray-900">{m.name}</span>
                          <span className="block text-[12px] text-gray-500">
                            {zoneName(m.zoneId)} · {CATEGORY_NAMES[m.categoryId] ?? m.categoryId}
                          </span>
                        </span>
                        <RateBadge bps={rates[m.zoneId] ?? 0} />
                      </button>
                    </li>
                  );
                })}
                {visibleMerchants.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-gray-500">찾는 가게가 없어요. 다른 이름으로 찾아보세요.</li>}
              </ul>

              <div className="mt-6 border-t border-gray-100 pt-6">
                <label htmlFor="amount" className="text-[15px] font-bold tracking-heading text-gray-900">
                  얼마를 결제할까요?
                </label>
                <div className="mt-3">
                  <AmountInput id="amount" size="lg" value={amount} onChange={setAmount} ariaLabel="결제 금액 (원)" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_AMOUNTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(v)}
                      className={cx(
                        "tnum h-9 rounded-full px-3.5 text-[13px] font-semibold transition-[transform,background-color] duration-150 active:scale-95",
                        amount === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                      )}
                    >
                      {v / 10_000}만원
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="useCredit" className="inline-flex items-center gap-2 text-[14px] font-semibold text-gray-800">
                    <Icon name="spark" className="h-4 w-4 text-brand-600" />
                    보너스 크레딧 사용
                  </label>
                  <span className="tnum text-[12px] text-gray-500">보유 {won(creditMax)}</span>
                </div>
                {creditMax > 0n ? (
                  <>
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1">
                        <AmountInput id="useCredit" value={useCredit} onChange={setUseCredit} ariaLabel="크레딧 사용액 (원)" />
                      </div>
                      <Button type="button" variant="secondary" size="md" className="h-12" onClick={() => setUseCredit(Number(creditMax < BigInt(amount) ? creditMax : BigInt(amount)))}>
                        전액
                      </Button>
                    </div>
                    {useCreditInvalid ? (
                      <p className="mt-1.5 text-[12px] text-red-600">크레딧 사용액은 보유 크레딧과 결제 금액 이하여야 해요.</p>
                    ) : (
                      <p className="mt-1.5 text-[12px] text-gray-500">크레딧으로 낸 금액에는 보너스가 붙지 않아요.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-[12px] text-gray-500">아직 사용할 수 있는 크레딧이 없어요.</p>
                )}
              </div>

              <div
                className={cx(
                  "mt-3 rounded-2xl p-5 transition-colors duration-300",
                  quote && quote.boost > 0n ? "bg-brand-50 ring-1 ring-inset ring-brand-100" : "bg-gray-50",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cx("text-[14px] font-semibold", quote && quote.boost > 0n ? "text-brand-800" : "text-gray-600")}>예상 보너스</span>
                  <span className={cx("num-display text-[28px]", quote && quote.boost > 0n ? "text-brand-600" : "text-gray-400")}>
                    {quote ? (
                      <>
                        {quote.boost > 0n && "+"}
                        <CountUp value={quote.boost} format={won} />
                      </>
                    ) : quoteError ? (
                      "—"
                    ) : (
                      <Skeleton className="h-7 w-24" />
                    )}
                  </span>
                </div>
                {quote && selected && (
                  <p className={cx("tnum mt-2 text-[12px] leading-relaxed", quote.boost > 0n ? "text-brand-800/70" : "text-gray-500")}>
                    {zoneName(selected.zoneId)} 현재 {pct(quote.state.currentRate)} · 건당 최대 {won(caps.perTxBoost)} · 오늘 남은 한도 {won(personRemaining)}
                  </p>
                )}
                {quote?.reason && (
                  <Notice tone="warn" className="mt-3">
                    사유: {quote.reason}
                  </Notice>
                )}
                {quoteError && (
                  <Notice tone="error" className="mt-3">
                    {quoteError}
                  </Notice>
                )}
              </div>

              <Button type="submit" size="lg" full loading={busy} disabled={amount <= 0 || useCreditInvalid || !selected || !canPay} className="mt-4">
                {busy ? (step ?? "처리 중") : `${won(amount)} 결제하기`}
              </Button>
              {lowGas ? (
                <p className="mt-2 text-center text-[12px] text-amber-700">
                  수수료용 KAIA가 부족해서 결제를 보낼 수 없어요.{" "}
                  {FAUCET_URL && (
                    <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      faucet에서 받기
                    </a>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-center text-[12px] text-gray-400">
                  {isWallet && registered === false
                    ? "먼저 위에서 은행 등록을 마치면 결제할 수 있어요."
                    : isWallet
                      ? "엔진 위험 판정 → 지갑 서명 → 온체인 결제 순으로 진행돼요."
                      : "엔진 위험 판정 → 서명 → 온체인 결제 순으로 진행돼요."}
                </p>
              )}

              {error && (
                <Notice tone="error" className="mt-3" title="결제에 실패했어요">
                  {error.message}
                  {error.name && (
                    <Mono className="ml-1.5 bg-red-100 text-red-700" title={error.name}>
                      {error.name}
                    </Mono>
                  )}
                </Notice>
              )}
            </form>
          </Card>

          <RecentList rows={recent} />
        </div>
      </div>
    </>
  );
}

function ZoneChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-[transform,background-color,border-color] duration-150 active:scale-95",
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
      )}
    >
      {children}
    </button>
  );
}
