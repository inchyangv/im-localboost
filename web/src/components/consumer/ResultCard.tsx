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
      ? { icon: <CheckCircle className="h-10 w-10 text-brand-600" />, title: `보너스 ${won(paid.boost)}이 적립됐어요`, bar: "bg-brand-500" }
      : status === "pending"
        ? { icon: <ClockCircle className="h-10 w-10 text-amber-600" />, title: `보너스 ${won(paid.boost)}이 보류됐어요`, bar: "bg-amber-500" }
        : { icon: <MinusCircle className="h-10 w-10 text-gray-500" />, title: "보너스 없이 결제됐어요", bar: "bg-gray-400" };

  return (
    <Card className="relative overflow-hidden" role="status" aria-live="polite">
      <span className={cx("absolute inset-x-0 top-0 h-1", head.bar)} aria-hidden="true" />
      <button
        type="button"
        onClick={onClose}
        aria-label="결과 닫기"
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-4 pr-8">
        {head.icon}
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold leading-tight text-gray-900">{head.title}</h2>
          <p className="mt-1 text-[14px] text-gray-500">
            {merchantName}에 {won(paid.amount)} 결제
            {paid.useCredit > 0n && ` · 크레딧 ${won(paid.useCredit)} 사용`}
          </p>
        </div>
      </div>

      {reason && (
        <Notice tone={status === "pending" ? "warn" : "info"} className="mt-4">
          {reason}
        </Notice>
      )}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
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
