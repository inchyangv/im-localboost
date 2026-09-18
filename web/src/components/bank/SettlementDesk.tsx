"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { Badge, Button, Card, CardHeader, Mono, Notice, Stat, Table, TxLink, cx, td, tdRight, th, thRight } from "@/components/ui";
import { parseChainError } from "@/lib/errors";
import { kstShort, short, won } from "@/lib/format";
import { SINK, bankAddress, loadSettlementLedger, retireSettled, type SettlementLedger } from "@/lib/settlement";

/**
 * Bank back office for settlement (SPEC 7.3): incoming merchant redemptions are requests; paying KRW
 * to the merchant's account is simulated, and the same amount of iMKRW is retired to the sink so the
 * on-chain supply matches money still in circulation.
 */
export function SettlementDesk({ bank, onChanged }: { bank: PrivateKeyAccount | null; onChanged: () => void }) {
  const [ledger, setLedger] = useState<SettlementLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: `0x${string}` } | null>(null);
  const bankAddr = bankAddress();

  const refresh = useCallback(async () => {
    try {
      setLedger(await loadSettlementLedger());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function payout() {
    if (!bank || !ledger || ledger.outstanding === 0n) return;
    setBusy(true);
    setMsg(null);
    try {
      const hash = await retireSettled(bank, ledger.outstanding);
      setMsg({ ok: true, text: `원화 ${won(ledger.outstanding)}을 가맹점 계좌로 입금 처리(모의)하고 같은 금액의 iMKRW를 유통에서 뺐어요.`, hash });
      onChanged();
      setTimeout(refresh, 3000);
    } catch (e) {
      setMsg({ ok: false, text: parseChainError(e).message });
    } finally {
      setBusy(false);
    }
  }

  const outstanding = ledger?.outstanding ?? 0n;

  return (
    <Card>
      <CardHeader
        title="가맹점 정산 (원화 지급)"
        desc="가맹점이 은행으로 보낸 iMKRW가 정산 요청이에요. 원화 입금을 처리하면 그 금액의 iMKRW를 소각 주소로 보내 유통량에서 제외해요."
        right={bankAddr ? <Mono title={bankAddr}>은행 {short(bankAddr, 4)}</Mono> : <Badge tone="amber">은행 키 없음</Badge>}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <Stat label="정산 요청 누계" value={won(ledger?.requestedTotal ?? 0n)} size="sm" />
        </div>
        <div className="rounded-xl bg-gray-50 px-4 py-3">
          <Stat label="원화 지급 완료 누계" value={won(ledger?.paidTotal ?? 0n)} size="sm" />
        </div>
        <div className={cx("rounded-xl px-4 py-3", outstanding > 0n ? "bg-amber-50" : "bg-gray-50")}>
          <Stat label="미지급 (처리 대기)" value={won(outstanding)} size="sm" tone={outstanding > 0n ? "default" : "muted"} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={payout} loading={busy} disabled={!bank || outstanding === 0n}>
          {busy ? "처리 중" : outstanding > 0n ? `${won(outstanding)} 원화 입금 처리` : "처리할 요청이 없어요"}
        </Button>
        <p className="text-[12px] text-gray-500">{bank ? "은행 데모 계정으로 서명해요." : "은행 페르소나에서만 처리할 수 있어요."}</p>
      </div>
      {msg && (
        <Notice tone={msg.ok ? "success" : "error"} className="mt-3">
          {msg.text} {msg.hash && <TxLink hash={msg.hash} />}
        </Notice>
      )}
      {error && (
        <Notice tone="warn" className="mt-3" title="정산 원장을 읽지 못했어요">
          {error} — 엔진의 <Mono>/transfers</Mono>가 필요해요.
        </Notice>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-[13px] font-medium text-gray-600">정산 요청 (가맹점 → 은행)</p>
          {!ledger || ledger.requests.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-500">요청이 없어요.</p>
          ) : (
            <Table className="mt-2" minWidth={420}>
              <thead>
                <tr>
                  <th className={th}>시각</th>
                  <th className={th}>가맹점</th>
                  <th className={thRight}>금액</th>
                  <th className={th}>tx</th>
                </tr>
              </thead>
              <tbody>
                {ledger.requests.slice(0, 10).map((r) => (
                  <tr key={`${r.txHash}-${r.blockNumber}`} className="border-t border-gray-100">
                    <td className={cx(td, "tnum whitespace-nowrap")}>{kstShort(r.ts)}</td>
                    <td className={td}>{r.merchantName}</td>
                    <td className={tdRight}>{won(r.amount)}</td>
                    <td className={td}>
                      <TxLink hash={r.txHash} n={4} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <div>
          <p className="text-[13px] font-medium text-gray-600">원화 지급 완료 (은행 → 소각)</p>
          {!ledger || ledger.payouts.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-500">처리 기록이 없어요.</p>
          ) : (
            <Table className="mt-2" minWidth={380}>
              <thead>
                <tr>
                  <th className={th}>시각</th>
                  <th className={thRight}>금액</th>
                  <th className={th}>tx</th>
                </tr>
              </thead>
              <tbody>
                {ledger.payouts.slice(0, 10).map((r) => (
                  <tr key={`${r.txHash}-${r.blockNumber}`} className="border-t border-gray-100">
                    <td className={cx(td, "tnum whitespace-nowrap")}>{kstShort(r.ts)}</td>
                    <td className={tdRight}>{won(r.amount)}</td>
                    <td className={td}>
                      <TxLink hash={r.txHash} n={4} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            소각 주소 <Mono>{short(SINK, 6)}</Mono>. 실서비스에서는 은행 코어뱅킹의 원화 이체가 이 단계에 붙어요.
          </p>
        </div>
      </div>
    </Card>
  );
}
