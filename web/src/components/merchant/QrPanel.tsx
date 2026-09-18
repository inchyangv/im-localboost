"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AmountInput, Badge, Button, Card, CardHeader, CheckCircle, Field, Mono, Notice, TxLink, cx } from "@/components/ui";
import { payments as fetchPayments, type PaymentRow } from "@/lib/engine";
import { won } from "@/lib/format";
import { MIN_QR_AMOUNT, buildPayUrl, newRef, type PayRequest } from "@/lib/qr";

const POLL_MS = 5_000;
const QUICK_AMOUNTS = [5_000, 10_000, 30_000, 50_000];

interface ActiveQr {
  request: PayRequest;
  url: string;
  dataUrl: string;
  createdAt: number; // unix seconds, chain-agnostic (engine ts is block time; a 90s tolerance covers the gap)
}

const MATCH_TOLERANCE_SECS = 90;

/** Merchant-presented payment QR (SPEC 7.1): amount -> QR of /pay?m=&a=&r=, then wait for the matching Paid. */
export function QrPanel({ merchant }: { merchant: `0x${string}` }) {
  const [amount, setAmount] = useState<number>(10_000);
  const [active, setActive] = useState<ActiveQr | null>(null);
  const [paid, setPaid] = useState<PaymentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  const generate = useCallback(async () => {
    setError(null);
    setPaid(null);
    if (amount < MIN_QR_AMOUNT) {
      setError(`결제 금액은 ${won(MIN_QR_AMOUNT)} 이상이어야 해요.`);
      return;
    }
    const request: PayRequest = { merchant, amount, ref: newRef() };
    const url = buildPayUrl(window.location.origin, request);
    try {
      const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 320 });
      // Payments already listed before this QR existed must never be matched to it.
      const existing = await fetchPayments({ merchant, limit: 50 }).catch(() => [] as PaymentRow[]);
      seen.current = new Set(existing.map((p) => p.txHash));
      setActive({ request, url, dataUrl, createdAt: Math.floor(Date.now() / 1000) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [amount, merchant]);

  // Poll the engine for a Paid with the same amount that arrived after the QR was made.
  useEffect(() => {
    if (!active || paid) return;
    let stopped = false;
    const tick = async () => {
      try {
        const rows = await fetchPayments({ merchant, limit: 20 });
        const hit = rows.find(
          (p) =>
            !seen.current.has(p.txHash) &&
            p.amount === active.request.amount &&
            p.ts >= active.createdAt - MATCH_TOLERANCE_SECS,
        );
        if (hit && !stopped) setPaid(hit);
      } catch {
        // engine down: keep waiting
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, paid, merchant]);

  async function copyUrl() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="결제 QR"
        desc="금액을 정하고 QR을 만들면 손님이 폰 카메라나 앱의 'QR 스캔'으로 찍어서 결제해요."
        right={active && !paid ? <Badge tone="amber">결제 대기 중</Badge> : paid ? <Badge tone="brand">결제 완료</Badge> : null}
      />

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Field label="청구 금액" hint={`${won(MIN_QR_AMOUNT)} 이상 · 원 단위 정수`} error={error}>
            <AmountInput id="qr-amount" size="lg" value={amount} onChange={setAmount} ariaLabel="청구 금액 (원)" disabled={!!active && !paid} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                disabled={!!active && !paid}
                onClick={() => setAmount(v)}
                className={cx(
                  "tnum rounded-full px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-40",
                  amount === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                )}
              >
                {won(v)}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!active || paid ? (
              <Button type="button" onClick={generate} disabled={amount < MIN_QR_AMOUNT}>
                {paid ? "새 QR 만들기" : "QR 만들기"}
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setActive(null)}>
                  취소
                </Button>
                <Button type="button" variant="secondary" onClick={copyUrl}>
                  {copied ? "복사됨" : "링크 복사"}
                </Button>
              </>
            )}
          </div>

          {active && !paid && (
            <p className="mt-3 text-[12px] text-gray-500">
              같은 금액의 결제가 들어오면 자동으로 완료 표시가 떠요 (5초마다 확인). 참조 <Mono>{active.request.ref}</Mono>
            </p>
          )}

          {paid && (
            <Notice tone="success" title="결제가 들어왔어요" className="mt-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> {won(paid.amount)}
                </span>
                <span>보너스 {won(paid.boost)}</span>
                <span>tier {paid.tier}</span>
                <TxLink hash={paid.txHash} />
              </div>
            </Notice>
          )}
        </div>

        <div className="flex flex-col items-center justify-start">
          {active ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.dataUrl}
                alt={`${won(active.request.amount)} 결제 QR`}
                width={224}
                height={224}
                className={cx("rounded-2xl border border-gray-200 bg-white p-2", paid && "opacity-40")}
              />
              <p className="tnum mt-2 text-[20px] font-bold text-gray-900">{won(active.request.amount)}</p>
            </>
          ) : (
            <div className="grid h-[240px] w-[240px] place-items-center rounded-2xl border border-dashed border-gray-300 text-[13px] text-gray-400">
              QR이 여기에 표시돼요
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
