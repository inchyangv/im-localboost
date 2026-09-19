"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CountUp } from "@/components/motion";
import { Card, CardHeader, EmptyRow, Icon, IconTile, LiveDot, Mono, PageHeader, Stat, Table, TierBadge, TxLink, cx, td, tdRight, th, thRight, tr, type IconName } from "@/components/ui";
import { chainId, chainLabel, merchantByAddress, zoneName } from "@/lib/config";
import { health, payments as fetchPayments, riskLog, type HealthResponse, type PaymentRow, type RiskLogRow } from "@/lib/engine";
import { reasonLabel } from "@/lib/errors";
import { kstShort, num, short, won } from "@/lib/format";

const REFRESH_MS = 10_000;

const SHORTCUTS: Array<{ href: string; label: string; desc: string; icon: IconName }> = [
  { href: "/admin/merchant", label: "가맹점 화면", desc: "수취·QR", icon: "store" },
  { href: "/admin/city", label: "대구시 운영", desc: "예산·율·상한", icon: "trend" },
  { href: "/admin/bank", label: "은행·정산", desc: "원화 지급·환수", icon: "bank" },
  { href: "/", label: "소비자 앱", desc: "지갑으로 결제", icon: "pay" },
];
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
          <span className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-3.5 text-[13px] font-medium text-gray-700 shadow-card">
            <LiveDot tone={!h ? "gray" : h.ok ? "brand" : "red"} />
            {h ? (
              <>
                엔진 {h.ok ? "정상" : "오류"}
                <span className="tnum text-gray-400">블록 {h.lastBlock ?? "—"}</span>
              </>
            ) : (
              "엔진 확인 중"
            )}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card className="reveal" style={{ ["--i" as string]: 1 }}>
          <Stat
            icon={<IconTile name="list" tone="gray" size="sm" />}
            label="오늘 결제 건수"
            value={<CountUp value={todayRows.length} format={(v) => `${num(v)}건`} />}
            size="lg"
            sub={`전체 기록 ${num(rows.length)}건 (최근 100건 기준)`}
          />
        </Card>
        <Card className="reveal" style={{ ["--i" as string]: 2 }}>
          <Stat icon={<IconTile name="coins" tone="gray" size="sm" />} label="오늘 결제 금액" value={<CountUp value={todaySales} format={won} />} size="lg" sub="iMKRW 결제 총액" />
        </Card>
        <Card className="reveal" style={{ ["--i" as string]: 3 }}>
          <Stat
            icon={<IconTile name="spark" tone="brand" size="sm" />}
            label="오늘 지급·보류 보너스"
            value={<CountUp value={todayBoost} format={won} />}
            size="lg"
            tone={todayBoost > 0 ? "brand" : "muted"}
            sub={`보류 ${pending}건`}
          />
        </Card>
        <Card className="reveal" style={{ ["--i" as string]: 4 }}>
          <Stat
            icon={<IconTile name="ban" tone={blocked > 0 ? "red" : "gray"} size="sm" />}
            label="오늘 차단(tier 2)"
            value={<CountUp value={blocked} format={(v) => `${num(v)}건`} />}
            size="lg"
            tone={blocked > 0 ? "default" : "muted"}
            sub="보너스 0원으로 결제만 통과"
          />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="reveal" style={{ ["--i" as string]: 5 }}>
          <CardHeader
            title="최근 결제 (전체)"
            desc={chainLabel(chainId)}
            right={
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
                <LiveDot />
                10초마다 갱신
              </span>
            }
          />
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
          {rows.length === 0 ? (
            <EmptyRow icon="list">아직 결제 기록이 없어요.</EmptyRow>
          ) : (
            <Table className="mt-4" minWidth={680}>
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
                    <tr key={`${p.txHash}-${p.blockNumber}`} className={tr}>
                      <td className={cx(td, "tnum whitespace-nowrap")}>{kstShort(p.ts)}</td>
                      <td className={td}>
                        <Mono title={p.payer}>{short(p.payer, 4)}</Mono>
                      </td>
                      <td className={td}>
                        <span className="block max-w-[180px] truncate font-medium text-gray-900">{m?.name ?? short(p.merchant, 4)}</span>
                        <span className="text-[11px] text-gray-400">{zoneName(p.zoneId)}</span>
                      </td>
                      <td className={tdRight}>{won(p.amount)}</td>
                      <td className={cx(tdRight, "font-semibold", p.boost > 0 ? "text-brand-600" : "text-gray-400")}>{p.boost > 0 ? `+${num(p.boost)}` : "0"}</td>
                      <td className={td}>
                        <TierBadge tier={p.tier} />
                      </td>
                      <td className={cx(td, "whitespace-nowrap")}>
                        <TxLink hash={p.txHash} n={3} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="reveal" style={{ ["--i" as string]: 6 }}>
            <CardHeader
              title="위험 판정 로그"
              desc="엔진 /attest 결과 최근 50건"
              right={
                <Link href="/admin/bank" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                  보류·환수 관리
                  <Icon name="arrow" className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {risk.length === 0 ? (
              <EmptyRow icon="shield">판정이 없어요.</EmptyRow>
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

          <Card className="reveal" style={{ ["--i" as string]: 7 }}>
            <CardHeader title="바로 가기" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SHORTCUTS.map((x) => (
                <Link
                  key={x.href}
                  href={x.href}
                  className="group flex items-center gap-3 rounded-2xl bg-gray-50 p-3 transition-colors duration-150 hover:bg-gray-100 active:bg-gray-200"
                >
                  <IconTile name={x.icon} tone="gray" size="sm" className="bg-white text-gray-600 shadow-card" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-gray-900">{x.label}</span>
                    <span className="block truncate text-[11px] text-gray-500">{x.desc}</span>
                  </span>
                </Link>
              ))}
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
