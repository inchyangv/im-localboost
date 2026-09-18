"use client";

import { useEffect, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { cityBalance, depositBudget } from "@/lib/city";
import { zones } from "@/lib/config";
import { ratesCurrent, ratesPublish, type RateRow } from "@/lib/engine";
import { parseChainError } from "@/lib/errors";
import { num, pct, short, txUrl, won } from "@/lib/format";

export function BudgetForm({ city, onDone }: { city: PrivateKeyAccount | null; onDone: () => void }) {
  const [zoneId, setZoneId] = useState<number>(4);
  const [amount, setAmount] = useState<number>(500_000);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
      setMsg({ ok: true, text: `예치 완료 (tx ${short(r.hash, 5)}${r.approveHash ? `, approve ${short(r.approveHash, 5)}` : ""})` });
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: parseChainError(err).message });
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  return (
    <form onSubmit={submit} className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold">예산 예치 (대구시)</h2>
      <p className="mt-1 text-xs text-gray-500">대구시 iMKRW 잔액: {balance === null ? "—" : won(balance)}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">상권</span>
          <select className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">금액 (원)</span>
          <input
            type="number"
            min={1}
            step={10000}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
          />
        </label>
      </div>
      <button type="submit" disabled={!city || busy || amount <= 0} className="mt-3 rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? "처리 중…" : "예치"}
      </button>
      {!city && <p className="mt-1 text-xs text-gray-500">대구시 페르소나에서만 예치할 수 있습니다.</p>}
      {step && <p className="mt-1 text-xs text-gray-600">{step}</p>}
      {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </form>
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

  const link = (h: string) => {
    const u = txUrl(h);
    return u ? (
      <a href={u} target="_blank" rel="noreferrer" className="font-mono text-blue-700 underline">
        {short(h, 5)}
      </a>
    ) : (
      <code className="font-mono" title={h}>
        {short(h, 5)}
      </code>
    );
  };

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">보너스율 게시 (대구시)</h2>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={fixed} onChange={(e) => setFixed(e.target.checked)} />
          데모 전용: 북성로 10% 고정
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button onClick={publish} disabled={!enabled || busy} className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "게시 중…" : "율 게시"}
        </button>
        <button onClick={load} className="text-xs underline">
          현재 율 다시 읽기
        </button>
        {!enabled && <span className="text-xs text-gray-500">대구시 페르소나에서만 게시할 수 있습니다.</span>}
      </div>
      {tx && (
        <p className="mt-2 text-xs text-gray-600">
          현재 시간 tx {link(tx.txHash)} · 다음 시간 tx {link(tx.nextTxHash)}
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      <table className="mt-3 w-full text-xs">
        <thead className="text-left text-gray-500">
          <tr>
            <th className="py-1">상권</th>
            <th className="py-1 text-right">bps</th>
            <th className="py-1 text-right">slack</th>
            <th className="py-1 text-right">예측 매출</th>
            <th className="py-1 text-right">기준</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.zoneId}>
              <td className="py-1">{r.name}</td>
              <td className="py-1 text-right font-medium">
                {r.bps} ({pct(r.bps)})
              </td>
              <td className="py-1 text-right">{r.slack.toFixed(3)}</td>
              <td className="py-1 text-right">{num(r.predictedSales)}</td>
              <td className="py-1 text-right">{num(r.baseline)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {source && <p className="mt-1 text-[11px] text-gray-400">출처: {source}</p>}
    </section>
  );
}
