"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card, CardHeader, Mono, PageHeader, Stat, Table, TierBadge, TxLink, cx, td, tdRight, th, thRight } from "@/components/ui";
import { chainId, chainLabel, merchantByAddress, zoneName } from "@/lib/config";
import { health, payments as fetchPayments, riskLog, type HealthResponse, type PaymentRow, type RiskLogRow } from "@/lib/engine";
import { reasonLabel } from "@/lib/errors";
import { kstShort, num, short, won } from "@/lib/format";

const REFRESH_MS = 10_000;
const KST_OFFSET = 9 * 3600;

function kstDay(ts: number): number {
  return Math.floor((ts + KST_OFFSET) / 86400);
}

/** Internal dashboard: every payment the engine has ingested, risk decisions, and engine health. */
export default function AdminDashboard() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [risk, setRisk] = useState<RiskLogRow[]>([]);
  const [h, setH] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, r, hh] = await Promise.all([fetchPayments({ limit: 100 }), riskLog(50), health().catch(() => null)]);
      setRows(p);
      setRisk(r);
      setH(hh);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const today = kstDay(Math.floor(Date.now() / 1000));
  const todayRows = rows.filter((p) => kstDay(p.ts) === today);
  const todaySales = todayRows.reduce((s, p) => s + p.amount, 0);
  const todayBoost = todayRows.reduce((s, p) => s + p.boost, 0);
  const blocked = todayRows.filter((p) => p.tier === 2).length;
  const pending = todayRows.filter((p) => p.tier === 1 && p.boost > 0).length;

  return (
    <>
      <PageHeader
        title="대시보드"
        desc="엔진이 체인에서 읽어 온 전체 결제와 위험 판정이에요. 소비자 화면에는 본인 결제만 보여요."
        right={
          h ? (
            <Badge tone={h.ok ? "brand" : "red"}>
              엔진 {h.ok ? "정상" : "오류"} · 블록 {h.lastBlock ?? "—"}
            </Badge>
          ) : (
            <Badge tone="gray">엔진 확인 중</Badge>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat label="오늘 결제 건수" value={`${num(todayRows.length)}건`} size="lg" sub={`전체 기록 ${num(rows.length)}건 (최근 100건 기준)`} />
        </Card>
        <Card>
          <Stat label="오늘 결제 금액" value={won(todaySales)} size="lg" sub="iMKRW 결제 총액" />
        </Card>
        <Card>
          <Stat label="오늘 지급·보류 보너스" value={won(todayBoost)} size="lg" tone={todayBoost > 0 ? "brand" : "muted"} sub={`보류 ${pending}건`} />
        </Card>
        <Card>
          <Stat label="오늘 차단(tier 2)" value={`${blocked}건`} size="lg" tone={blocked > 0 ? "default" : "muted"} sub="보너스 0원으로 결제만 통과" />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card>
          <CardHeader title="최근 결제 (전체)" desc="10초마다 갱신" right={<span className="text-[12px] text-gray-500">{chainLabel(chainId)}</span>} />
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
          {rows.length === 0 ? (
            <p className="mt-4 text-[13px] text-gray-500">아직 결제 기록이 없어요.</p>
          ) : (
            <Table className="mt-3" minWidth={640}>
              <thead>
                <tr>
                  <th className={th}>시각</th>
                  <th className={th}>결제자</th>
                  <th className={th}>가맹점</th>
                  <th className={thRight}>금액</th>
                  <th className={thRight}>보너스</th>
                  <th className={th}>등급</th>
                  <th className={th}>tx</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const m = merchantByAddress(p.merchant);
                  return (
                    <tr key={`${p.txHash}-${p.blockNumber}`} className="border-t border-gray-100">
                      <td className={cx(td, "tnum whitespace-nowrap")}>{kstShort(p.ts)}</td>
                      <td className={td}>
                        <Mono title={p.payer}>{short(p.payer, 4)}</Mono>
                      </td>
                      <td className={td}>
                        <span className="block truncate">{m?.name ?? short(p.merchant, 4)}</span>
                        <span className="text-[11px] text-gray-400">{zoneName(p.zoneId)}</span>
                      </td>
                      <td className={tdRight}>{won(p.amount)}</td>
                      <td className={cx(tdRight, p.boost > 0 ? "text-brand-600" : "text-gray-400")}>{p.boost > 0 ? `+${num(p.boost)}` : "0"}</td>
                      <td className={td}>
                        <TierBadge tier={p.tier} />
                      </td>
                      <td className={td}>
                        <TxLink hash={p.txHash} n={4} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="위험 판정 로그" desc="엔진 /attest 결과 최근 50건" right={<Link href="/admin/city" className="text-[12px] text-brand-600 underline underline-offset-2">보류·환수 관리</Link>} />
            {risk.length === 0 ? (
              <p className="mt-4 text-[13px] text-gray-500">판정이 없어요.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {risk.slice(0, 12).map((r, i) => (
                  <li key={`${r.ts}-${r.payer}-${i}`} className="flex items-center gap-3 py-2.5">
                    <TierBadge tier={r.tier} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-gray-900">
                        <Mono>{short(r.payer, 4)}</Mono> → {merchantByAddress(r.merchant)?.name ?? short(r.merchant, 4)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {kstShort(r.ts)} · score {r.score.toFixed(3)}
                        {r.reasons.length > 0 && ` · ${r.reasons.map(reasonLabel).join(", ")}`}
                      </p>
                    </div>
                    <span className="tnum text-[13px] text-gray-700">{won(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="바로 가기" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/merchant" className="rounded-full bg-gray-100 px-3 py-1.5 text-[13px] font-medium text-gray-800 hover:bg-gray-200">
                가맹점 화면 (수취·QR)
              </Link>
              <Link href="/admin/city" className="rounded-full bg-gray-100 px-3 py-1.5 text-[13px] font-medium text-gray-800 hover:bg-gray-200">
                대구시·은행 운영
              </Link>
              <Link href="/" className="rounded-full bg-gray-100 px-3 py-1.5 text-[13px] font-medium text-gray-800 hover:bg-gray-200">
                소비자 앱
              </Link>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-gray-500">
              상단의 데모 계정 메뉴는 이 관리자 영역에서만 보여요. 소비자 앱은 본인 지갑으로만 결제해요.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
