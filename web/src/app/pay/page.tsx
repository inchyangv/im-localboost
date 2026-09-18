"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PersonaGate } from "@/components/PersonaGate";
import { useConsumerActor, usePersona } from "@/components/PersonaProvider";
import { OnboardCard } from "@/components/consumer/OnboardCard";
import { ResultCard } from "@/components/consumer/ResultCard";
import { WalletCard } from "@/components/consumer/WalletCard";
import { AmountInput, Badge, Button, Card, CardHeader, Mono, Notice, PageHeader, Spinner, cx } from "@/components/ui";
import { publicClient } from "@/lib/chain";
import { CATEGORY_NAMES, caps, chainId, chainLabel, zoneName } from "@/lib/config";
import { addresses, dalgubeolPayAbi, readBoostState, registryAbi, tokenAbi, type BoostState } from "@/lib/contracts";
import { parseChainError } from "@/lib/errors";
import { pct, won } from "@/lib/format";
import { runPayFlow, type PayFlowResult } from "@/lib/pay";
import { PARSE_ERROR_MESSAGES, parsePayParams } from "@/lib/qr";
import { zeroBoostReason } from "@/lib/reasons";

const QUOTE_DEBOUNCE_MS = 400;
const ZERO_PERSON = "0x0000000000000000000000000000000000000000000000000000000000000000";

interface Quote {
  boost: bigint;
  reason: string | null;
  state: BoostState;
}

/** QR landing page (SPEC 7.1): merchant and amount come from the QR; the pay flow is the same as `/`. */
export default function PayPage() {
  return (
    <Suspense fallback={<Spinner className="mx-auto mt-10 h-6 w-6" />}>
      <PayScreen />
    </Suspense>
  );
}

function PayScreen() {
  const params = useSearchParams();
  const parsed = useMemo(() => parsePayParams(new URLSearchParams(params.toString())), [params]);
  const actor = useConsumerActor();
  const { switchChain, wallet } = usePersona();
  const address = actor?.address ?? null;
  const isWallet = actor?.kind === "wallet";

  const [balance, setBalance] = useState<bigint | null>(null);
  const [credit, setCredit] = useState<bigint | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [useCredit, setUseCredit] = useState<number>(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<PayFlowResult | null>(null);
  const [error, setError] = useState<{ name: string | null; message: string } | null>(null);

  const request = parsed.ok ? parsed.value.request : null;
  const merchantInfo = parsed.ok ? parsed.value.merchantInfo : null;
  const amount = request?.amount ?? 0;

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    try {
      const addr = address;
      const [bal, personId] = await Promise.all([
        publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [addr] }) as Promise<bigint>,
        publicClient.readContract({ address: addresses.MerchantRegistry, abi: registryAbi, functionName: "personOf", args: [addr] }) as Promise<`0x${string}`>,
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

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    if (!address || !request || !merchantInfo) {
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
            args: [payer, request.merchant, BigInt(request.amount), BigInt(useCredit)],
          }) as Promise<bigint>,
          readBoostState(payer, request.merchant, merchantInfo.zoneId),
        ]);
        const reason = boost === 0n ? zeroBoostReason({ state, amount: BigInt(request.amount), useCredit: BigInt(useCredit) }) : null;
        setQuote({ boost, reason, state });
        setQuoteError(null);
      } catch (e) {
        setQuote(null);
        setQuoteError(parseChainError(e).message);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [address, request, merchantInfo, useCredit, result]);

  async function onPay() {
    if (!actor || !request) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (isWallet && !actor.chainOk) {
        setStep("지갑 네트워크를 전환하는 중");
        await switchChain();
      }
      const r = await runPayFlow(actor.signer, request.merchant, request.amount, useCredit, setStep);
      setResult(r);
      setUseCredit(0);
      await refreshBalances();
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(parseChainError(e));
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  if (!parsed.ok) {
    return (
      <>
        <PageHeader title="QR 결제" />
        <Notice tone="error" title="이 결제 링크는 열 수 없어요">
          {PARSE_ERROR_MESSAGES[parsed.error]}
        </Notice>
        <Link href="/" className="mt-4 inline-block text-[14px] font-medium text-brand-600 underline">
          소비자 화면으로
        </Link>
      </>
    );
  }

  if (!actor || !address) {
    return (
      <>
        <PageHeader title="QR 결제" desc={`${merchantInfo!.name}에 ${won(amount)}을 결제해요.`} />
        <PersonaGate roles={["payer"]} wallet title="결제할 지갑을 골라 주세요" desc="내 지갑을 연결하거나 데모 소비자 계정으로 결제할 수 있어요." />
      </>
    );
  }

  const creditMax = credit ?? 0n;
  const useCreditInvalid = BigInt(useCredit) > creditMax || useCredit > amount || useCredit < 0;
  const needsOnboard = isWallet && (registered === false || balance === 0n);
  const canPay = !isWallet || (registered === true && actor.chainOk);
  const personRemaining =
    quote && quote.state.personDay < BigInt(caps.personDailyBoost) ? BigInt(caps.personDailyBoost) - quote.state.personDay : 0n;

  return (
    <>
      <PageHeader title="QR 결제" desc="가맹점이 만든 결제 QR이에요. 금액을 확인하고 결제해 주세요." right={request!.ref ? <Badge tone="gray">참조 {request!.ref}</Badge> : null} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <WalletCard kind={actor.kind} label={actor.label} address={address} balance={balance} credit={credit} registered={isWallet ? registered : null} />
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
          {isWallet && needsOnboard && (
            <OnboardCard
              address={address}
              registered={registered === true}
              onDone={() => {
                refreshBalances();
                setTimeout(refreshBalances, 3000);
              }}
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
              <CardHeader title="결제 내용" />
              <div className="mt-4 rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[15px] font-semibold text-gray-900">{merchantInfo!.name}</p>
                <p className="text-[12px] text-gray-500">
                  {zoneName(merchantInfo!.zoneId)} · {CATEGORY_NAMES[merchantInfo!.categoryId] ?? merchantInfo!.categoryId} · <Mono>{request!.merchant.slice(0, 6)}…{request!.merchant.slice(-4)}</Mono>
                </p>
              </div>
              <div className="mt-4">
                <span className="text-[13px] font-medium text-gray-600">결제 금액</span>
                <p className="tnum mt-1 text-[32px] font-bold tracking-tight text-gray-900">{won(amount)}</p>
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
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-12"
                        onClick={() => setUseCredit(Number(creditMax < BigInt(amount) ? creditMax : BigInt(amount)))}
                      >
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
                {quote && (
                  <p className="tnum mt-1 text-[12px] text-gray-500">
                    {zoneName(merchantInfo!.zoneId)} 현재 {pct(quote.state.currentRate)} · 건당 최대 {won(caps.perTxBoost)} · 오늘 남은 한도 {won(personRemaining)}
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

              <Button type="submit" size="lg" full loading={busy} disabled={useCreditInvalid || !canPay} className="mt-4">
                {busy ? (step ?? "처리 중") : `${won(amount)} 결제하기`}
              </Button>
              <p className="mt-2 text-center text-[12px] text-gray-400">엔진 위험 판정 → 서명 → 온체인 결제 순으로 진행돼요.</p>

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

          <div className="text-center">
            <Link href="/" className="text-[14px] font-medium text-gray-600 underline">
              소비자 화면으로
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
