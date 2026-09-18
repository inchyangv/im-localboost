"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersona } from "@/components/PersonaProvider";
import { publicClient } from "@/lib/chain";
import { CATEGORY_NAMES, caps, merchantByAddress, zoneName } from "@/lib/config";
import { addresses, chainNow, hourEpoch, localBoostAbi, tokenAbi } from "@/lib/contracts";
import { payments as fetchPayments, type PaymentRow } from "@/lib/engine";
import { kst, num, short, txUrl, won } from "@/lib/format";

const REFRESH_MS = 10_000;

interface SlotGauge {
  epoch: number;
  volume: bigint;
  cap: bigint;
  baseline: bigint;
}

export default function MerchantPage() {
  const { persona } = usePersona();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [gauge, setGauge] = useState<SlotGauge | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);

  const address = persona?.role === "merchant" ? persona.account.address : null;
  const info = address ? merchantByAddress(address) : undefined;

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setRows(await fetchPayments({ merchant: address, limit: 50 }));
      setEngineError(null);
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
    }
    try {
      const now = await chainNow();
      const epoch = hourEpoch(now);
      const [volume, bal] = await Promise.all([
        publicClient.readContract({ address: addresses.LocalBoost, abi: localBoostAbi, functionName: "slotVolume", args: [address, BigInt(epoch)] }) as Promise<bigint>,
        publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
      ]);
      const baseline = BigInt(info?.slotBaseline ?? 0);
      setGauge({ epoch, volume, baseline, cap: (baseline * BigInt(caps.slotCapBps)) / 10000n });
      setBalance(bal);
    } catch {
      setGauge(null);
      setBalance(null);
    }
  }, [address, info?.slotBaseline]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!persona || !address) {
    return (
      <section className="rounded border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-semibold">가맹점</h1>
        <p className="mt-2 text-sm text-gray-600">상단에서 가맹점 페르소나(가맹점 1~3)를 선택하세요.</p>
      </section>
    );
  }

  const remaining = gauge ? (gauge.volume >= gauge.cap ? 0n : gauge.cap - gauge.volume) : null;
  const ratio = gauge && gauge.cap > 0n ? Math.min(100, Number((gauge.volume * 100n) / gauge.cap)) : 0;

  return (
    <div className="space-y-6">
      <section className="rounded border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">{info?.name ?? persona.label}</h1>
          <code className="text-xs text-gray-500" title={address}>
            {short(address, 6)}
          </code>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-gray-500">상권</dt>
          <dd>{info ? zoneName(info.zoneId) : "미등록"}</dd>
          <dt className="text-gray-500">업종</dt>
          <dd>{info ? (CATEGORY_NAMES[info.categoryId] ?? info.categoryId) : "—"}</dd>
          <dt className="text-gray-500">기준 매출 (시간당)</dt>
          <dd>{info ? won(info.slotBaseline) : "—"}</dd>
          <dt className="text-gray-500">iMKRW 잔액</dt>
          <dd className="font-medium">{balance === null ? "—" : won(balance)}</dd>
        </dl>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold">이번 시간 슬롯 게이지</h2>
        {gauge ? (
          <>
            <div className="mt-2 flex items-baseline justify-between text-sm">
              <span>
                이번 시간 매출 <strong>{num(gauge.volume)}</strong> / 상한 <strong>{num(gauge.cap)}</strong>
              </span>
              <span className="text-xs text-gray-500">epoch {gauge.epoch}</span>
            </div>
            <div className="mt-2 h-4 w-full overflow-hidden rounded bg-gray-200" role="progressbar" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full ${ratio >= 100 ? "bg-red-500" : ratio >= 70 ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${ratio}%` }} />
            </div>
            <p className="mt-2 text-xs text-gray-600">
              남은 보너스 대상 금액 {remaining === null ? "—" : won(remaining)} · 기준 매출의 {caps.slotCapBps / 100}%까지 보너스 대상
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-gray-500">체인에서 읽는 중…</p>
        )}
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold">수취 내역 (최근 50건)</h2>
        {engineError && <p className="mt-1 text-xs text-red-600">{engineError}</p>}
        {rows.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">기록이 없습니다.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-1 pr-2">시각 (KST)</th>
                  <th className="py-1 pr-2">결제자</th>
                  <th className="py-1 pr-2 text-right">금액</th>
                  <th className="py-1 pr-2 text-right">크레딧 사용</th>
                  <th className="py-1 pr-2 text-right">보너스</th>
                  <th className="py-1 pr-2">tier</th>
                  <th className="py-1">tx</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => {
                  const url = txUrl(p.txHash);
                  return (
                    <tr key={`${p.txHash}-${p.blockNumber}`}>
                      <td className="py-1 pr-2 whitespace-nowrap">{kst(p.ts)}</td>
                      <td className="py-1 pr-2 font-mono" title={p.payer}>
                        {short(p.payer)}
                      </td>
                      <td className="py-1 pr-2 text-right">{num(p.amount)}</td>
                      <td className="py-1 pr-2 text-right">{num(p.useCredit)}</td>
                      <td className={`py-1 pr-2 text-right ${p.boost > 0 ? "text-blue-700" : "text-gray-400"}`}>{num(p.boost)}</td>
                      <td className="py-1 pr-2">
                        <span className={`rounded px-1.5 py-0.5 ${p.tier === 0 ? "bg-green-100" : p.tier === 1 ? "bg-amber-100" : "bg-red-100"}`}>{p.tier}</span>
                      </td>
                      <td className="py-1 font-mono">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                            {short(p.txHash, 5)}
                          </a>
                        ) : (
                          <span title={p.txHash}>{short(p.txHash, 5)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
