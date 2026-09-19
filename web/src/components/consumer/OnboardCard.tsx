"use client";

import { useEffect, useState } from "react";
import { Button, Card, CloseIcon, IconTile, Notice, Spinner, TxLink, cx } from "@/components/ui";
import { onboard, onboardStatus, type OnboardResponse, type OnboardStatus } from "@/lib/engine";
import { usePersona } from "@/components/PersonaProvider";
import { formatKaia } from "@/components/WalletButton";
import { FAUCET_URL, LOW_GAS_WEI } from "@/lib/config";
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
  const [copied, setCopied] = useState(false);
  const { wallet } = usePersona();
  const lowGas = wallet.nativeBalance !== null && wallet.nativeBalance < LOW_GAS_WEI;

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

  const steps: Array<{ label: string; tx: string | null | undefined; done: boolean }> = [
    { label: "개인 ID 연결", tx: result?.personTx, done: registered || !!result?.personTx },
    { label: "iMKRW 발행", tx: result?.mintTx, done: !!result?.mintTx || (claimedToday && registered) },
    // The bank only sends gas when the wallet is short, so "done" means the wallet can pay fees, with or without a transfer.
    { label: "수수료용 KAIA", tx: result?.gasTx, done: !!result?.gasTx || (wallet.nativeBalance !== null && !lowGas) },
  ];

  return (
    <Card padded={false} className="reveal overflow-hidden" style={{ ["--i" as string]: 1 }}>
      <div className="flex items-start gap-4 bg-brand-50 px-5 py-5 sm:px-6">
        <IconTile name="bank" tone="solid" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold leading-snug tracking-heading text-gray-900">{registered ? "은행에서 iMKRW 받기" : "은행 등록하고 시작 자금 받기"}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-brand-800/80">
            {registered
              ? "은행이 이 지갑에 iMKRW를 보내요. 하루에 한 번 받을 수 있어요."
              : "은행이 이 지갑에 개인 ID를 연결하고, iMKRW와 수수료용 KAIA를 보내요. 실제 서비스에서는 은행 앱의 본인 확인이 이 자리를 대신해요."}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-1.5 -mt-1 rounded-full p-2 text-brand-800/60 transition-colors hover:bg-brand-100 hover:text-brand-800">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <ol className="grid gap-2 sm:grid-cols-3">
          {steps.map((st, i) => (
            <li key={st.label} className={cx("flex items-center gap-2.5 rounded-2xl px-3.5 py-3 transition-colors duration-300", st.done ? "bg-brand-50" : "bg-gray-50")}>
              <span
                className={cx(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold",
                  st.done ? "bg-brand-500 text-white" : "bg-white text-gray-500 shadow-card",
                )}
              >
                {st.done ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="m4 8.4 2.6 2.6L12 5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : busy ? (
                  <Spinner className="h-3.5 w-3.5 text-brand-600" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0">
                <span className={cx("block text-[13px] font-semibold", st.done ? "text-brand-800" : "text-gray-800")}>{st.label}</span>
                {st.tx && (
                  <span className="block">
                    <TxLink hash={st.tx} n={4} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={run} loading={busy} disabled={claimedToday && registered} className="h-12 px-6">
            {busy ? "은행 처리 중" : claimedToday && registered ? "오늘은 이미 받았어요" : amount > 0 ? `${won(amount)} 받기` : "등록하고 받기"}
          </Button>
          <p className="text-[12px] text-gray-500">
            {status ? (claimedToday ? "내일 다시 받을 수 있어요." : `하루 한도 ${won(status.mintAmount)}`) : "은행 상태를 확인하는 중이에요."}
          </p>
        </div>
        {busy && <p className="mt-3 text-[12px] text-gray-500">은행이 트랜잭션을 세 개까지 보내요. 몇 초에서 수십 초 걸릴 수 있어요.</p>}
        {result && (
          <Notice tone="success" className="mt-4" title={result.minted > 0 ? `${won(result.minted)}을 받았어요` : "이미 오늘 받은 지갑이에요"}>
            <span className="tnum">현재 잔액 {won(result.balance)}</span>
          </Notice>
        )}
        {result?.gasSkipped && (
          <Notice tone="warn" className="mt-4" title="수수료용 KAIA는 직접 받아 주세요">
            은행의 KAIA가 부족해서 이번에는 가스를 보내지 못했어요. 아래 Kaia faucet에 내 주소를 붙여 넣으면 바로 받을 수 있어요.
          </Notice>
        )}
        {error && (
          <Notice tone="error" className="mt-4" title="은행 처리에 실패했어요">
            {error}
          </Notice>
        )}

        <div className="mt-5 rounded-2xl bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-gray-900">수수료용 KAIA (가스)</p>
              <p className="text-[12px] text-gray-500">
                현재 <span className={lowGas ? "font-medium text-amber-700" : "font-medium text-gray-700"}>{formatKaia(wallet.nativeBalance)}</span>
                {lowGas ? " · 결제 트랜잭션을 보내기엔 부족해요." : " · 결제 한 건에 0.01 KAIA가 채 안 들어요."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {FAUCET_URL && (
                <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="rounded-full bg-gray-900 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-gray-800">
                  Kaia faucet 열기
                </a>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  } catch {
                    // clipboard blocked
                  }
                }}
                className="rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-gray-800 shadow-card transition-colors hover:bg-gray-50"
              >
                {copied ? "주소 복사됨" : "내 주소 복사"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            {FAUCET_URL
              ? "faucet에 주소를 붙여 넣으면 테스트 KAIA를 보내 줘요. 위의 은행 온보딩도 지갑에 KAIA가 거의 없으면 0.2 KAIA를 함께 보내요."
              : "이 네트워크에는 공개 faucet이 없어요. 은행 온보딩이 필요한 만큼의 KAIA를 함께 보내요."}
          </p>
        </div>
      </div>
    </Card>
  );
}
