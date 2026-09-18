"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PersonaGate } from "@/components/PersonaGate";
import { useConsumerActor, usePersona } from "@/components/PersonaProvider";
import { OnboardCard } from "@/components/consumer/OnboardCard";
import { RecentList } from "@/components/consumer/RecentList";
import { ResultCard } from "@/components/consumer/ResultCard";
import { QrScanner } from "@/components/consumer/QrScanner";
import { WalletCard } from "@/components/consumer/WalletCard";
import { ZoneLegend, ZoneMap, rateLevel, useZoneRates } from "@/components/ZoneMap";
import { AmountInput, Badge, Button, Card, CardHeader, Mono, Notice, PageHeader, cx } from "@/components/ui";
import { publicClient } from "@/lib/chain";
import { CATEGORY_NAMES, FAUCET_URL, LOW_GAS_WEI, caps, chainId, chainLabel, merchants, zoneName, zones } from "@/lib/config";
import { addresses, dalgubeolPayAbi, hourEpoch, readBoostState, registryAbi, tokenAbi, type BoostState } from "@/lib/contracts";
import { payments as fetchPayments, type PaymentRow } from "@/lib/engine";
import { parseChainError } from "@/lib/errors";
import { kstHourLabel, pct, won } from "@/lib/format";
import { runPayFlow, type PayFlowResult } from "@/lib/pay";
import { zeroBoostReason } from "@/lib/reasons";

const QUOTE_DEBOUNCE_MS = 500;
const ZERO_PERSON = "0x0000000000000000000000000000000000000000000000000000000000000000";
const PAYMENTS_REFRESH_MS = 10_000;
const QUICK_AMOUNTS = [10_000, 30_000, 50_000, 100_000];

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

  const visibleMerchants = useMemo(() => (zone ? merchants.filter((m) => m.zoneId === zone) : merchants), [zone]);
  const selected = merchants.find((m) => m.address === merchant);
  const address = actor?.address ?? null;
  const isWallet = actor?.kind === "wallet";
  const epochLabel = kstHourLabel(hourEpoch(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (zone && selected && selected.zoneId !== zone && visibleMerchants[0]) setMerchant(visibleMerchants[0].address);
  }, [zone, selected, visibleMerchants]);

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
    return (
      <PersonaGate
        roles={[]}
        wallet
        title="내 지갑으로 결제해 보세요"
        desc="Kaia Wallet을 연결하면 은행에서 iMKRW를 받아 바로 결제할 수 있어요."
      />
    );
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
            <Badge tone="gray">현재 시간대 {epochLabel}</Badge>
            <Button type="button" variant="dark" size="sm" onClick={() => setScanning(true)}>
              QR 스캔
            </Button>
          </span>
        }
      />
      {scanning && <QrScanner onClose={() => setScanning(false)} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
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

          <Card>
            <CardHeader title="지금 상권별 보너스율" desc="상권을 누르면 그 상권의 가게만 골라 볼 수 있어요." />
            <ZoneMap className="mt-4" rates={rates} selected={zone} onSelect={setZone} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <ZoneLegend />
              <span className="text-[12px] text-gray-400">10초마다 갱신</span>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
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

          <Card>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onPay();
              }}
            >
              <CardHeader title="어디서 결제할까요?" />

              <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="상권 필터">
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

              <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200" role="radiogroup" aria-label="가맹점">
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
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          active ? "bg-brand-50/70" : "hover:bg-gray-50",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cx(
                            "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2",
                            active ? "border-brand-500" : "border-gray-300",
                          )}
                        >
                          {active && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                        </span>
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
              </ul>

              <div className="mt-6">
                <label htmlFor="amount" className="text-[13px] font-medium text-gray-600">
                  결제 금액
                </label>
                <div className="mt-1.5">
                  <AmountInput id="amount" size="lg" value={amount} onChange={setAmount} ariaLabel="결제 금액 (원)" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_AMOUNTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(v)}
                      className={cx(
                        "tnum rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                        amount === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                      )}
                    >
                      {v / 10_000}만원
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="useCredit" className="text-[14px] font-medium text-gray-800">
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

              <div className="mt-5 rounded-2xl bg-gray-50 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] text-gray-600">예상 보너스</span>
                  <span className={cx("tnum text-[26px] font-bold tracking-tight", quote && quote.boost > 0n ? "text-brand-600" : "text-gray-400")}>
                    {quote ? won(quote.boost) : quoteError ? "—" : "계산 중"}
                  </span>
                </div>
                {quote && selected && (
                  <p className="tnum mt-1 text-[12px] text-gray-500">
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
        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
      )}
    >
      {children}
    </button>
  );
}
