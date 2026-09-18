"use client";

import { useCallback, useEffect, useState } from "react";
import { AmountInput, Button, Card, CardHeader, Field, Mono, Notice, TxLink, cx } from "@/components/ui";
import { parseChainError } from "@/lib/errors";
import { kstShort, short, won } from "@/lib/format";
import { bankAddress, loadSettlementLedger, requestSettlement, type SettlementRequest } from "@/lib/settlement";
import type { Signer } from "@/lib/signer";

/**
 * Merchant side of settlement (SPEC 7.3): redeem received iMKRW for KRW by sending it to the bank.
 * `signer` is the merchant's demo persona or a connected wallet registered as a merchant.
 */
export function SettlementCard({ merchant, signer, balance, onDone }: { merchant: `0x${string}`; signer: Signer | null; balance: bigint | null; onDone: () => void }) {
  const [amount, setAmount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<SettlementRequest[]>([]);
  const bank = bankAddress();

  const refresh = useCallback(async () => {
    try {
      const ledger = await loadSettlementLedger();
      setMine(ledger.requests.filter((r) => r.from.toLowerCase() === merchant.toLowerCase()));
    } catch {
      // engine down or endpoint missing: keep the last list
    }
  }, [merchant]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const max = balance ?? 0n;
  const invalid = amount <= 0 || BigInt(amount) > max;

  async function submit() {
    if (!signer || invalid) return;
    setBusy(true);
    setError(null);
    setHash(null);
    try {
      const h = await requestSettlement(signer, BigInt(amount));
      setHash(h);
      setAmount(0);
      onDone();
      setTimeout(refresh, 3000);
    } catch (e) {
      setError(parseChainError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="정산 요청 (iMKRW → 원화)"
        desc="받은 iMKRW를 은행에 보내면 은행이 1:1로 원화를 가맹점 계좌에 입금하고, 그만큼의 iMKRW는 유통에서 빠져요."
      />
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="정산 금액" hint={`정산 가능 ${won(max)} · 은행 ${bank ? short(bank, 4) : "미설정"}`} error={amount > 0 && invalid ? "보유 iMKRW 이내로 입력해 주세요." : undefined}>
            <AmountInput id="settle-amount" size="lg" value={amount} onChange={setAmount} ariaLabel="정산 금액 (원)" disabled={!signer || busy} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[100_000, 300_000, 500_000].map((v) => (
              <button
                key={v}
                type="button"
                disabled={!signer || busy || BigInt(v) > max}
                onClick={() => setAmount(v)}
                className={cx("tnum rounded-full px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-40", amount === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
              >
                {won(v)}
              </button>
            ))}
            <button
              type="button"
              disabled={!signer || busy || max === 0n}
              onClick={() => setAmount(Number(max))}
              className="tnum rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40"
            >
              전액
            </button>
          </div>
          <Button type="submit" className="mt-4" loading={busy} disabled={!signer || invalid || !bank}>
            {busy ? "은행으로 전송 중" : "정산 요청"}
          </Button>
          {!signer && <p className="mt-2 text-[12px] text-gray-500">가맹점 데모 계정이나 가맹점으로 등록된 지갑으로만 요청할 수 있어요.</p>}
          {hash && (
            <Notice tone="success" className="mt-3" title="정산 요청을 보냈어요">
              은행이 확인하면 원화 입금 완료로 표시돼요. <TxLink hash={hash} />
            </Notice>
          )}
          {error && (
            <Notice tone="error" className="mt-3" title="정산 요청에 실패했어요">
              {error}
            </Notice>
          )}
        </form>

        <div>
          <p className="text-[13px] font-medium text-gray-600">내 정산 요청 (최근)</p>
          {mine.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-500">아직 요청이 없어요.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {mine.slice(0, 6).map((r) => (
                <li key={`${r.txHash}-${r.blockNumber}`} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-gray-600">
                    <span className="tnum">{kstShort(r.ts)}</span> <TxLink hash={r.txHash} n={4} />
                  </span>
                  <span className="tnum font-semibold text-gray-900">{won(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            요청은 iMKRW <Mono>transfer</Mono>(가맹점 → 은행)로 기록돼요. 원화 입금은 은행 백오피스(관리자 도구 → 은행·정산)에서 처리해요.
          </p>
        </div>
      </div>
    </Card>
  );
}
