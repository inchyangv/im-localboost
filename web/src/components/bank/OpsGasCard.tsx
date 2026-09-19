"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKaia } from "@/components/WalletButton";
import { Badge, Card, CardHeader, Mono, Notice, cx } from "@/components/ui";
import { onboardFunds, type OnboardFunds } from "@/lib/engine";
import { short } from "@/lib/format";

const ROLE_LABELS: Record<string, { name: string; use: string }> = {
  bank: { name: "은행 계정", use: "온보딩(개인 ID 연결·iMKRW 발행·가스 지급)" },
  oracle: { name: "오라클 계정", use: "매시 정각 보너스율 게시" },
};

/**
 * Gas (KAIA) held by the accounts the engine signs with. The Kairos faucet is captcha protected, so
 * refilling stays a manual step: copy the address, open the faucet, paste.
 */
export function OpsGasCard() {
  const [funds, setFunds] = useState<OnboardFunds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setFunds(await onboardFunds());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      // clipboard blocked
    }
  }

  return (
    <Card>
      <CardHeader
        title="운영 계정 가스 (KAIA)"
        desc="엔진이 서명에 쓰는 계정의 수수료 잔액이에요. faucet은 사람 확인(캡차)이 있어서 직접 받아야 해요."
        right={funds && <Badge tone={funds.low ? "amber" : "brand"}>{funds.low ? "충전 필요" : "정상"}</Badge>}
      />
      {error && (
        <Notice tone="error" className="mt-3" title="잔액을 읽지 못했어요">
          {error}
        </Notice>
      )}
      {funds?.low && (
        <Notice tone="warn" className="mt-3" title="은행 계정의 KAIA가 부족해요">
          지금은 온보딩에서 가스 지급을 건너뛰어요. 개인 ID 연결과 iMKRW 발행은 계속되고, 소비자에게는 faucet 안내가 보여요.
        </Notice>
      )}
      <ul className="mt-4 space-y-3">
        {(funds?.accounts ?? []).map((a) => (
          <li key={a.role} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">
                {ROLE_LABELS[a.role]?.name ?? a.role} <Mono title={a.address}>{short(a.address)}</Mono>
              </p>
              <p className="text-[12px] text-gray-500">{ROLE_LABELS[a.role]?.use}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx("tnum text-[15px] font-semibold", a.role === "bank" && funds?.low ? "text-amber-700" : "text-gray-900")}>{formatKaia(BigInt(a.gasWei))}</span>
              <button type="button" onClick={() => copy(a.address)} className="rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-gray-800 shadow-card transition-colors hover:bg-gray-50">
                {copied === a.address ? "주소 복사됨" : "주소 복사"}
              </button>
              {funds?.faucetUrl && (
                <a href={funds.faucetUrl} target="_blank" rel="noreferrer" className="rounded-full bg-gray-900 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-gray-800">
                  Kaia faucet 열기
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {funds && funds.onboardsLeft !== null && (
        <p className="mt-3 text-[12px] text-gray-500">
          온보딩 한 건에 최대 <span className="tnum">{formatKaia(BigInt(funds.gasPerOnboardWei))}</span>를 보내요. 지금 잔액으로 약{" "}
          <span className="tnum font-medium text-gray-700">{funds.onboardsLeft}건</span> 더 지급할 수 있어요.
        </p>
      )}
    </Card>
  );
}
