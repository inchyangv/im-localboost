"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersona } from "@/components/PersonaProvider";
import { ZoneMap, useZoneRates } from "@/components/ZoneMap";
import { publicClient } from "@/lib/chain";
import { CATEGORY_NAMES, caps, merchants, zoneName } from "@/lib/config";
import { addresses, localBoostAbi, readBoostState, registryAbi, tokenAbi, type BoostState } from "@/lib/contracts";
import { payments as fetchPayments, type PaymentRow } from "@/lib/engine";
import { parseChainError, reasonLabel } from "@/lib/errors";
import { kst, num, pct, short, txUrl, won } from "@/lib/format";
import { runPayFlow, type PayFlowResult } from "@/lib/pay";
import { pendingNote, zeroBoostReason } from "@/lib/reasons";

const QUOTE_DEBOUNCE_MS = 500;
const PAYMENTS_REFRESH_MS = 10_000;

interface Quote {
  boost: bigint;
  reason: string | null;
  state: BoostState;
}

export default function ConsumerPage() {
  const { persona } = usePersona();
  const { rates } = useZoneRates();
  const [zone, setZone] = useState<number | null>(null);
  const [merchant, setMerchant] = useState<`0x${string}`>(merchants[0]?.address ?? "0x");
  const [amount, setAmount] = useState<number>(10_000);
  const [useCredit, setUseCredit] = useState<number>(0);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [credit, setCredit] = useState<bigint | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<PayFlowResult | null>(null);
  const [error, setError] = useState<{ name: string | null; message: string } | null>(null);
  const [recent, setRecent] = useState<PaymentRow[]>([]);

  const visibleMerchants = useMemo(() => (zone ? merchants.filter((m) => m.zoneId === zone) : merchants), [zone]);
  const selected = merchants.find((m) => m.address === merchant);
  const isPayer = persona?.role === "payer";

  useEffect(() => {
    if (zone && selected && selected.zoneId !== zone && visibleMerchants[0]) setMerchant(visibleMerchants[0].address);
  }, [zone, selected, visibleMerchants]);

  const refreshBalances = useCallback(async () => {
    if (!persona) return;
    try {
      const addr = persona.account.address;
      const [bal, personId] = await Promise.all([
        publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [addr] }) as Promise<bigint>,
        publicClient.readContract({ address: addresses.MerchantRegistry, abi: registryAbi, functionName: "personOf", args: [addr] }) as Promise<`0x${string}`>,
      ]);
      const cr = (await publicClient.readContract({ address: addresses.LocalBoost, abi: localBoostAbi, functionName: "creditOf", args: [personId] })) as bigint;
      setBalance(bal);
      setCredit(cr);
    } catch {
      setBalance(null);
      setCredit(null);
    }
  }, [persona]);

  const refreshRecent = useCallback(async () => {
    if (!persona) return;
    try {
      setRecent(await fetchPayments({ payer: persona.account.address, limit: 10 }));
    } catch {
      // engine down: keep the last list
    }
  }, [persona]);

  useEffect(() => {
    refreshBalances();
    refreshRecent();
    const id = setInterval(refreshRecent, PAYMENTS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshBalances, refreshRecent]);

  // Debounced quoteBoost + zero-bonus reason preview.
  useEffect(() => {
    if (!persona || !isPayer || !selected || amount <= 0) {
      setQuote(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const payer = persona.account.address;
        const [boost, state] = await Promise.all([
          publicClient.readContract({
            address: addresses.LocalBoost,
            abi: localBoostAbi,
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
  }, [persona, isPayer, selected, amount, useCredit, result]);

  async function onPay() {
    if (!persona || !selected) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await runPayFlow(persona.account, selected.address, amount, useCredit, setStep);
      setResult(r);
      await refreshBalances();
      setTimeout(refreshRecent, 3000);
    } catch (e) {
      setError(parseChainError(e));
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  if (!persona || !isPayer) {
    return (
      <section className="rounded border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-semibold">소비자</h1>
        <p className="mt-2 text-sm text-gray-600">상단에서 소비자 페르소나(소비자 1~5)를 선택하세요.</p>
      </section>
    );
  }

  const creditMax = credit ?? 0n;
  const useCreditInvalid = BigInt(useCredit) > creditMax || useCredit > amount || useCredit < 0;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold">상권 보너스율 (현재 시간)</h2>
        <ZoneMap rates={rates} selected={zone} onSelect={setZone} />
        <p className="mt-2 text-xs text-gray-500">
          상권을 누르면 가맹점 목록이 그 상권으로 좁혀집니다. 10초마다 갱신됩니다.
          {zone && (
            <button className="ml-2 underline" onClick={() => setZone(null)}>
              전체 보기
            </button>
          )}
        </p>
      </section>

      <section className="space-y-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{persona.label} 지갑</h2>
            <code className="text-xs text-gray-500">{short(persona.account.address, 6)}</code>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">iMKRW 잔액</dt>
            <dd className="text-right font-medium">{balance === null ? "—" : won(balance)}</dd>
            <dt className="text-gray-500">보너스 크레딧</dt>
            <dd className="text-right font-medium">{credit === null ? "—" : won(credit)}</dd>
          </dl>
        </div>

        <form
          className="rounded border border-gray-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onPay();
          }}
        >
          <h2 className="text-base font-semibold">결제</h2>
          <label className="mt-3 block text-sm">
            <span className="text-gray-600">가맹점</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value as `0x${string}`)}
            >
              {visibleMerchants.map((m) => (
                <option key={m.address} value={m.address}>
                  {m.name} · {zoneName(m.zoneId)} · {CATEGORY_NAMES[m.categoryId] ?? m.categoryId}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">금액 (원)</span>
              <input
                type="number"
                min={1000}
                step={1000}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">크레딧 사용 (원)</span>
              <input
                type="number"
                min={0}
                step={100}
                max={Number(creditMax)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={useCredit}
                onChange={(e) => setUseCredit(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              />
            </label>
          </div>
          {useCreditInvalid && <p className="mt-1 text-xs text-red-600">크레딧 사용액은 보유 크레딧과 결제 금액 이하여야 합니다.</p>}

          <div className="mt-3 rounded bg-gray-50 p-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-gray-600">예상 보너스</span>
              <span className="text-lg font-semibold">{quote ? won(quote.boost) : quoteError ? "—" : "계산 중…"}</span>
            </div>
            {quote && quote.reason && <p className="mt-1 text-xs text-amber-700">사유: {quote.reason}</p>}
            {quote && selected && (
              <p className="mt-1 text-xs text-gray-500">
                {zoneName(selected.zoneId)} 현재 율 {pct(quote.state.currentRate)} · 건당 상한 {won(caps.perTxBoost)} · 오늘 개인 잔여{" "}
                {won(BigInt(caps.personDailyBoost) - (quote.state.personDay < BigInt(caps.personDailyBoost) ? quote.state.personDay : BigInt(caps.personDailyBoost)))}
              </p>
            )}
            {quoteError && <p className="mt-1 text-xs text-red-600">{quoteError}</p>}
          </div>

          <button
            type="submit"
            disabled={busy || amount <= 0 || useCreditInvalid || !selected}
            className="mt-3 w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "처리 중…" : `${won(amount)} 결제하기`}
          </button>
          {step && <p className="mt-2 text-xs text-gray-600">{step}</p>}
          {error && (
            <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              결제 실패: {error.message}
              {error.name && <code className="ml-1 text-[11px]">({error.name})</code>}
            </p>
          )}
        </form>

        {result && <ResultCard result={result} />}

        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold">최근 결제</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">기록이 없습니다.</p>
          ) : (
            <ul className="mt-2 divide-y text-xs">
              {recent.map((p) => (
                <li key={`${p.txHash}-${p.blockNumber}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-gray-500">{kst(p.ts)}</span>
                  <span>{merchants.find((m) => m.address.toLowerCase() === p.merchant)?.name ?? short(p.merchant)}</span>
                  <span>{won(p.amount)}</span>
                  <span className={p.boost > 0 ? "text-blue-700" : "text-gray-400"}>+{num(p.boost)}</span>
                  <TxLink hash={p.txHash} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  const url = txUrl(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-blue-700 underline">
      {short(hash, 5)}
    </a>
  ) : (
    <code className="font-mono text-gray-500" title={hash}>
      {short(hash, 5)}
    </code>
  );
}

function ResultCard({ result }: { result: PayFlowResult }) {
  const { paid, attest: att, hash, approveHash } = result;
  const [state, setState] = useState<BoostState | null>(null);
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!paid) return;
    readBoostState(paid.payer, paid.merchant, paid.zoneId).then(setState).catch(() => setState(null));
  }, [paid]);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!paid) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
        트랜잭션은 성공했지만 Paid 이벤트를 찾지 못했습니다. <TxLink hash={hash} />
      </div>
    );
  }
  const status = paid.boost === 0n ? "0원" : paid.tier === 1 ? "보류" : "지급";
  const color = status === "지급" ? "border-green-300 bg-green-50" : status === "보류" ? "border-amber-300 bg-amber-50" : "border-gray-300 bg-gray-50";
  let reason: string | null = null;
  if (paid.boost === 0n) {
    // After the payment the counters already include it; when pairDay was just set that is the honest reason.
    reason = state
      ? zeroBoostReason({ state, amount: paid.amount, useCredit: paid.useCredit, tier: att.tier, engineReasons: att.reasons })
      : att.tier >= 2
        ? `위험 등급 2: 보너스 미지급 (${att.reasons.map(reasonLabel).join(", ")})`
        : null;
  } else if (paid.tier === 1 && state) {
    reason = pendingNote(state.now + caps.pendingDelay, now, att.reasons);
  } else if (paid.tier === 1) {
    reason = pendingNote(caps.pendingDelay + Math.floor(Date.now() / 1000), now, att.reasons);
  }

  return (
    <div className={`rounded border p-4 text-sm ${color}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">결과: {status}</h2>
        <span className="text-lg font-semibold">보너스 {won(paid.boost)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-gray-500">결제 금액</dt>
        <dd>
          {won(paid.amount)} {paid.useCredit > 0n && `(크레딧 ${won(paid.useCredit)} 사용)`}
        </dd>
        <dt className="text-gray-500">위험 등급</dt>
        <dd>
          tier {paid.tier} · score {att.score.toFixed(3)}
          {att.reasons.length > 0 && ` · ${att.reasons.map(reasonLabel).join(", ")}`}
        </dd>
        {paid.pendingId > 0n && (
          <>
            <dt className="text-gray-500">보류 ID</dt>
            <dd>{paid.pendingId.toString()}</dd>
          </>
        )}
        {reason && (
          <>
            <dt className="text-gray-500">사유</dt>
            <dd className="text-amber-800">{reason}</dd>
          </>
        )}
        <dt className="text-gray-500">트랜잭션</dt>
        <dd>
          <TxLink hash={hash} />
          {approveHash && (
            <span className="ml-2 text-gray-500">
              (approve <TxLink hash={approveHash} />)
            </span>
          )}
        </dd>
      </dl>
    </div>
  );
}
