"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { clawbackPending, listPending, releasePending, type PendingRow } from "@/lib/city";
import { merchantByAddress, zoneName } from "@/lib/config";
import { riskLog, type RiskLogRow } from "@/lib/engine";
import { parseChainError, reasonLabel } from "@/lib/errors";
import { kst, num, short, won } from "@/lib/format";

const RISK_REFRESH_MS = 5_000;
const PENDING_REFRESH_MS = 5_000;

export function TierBadge({ tier }: { tier: number }) {
  const cls = tier === 0 ? "bg-green-100 text-green-800" : tier === 1 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>tier {tier}</span>;
}

export function RiskLogTable() {
  const [rows, setRows] = useState<RiskLogRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await riskLog(50);
        if (alive) {
          setRows(r);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, RISK_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold">위험 판정 로그 (최근 50건, 5초 갱신)</h2>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">판정이 없습니다.</p>
      ) : (
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-left text-gray-500">
              <tr>
                <th className="py-1 pr-2">시각</th>
                <th className="py-1 pr-2">결제자</th>
                <th className="py-1 pr-2">가맹점</th>
                <th className="py-1 pr-2 text-right">금액</th>
                <th className="py-1 pr-2">tier</th>
                <th className="py-1 pr-2 text-right">score</th>
                <th className="py-1">사유</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={`${r.ts}-${i}`}>
                  <td className="py-1 pr-2 whitespace-nowrap">{kst(r.ts)}</td>
                  <td className="py-1 pr-2 font-mono" title={r.payer}>
                    {short(r.payer)}
                  </td>
                  <td className="py-1 pr-2" title={r.merchant}>
                    {merchantByAddress(r.merchant)?.name ?? short(r.merchant)}
                  </td>
                  <td className="py-1 pr-2 text-right">{num(r.amount)}</td>
                  <td className="py-1 pr-2">
                    <TierBadge tier={r.tier} />
                  </td>
                  <td className="py-1 pr-2 text-right">{r.score.toFixed(3)}</td>
                  <td className="py-1">{r.reasons.map(reasonLabel).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PendingTable({
  actor,
  isBank,
  onChanged,
  refreshKey,
}: {
  actor: PrivateKeyAccount | null;
  isBank: boolean;
  onChanged: () => void;
  refreshKey: number;
}) {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<bigint | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listPending(true));
    } catch {
      // keep last rows
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, PENDING_REFRESH_MS);
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [load, refreshKey]);

  async function act(kind: "release" | "clawback", id: bigint) {
    if (!actor) return;
    setBusy(id);
    setMsg(null);
    try {
      const hash = kind === "release" ? await releasePending(actor, id) : await clawbackPending(actor, id);
      setMsg({ ok: true, text: `${kind === "release" ? "지급" : "환수"} 완료 #${id} (tx ${short(hash, 5)})` });
      await load();
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: parseChainError(e).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold">보류 목록 (status 0, 5초 갱신)</h2>
      {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">보류 중인 보너스가 없습니다.</p>
      ) : (
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1 pr-2">ID</th>
              <th className="py-1 pr-2">personId</th>
              <th className="py-1 pr-2">상권</th>
              <th className="py-1 pr-2 text-right">금액</th>
              <th className="py-1 pr-2 text-right">지급까지</th>
              <th className="py-1">동작</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => {
              const left = Math.max(0, p.releaseAt - now);
              return (
                <tr key={p.id.toString()}>
                  <td className="py-1 pr-2">{p.id.toString()}</td>
                  <td className="py-1 pr-2 font-mono" title={p.personId}>
                    {short(p.personId, 6)}
                  </td>
                  <td className="py-1 pr-2">{zoneName(p.zoneId)}</td>
                  <td className="py-1 pr-2 text-right">{won(p.amount)}</td>
                  <td className="py-1 pr-2 text-right">{left > 0 ? `${left}초` : "가능"}</td>
                  <td className="py-1 space-x-1">
                    <button
                      onClick={() => act("release", p.id)}
                      disabled={!actor || busy !== null || left > 0}
                      className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-40"
                      title="누구나 호출 가능 (releaseAt 이후)"
                    >
                      지급
                    </button>
                    <button
                      onClick={() => act("clawback", p.id)}
                      disabled={!isBank || !actor || busy !== null}
                      className="rounded bg-red-600 px-2 py-0.5 text-white disabled:opacity-40"
                      title={isBank ? "예산으로 환수" : "은행 페르소나에서만 가능"}
                    >
                      환수
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
