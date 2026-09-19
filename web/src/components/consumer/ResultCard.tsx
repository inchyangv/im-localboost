"use client";

import { useEffect, useState } from "react";
import { Card, CheckCircle, ClockCircle, CloseIcon, MinusCircle, Mono, Notice, TierBadge, TxLink, cx } from "@/components/ui";
import { caps, merchantByAddress } from "@/lib/config";
import { readBoostState, type BoostState } from "@/lib/contracts";
import { reasonLabel } from "@/lib/errors";
import { short, won } from "@/lib/format";
import type { PayFlowResult } from "@/lib/pay";
import { pendingNote, zeroBoostReason } from "@/lib/reasons";

type Status = "paid" | "pending" | "zero";

export function ResultCard({ result, onClose }: { result: PayFlowResult; onClose: () => void }) {
  const { paid, attest: att, hash, approveHash } = result;
  const [state, setState] = useState<BoostState | null>(null);
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!paid) return;
    readBoostState(paid.payer, paid.merchant, paid.zoneId).then(setState).catch(() => setState(null));
  }, [paid]);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!paid) {
    return (
      <Notice tone="warn" title="결제는 성공했지만 Paid 이벤트를 찾지 못했어요">
        <TxLink hash={hash} />
      </Notice>
    );
  }

  const status: Status = paid.boost === 0n ? "zero" : paid.tier === 1 ? "pending" : "paid";
  const merchantName = merchantByAddress(paid.merchant)?.name ?? paid.merchant;
  const codes = att.reasons.map(reasonLabel).join(", ");

  let reason: string | null = null;
  if (status === "zero") {
    // After the payment the counters already include it; when pairDay was just set that is the honest reason.
    reason = state
      ? zeroBoostReason({ state, amount: paid.amount, useCredit: paid.useCredit, tier: att.tier, engineReasons: att.reasons })
      : att.tier >= 2
        ? `위험 등급 2: 보너스 미지급${codes ? ` (${codes})` : ""}`
        : null;
  } else if (status === "pending") {
    const releaseAt = state ? state.now + caps.pendingDelay : Math.floor(Date.now() / 1000) + caps.pendingDelay;
    reason = pendingNote(releaseAt, now, att.reasons);
  }

  const head =
    status === "paid"
      ? { icon: <CheckCircle className="h-14 w-14 text-brand-600" />, title: "이 적립됐어요", amount: paid.boost, tone: "text-brand-600", wash: "from-brand-50" }
      : status === "pending"
        ? { icon: <ClockCircle className="h-14 w-14 text-amber-600" />, title: "이 보류됐어요", amount: paid.boost, tone: "text-amber-600", wash: "from-amber-50" }
        : { icon: <MinusCircle className="h-14 w-14 text-gray-500" />, title: "보너스 없이 결제됐어요", amount: null, tone: "text-gray-900", wash: "from-gray-100" };

  return (
    <Card className="relative animate-sheet-up overflow-hidden" role="status" aria-live="polite">
      <span className={cx("pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b to-transparent", head.wash)} aria-hidden="true" />
      <button
        type="button"
        onClick={onClose}
        aria-label="결과 닫기"
        className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-900/5 hover:text-gray-700"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
      <div className="relative flex flex-col items-center pb-1 pt-3 text-center">
        <span className="animate-scale-in">{head.icon}</span>
        <h2 className="mt-4 text-[22px] font-bold leading-snug tracking-heading text-gray-900">
          {head.amount !== null ? (
            <>
              보너스 <span className={cx("tnum", head.tone)}>{won(head.amount)}</span>
              {head.title}
            </>
          ) : (
            head.title
          )}
        </h2>
        <p className="mt-1.5 text-[14px] text-gray-500">
          {merchantName}에 {won(paid.amount)} 결제
          {paid.useCredit > 0n && ` · 크레딧 ${won(paid.useCredit)} 사용`}
        </p>
      </div>

      {reason && (
        <Notice tone={status === "pending" ? "warn" : "info"} className="relative mt-5">
          {reason}
        </Notice>
      )}

      <dl className="relative mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-2xl bg-gray-50 p-4 text-[13px]">
        <dt className="text-gray-500">위험 판정</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <TierBadge tier={paid.tier} />
          <span className="tnum text-gray-500">score {att.score.toFixed(3)}</span>
          {codes && <span className="text-gray-700">{codes}</span>}
        </dd>
        {paid.pendingId > 0n && (
          <>
            <dt className="text-gray-500">보류 번호</dt>
            <dd className="tnum">#{paid.pendingId.toString()}</dd>
          </>
        )}
        <dt className="text-gray-500">트랜잭션</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <TxLink hash={hash} />
          {approveHash && (
            <span className="text-gray-500">
              승인 <TxLink hash={approveHash} />
            </span>
          )}
        </dd>
        <dt className="text-gray-500">가맹점 주소</dt>
        <dd>
          <Mono title={paid.merchant}>{short(paid.merchant, 8)}</Mono>
        </dd>
      </dl>
    </Card>
  );
}
