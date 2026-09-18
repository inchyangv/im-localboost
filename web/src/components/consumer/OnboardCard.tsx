"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardHeader, Notice, TxLink } from "@/components/ui";
import { onboard, onboardStatus, type OnboardResponse, type OnboardStatus } from "@/lib/engine";
import { won } from "@/lib/format";

/** Bank onboarding for a connected wallet: personId link, starter iMKRW and gas, once per KST day. */
export function OnboardCard({
  address,
  registered,
  onDone,
  onClose,
}: {
  address: `0x${string}`;
  registered: boolean;
  onDone: () => void;
  onClose?: () => void;
}) {
  const [status, setStatus] = useState<OnboardStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OnboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    onboardStatus(address)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [address, result]);

  const claimedToday = status?.mintedToday ?? false;
  const amount = status?.mintAmount ?? result?.mintAmount ?? 0;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await onboard(address);
      setResult(r);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border border-brand-100">
      <CardHeader
        title={registered ? "은행에서 iMKRW 받기" : "은행 등록하고 시작 자금 받기"}
        desc={
          registered
            ? "은행이 이 지갑에 iMKRW를 보내요. 하루에 한 번 받을 수 있어요."
            : "은행이 이 지갑에 개인 ID를 연결하고, iMKRW와 수수료용 KAIA를 보내요. 실제 서비스에서는 은행 앱의 본인 확인이 이 자리를 대신해요."
        }
        right={
          onClose && (
            <button type="button" onClick={onClose} className="text-[12px] text-gray-500 underline-offset-2 hover:underline">
              닫기
            </button>
          )
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={run} loading={busy} disabled={claimedToday && registered}>
          {busy ? "은행 처리 중" : claimedToday && registered ? "오늘은 이미 받았어요" : amount > 0 ? `${won(amount)} 받기` : "등록하고 받기"}
        </Button>
        <p className="text-[12px] text-gray-500">
          {status ? (claimedToday ? "내일 다시 받을 수 있어요." : `하루 한도 ${won(status.mintAmount)}`) : "은행 상태를 확인하는 중이에요."}
        </p>
      </div>
      {busy && <p className="mt-3 text-[12px] text-gray-500">은행이 트랜잭션을 세 개까지 보내요. 몇 초에서 수십 초 걸릴 수 있어요.</p>}
      {result && (
        <Notice tone="success" className="mt-4" title={result.minted > 0 ? `${won(result.minted)}을 받았어요` : "이미 오늘 받은 지갑이에요"}>
          <ul className="mt-1 space-y-0.5">
            {result.personTx && (
              <li>
                개인 ID 연결 <TxLink hash={result.personTx} />
              </li>
            )}
            {result.mintTx && (
              <li>
                iMKRW 발행 <TxLink hash={result.mintTx} />
              </li>
            )}
            {result.gasTx && (
              <li>
                수수료용 KAIA 전송 <TxLink hash={result.gasTx} />
              </li>
            )}
            <li className="tnum">현재 잔액 {won(result.balance)}</li>
          </ul>
        </Notice>
      )}
      {error && (
        <Notice tone="error" className="mt-4" title="은행 처리에 실패했어요">
          {error}
        </Notice>
      )}
    </Card>
  );
}
