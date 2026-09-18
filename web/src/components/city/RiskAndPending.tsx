"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { Badge, Button, Card, CardHeader, Mono, Notice, Table, TierBadge, TxLink, cx, td, tdRight, th, thRight } from "@/components/ui";
import { clawbackPending, listPending, releasePending, type PendingRow } from "@/lib/city";
import { caps, merchantByAddress, zoneName } from "@/lib/config";
import { riskLog, type RiskLogRow } from "@/lib/engine";
import { parseChainError, reasonLabel } from "@/lib/errors";
import { kstShort, num, short, won } from "@/lib/format";

const RISK_REFRESH_MS = 5_000;
const PENDING_REFRESH_MS = 5_000;

export { TierBadge };

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

  const flagged = rows.filter((r) => r.tier >= 1).length;

  return (
    <Card>
      <CardHeader
        title="위험 판정 로그"
        desc="엔진이 결제마다 규칙과 모델로 매긴 등급이에요. 최종 등급은 둘 중 큰 값이에요."
        right={
          <>
            {rows.length > 0 && <Badge tone={flagged > 0 ? "amber" : "gray"}>위험 {flagged}건 / {rows.length}건</Badge>}
            <span>5초 갱신</span>
          </>
        }
      />
      {err && (
        <Notice tone="error" className="mt-3">
          {err}
        </Notice>
      )}
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-gray-500">아직 판정이 없어요.</p>
      ) : (
        <div className="scroll-thin mt-3 max-h-80 overflow-auto">
          <Table minWidth={720}>
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-100">
                <th className={th}>시각</th>
                <th className={th}>결제자</th>
                <th className={th}>가맹점</th>
                <th className={thRight}>금액</th>
                <th className={th}>판정</th>
                <th className={thRight}>score</th>
                <th className={th}>사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={`${r.ts}-${i}`} className={r.tier >= 2 ? "bg-red-50/40" : r.tier === 1 ? "bg-amber-50/40" : undefined}>
                  <td className={cx(td, "tnum whitespace-nowrap")}>{kstShort(r.ts)}</td>
                  <td className={td}>
                    <Mono title={r.payer}>{short(r.payer)}</Mono>
                  </td>
                  <td className={td} title={r.merchant}>
                    {merchantByAddress(r.merchant)?.name ?? short(r.merchant)}
                  </td>
                  <td className={tdRight}>{num(r.amount)}</td>
                  <td className={td}>
                    <TierBadge tier={r.tier} />
                  </td>
                  <td className={tdRight}>{r.score.toFixed(3)}</td>
                  <td className={td}>{r.reasons.map(reasonLabel).join(", ") || <span className="text-gray-400">없음</span>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
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
  const [msg, setMsg] = useState<{ ok: boolean; text: React.ReactNode } | null>(null);

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
      setMsg({
        ok: true,
        text: (
          <>
            #{id.toString()} {kind === "release" ? "지급" : "환수"} 완료 <TxLink hash={hash} />
          </>
        ),
      });
      await load();
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: parseChainError(e).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="보류 목록"
        desc={`위험 등급 1 보너스는 ${caps.pendingDelay}초 뒤에 누구나 지급할 수 있어요. 은행은 그 전에 예산으로 환수할 수 있어요.`}
        right={
          <>
            {rows.length > 0 && <Badge tone="amber">{rows.length}건 대기</Badge>}
            <span>5초 갱신</span>
          </>
        }
      />
      {msg && (
        <Notice tone={msg.ok ? "success" : "error"} className="mt-3">
          {msg.text}
        </Notice>
      )}
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-gray-500">보류 중인 보너스가 없어요.</p>
      ) : (
        <Table className="mt-3" minWidth={640}>
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>번호</th>
              <th className={th}>personId</th>
              <th className={th}>상권</th>
              <th className={thRight}>금액</th>
              <th className={thRight}>지급까지</th>
              <th className={cx(th, "text-right")}>동작</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((p) => {
              const left = Math.max(0, p.releaseAt - now);
              return (
                <tr key={p.id.toString()}>
                  <td className={cx(td, "tnum font-medium")}>#{p.id.toString()}</td>
                  <td className={td}>
                    <Mono title={p.personId}>{short(p.personId, 6)}</Mono>
                  </td>
                  <td className={td}>{zoneName(p.zoneId)}</td>
                  <td className={cx(tdRight, "font-semibold")}>{won(p.amount)}</td>
                  <td className={cx(tdRight, left > 0 ? "text-amber-700" : "text-brand-700")}>{left > 0 ? `${left}초` : "지급 가능"}</td>
                  <td className={cx(td, "text-right")}>
                    <div className="inline-flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => act("release", p.id)} disabled={!actor || busy !== null || left > 0} title="releaseAt 이후 누구나 호출할 수 있어요">
                        지급
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => act("clawback", p.id)}
                        disabled={!isBank || !actor || busy !== null}
                        loading={busy === p.id}
                        title={isBank ? "예산으로 환수" : "은행 페르소나에서만 가능해요"}
                      >
                        환수
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
