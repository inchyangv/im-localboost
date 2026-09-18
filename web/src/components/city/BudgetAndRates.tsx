"use client";

import { useEffect, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { AmountInput, Button, Card, CardHeader, Field, Notice, Table, TxLink, cx, selectCls, td, tdRight, th, thRight } from "@/components/ui";
import { cityBalance, depositBudget } from "@/lib/city";
import { zones } from "@/lib/config";
import { ratesCurrent, ratesPublish, type RateRow } from "@/lib/engine";
import { parseChainError } from "@/lib/errors";
import { num, pct, won } from "@/lib/format";

const QUICK_BUDGETS = [500_000, 1_000_000];

export function BudgetForm({ city, onDone }: { city: PrivateKeyAccount | null; onDone: () => void }) {
  const [zoneId, setZoneId] = useState<number>(4);
  const [amount, setAmount] = useState<number>(500_000);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: React.ReactNode } | null>(null);

  useEffect(() => {
    if (!city) return;
    cityBalance(city.address).then(setBalance).catch(() => setBalance(null));
  }, [city, msg]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!city) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await depositBudget(city, zoneId, BigInt(amount), setStep);
      setMsg({
        ok: true,
        text: (
          <>
            예치 완료 <TxLink hash={r.hash} />
            {r.approveHash && (
              <>
                {" "}
                · 승인 <TxLink hash={r.approveHash} />
              </>
            )}
          </>
        ),
      });
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: parseChainError(err).message });
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader
          title="예산 예치"
          desc="대구시 iMKRW를 상권 예산으로 옮겨요. 예산이 0인 상권에는 보너스가 나가지 않아요."
          right={city && <span className="tnum">대구시 잔액 {balance === null ? "—" : won(balance)}</span>}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="상권">
            <select className={selectCls} value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))} disabled={!city}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="금액">
            <AmountInput value={amount} onChange={setAmount} disabled={!city} ariaLabel="예치 금액 (원)" />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_BUDGETS.map((v) => (
            <button
              key={v}
              type="button"
              disabled={!city}
              onClick={() => setAmount(v)}
              className={cx(
                "tnum rounded-full px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-40",
                amount === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              )}
            >
              {v / 10_000}만원
            </button>
          ))}
        </div>
        <Button type="submit" disabled={!city || amount <= 0} loading={busy} className="mt-4" full>
          {busy ? (step ?? "처리 중") : "예치"}
        </Button>
        {!city && <p className="mt-2 text-center text-[12px] text-gray-500">대구시 페르소나에서만 예치할 수 있어요.</p>}
        {msg && (
          <Notice tone={msg.ok ? "success" : "error"} className="mt-3">
            {msg.text}
          </Notice>
        )}
      </form>
    </Card>
  );
}

export function RatesPanel({ enabled, onPublished }: { enabled: boolean; onPublished: () => void }) {
  const [fixed, setFixed] = useState(true);
  const [rows, setRows] = useState<RateRow[]>([]);
  const [source, setSource] = useState<string>("");
  const [tx, setTx] = useState<{ txHash: string; nextTxHash: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await ratesCurrent());
      setSource("/rates/current");
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      const r = await ratesPublish(fixed ? { "4": 1000 } : {});
      setRows(r.rates);
      setSource("/rates/publish 응답");
      setTx({ txHash: r.txHash, nextTxHash: r.nextTxHash });
      onPublished();
      setTimeout(load, 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="보너스율 게시" desc="엔진이 수요 예측으로 계산한 율을 현재 시간과 다음 시간에 게시해요." />

      <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
        <span>
          <span className="block text-[14px] font-medium text-gray-800">데모 전용: 북성로 10% 고정</span>
          <span className="block text-[12px] text-gray-500">다른 상권은 엔진 계산값을 그대로 게시해요.</span>
        </span>
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input type="checkbox" className="peer sr-only" checked={fixed} onChange={(e) => setFixed(e.target.checked)} disabled={!enabled} />
          <span className="absolute inset-0 rounded-full bg-gray-200 transition-colors peer-checked:bg-brand-500 peer-disabled:opacity-50" />
          <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
      </label>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={publish} disabled={!enabled} loading={busy} className="flex-1">
          {busy ? "게시 중" : "율 게시"}
        </Button>
        <Button variant="secondary" onClick={load} type="button">
          현재 율 다시 읽기
        </Button>
      </div>
      {!enabled && <p className="mt-2 text-center text-[12px] text-gray-500">대구시 페르소나에서만 게시할 수 있어요.</p>}
      {tx && (
        <p className="mt-3 text-[12px] text-gray-600">
          현재 시간 <TxLink hash={tx.txHash} /> · 다음 시간 <TxLink hash={tx.nextTxHash} />
        </p>
      )}
      {err && (
        <Notice tone="error" className="mt-3">
          {err}
        </Notice>
      )}

      <Table className="mt-4" minWidth={420}>
        <thead>
          <tr className="border-b border-gray-100">
            <th className={th}>상권</th>
            <th className={thRight}>게시 율</th>
            <th className={thRight}>여유 (slack)</th>
            <th className={thRight}>예측 매출</th>
            <th className={thRight}>기준 매출</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && (
            <tr>
              <td className={td} colSpan={5}>
                <span className="text-gray-500">엔진에서 율을 읽는 중이에요.</span>
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.zoneId}>
              <td className={cx(td, "font-medium")}>{r.name}</td>
              <td className={cx(tdRight, "font-semibold", r.bps > 0 ? "text-brand-600" : "text-gray-400")}>
                {pct(r.bps)} <span className="text-[11px] font-normal text-gray-400">{r.bps}bps</span>
              </td>
              <td className={tdRight}>{r.slack.toFixed(3)}</td>
              <td className={tdRight}>{num(r.predictedSales)}</td>
              <td className={tdRight}>{num(r.baseline)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {source && <p className="mt-2 text-[11px] text-gray-400">출처: {source}</p>}
    </Card>
  );
}
