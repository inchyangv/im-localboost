"use client";

import { useCallback, useEffect, useState } from "react";
import { PersonaGate } from "@/components/PersonaGate";
import { usePersona } from "@/components/PersonaProvider";
import { RoleAvatar } from "@/components/PersonaSwitcher";
import { QrPanel } from "@/components/merchant/QrPanel";
import { SettlementCard } from "@/components/merchant/SettlementCard";
import { personaSigner } from "@/lib/signer";
import { Badge, Card, CardHeader, Mono, Notice, PageHeader, Progress, Stat, Table, TierBadge, TxLink, cx, td, tdRight, th, thRight } from "@/components/ui";
import { publicClient } from "@/lib/chain";
import { CATEGORY_NAMES, caps, merchantByAddress, zoneName } from "@/lib/config";
import { addresses, chainNow, hourEpoch, localBoostAbi, tokenAbi } from "@/lib/contracts";
import { payments as fetchPayments, type PaymentRow } from "@/lib/engine";
import { kstHourLabel, kstShort, num, pct, short, won } from "@/lib/format";

const REFRESH_MS = 10_000;

interface SlotGauge {
  epoch: number;
  volume: bigint;
  cap: bigint;
  baseline: bigint;
  rateBps: number;
}

export default function MerchantPage() {
  const { persona, mode, wallet } = usePersona();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [gauge, setGauge] = useState<SlotGauge | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);

  // A connected wallet that is a registered merchant takes precedence over the demo persona.
  const walletMerchant = mode === "wallet" && wallet.address && merchantByAddress(wallet.address) ? wallet.address : null;
  const address = walletMerchant ?? (persona?.role === "merchant" ? persona.account.address : null);
  const info = address ? merchantByAddress(address) : undefined;
  const { walletSigner } = usePersona();
  const signer = walletMerchant ? walletSigner() : persona?.role === "merchant" ? personaSigner(persona.account) : null;

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setRows(await fetchPayments({ merchant: address, limit: 50 }));
      setEngineError(null);
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
    }
    try {
      const now = await chainNow();
      const epoch = hourEpoch(now);
      const [volume, bal, rate] = await Promise.all([
        publicClient.readContract({ address: addresses.LocalBoost, abi: localBoostAbi, functionName: "slotVolume", args: [address, BigInt(epoch)] }) as Promise<bigint>,
        publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
        info
          ? (publicClient.readContract({ address: addresses.LocalBoost, abi: localBoostAbi, functionName: "currentRate", args: [info.zoneId] }) as Promise<number>)
          : Promise.resolve(0),
      ]);
      const baseline = BigInt(info?.slotBaseline ?? 0);
      setGauge({ epoch, volume, baseline, cap: (baseline * BigInt(caps.slotCapBps)) / 10000n, rateBps: Number(rate) });
      setBalance(bal);
    } catch {
      setGauge(null);
      setBalance(null);
    }
  }, [address, info]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!address) {
    return (
      <PersonaGate
        roles={["merchant"]}
        title="가맹점 화면이에요"
        desc="가맹점으로 등록된 지갑을 연결하거나 데모 가맹점 계정을 고르면 수취 내역과 이번 시간 슬롯 게이지를 볼 수 있어요."
      />
    );
  }

  const remaining = gauge ? (gauge.volume >= gauge.cap ? 0n : gauge.cap - gauge.volume) : null;
  const ratio = gauge && gauge.cap > 0n ? Math.min(100, Number((gauge.volume * 100n) / gauge.cap)) : 0;
  const tone = ratio >= 100 ? "red" : ratio >= 70 ? "amber" : "brand";
  const hourRows = gauge ? rows.filter((r) => hourEpoch(r.ts) === gauge.epoch) : [];
  const hourBoost = hourRows.reduce((s, r) => s + r.boost, 0);

  return (
    <>
      <PageHeader
        title={info?.name ?? persona?.label ?? "가맹점"}
        desc={
          info ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="gray">{zoneName(info.zoneId)}</Badge>
              <Badge tone="gray">{CATEGORY_NAMES[info.categoryId] ?? info.categoryId}</Badge>
              <Mono title={address}>{short(address, 6)}</Mono>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Badge tone="amber">미등록 가맹점</Badge>
              <Mono title={address}>{short(address, 6)}</Mono>
            </span>
          )
        }
        right={<RoleAvatar role="merchant" />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <Stat label="iMKRW 잔액" value={balance === null ? "—" : won(balance)} size="lg" sub="결제 금액은 즉시 이 잔액으로 들어와요" />
        </Card>
        <Card>
          <Stat
            label={`현재 ${info ? zoneName(info.zoneId) : "상권"} 보너스율`}
            value={gauge ? pct(gauge.rateBps) : "—"}
            size="lg"
            tone={gauge && gauge.rateBps > 0 ? "brand" : "muted"}
            sub="이 상권에서 결제하는 소비자가 받는 율이에요"
          />
        </Card>
        <Card>
          <Stat label="기준 매출 (시간당)" value={info ? won(info.slotBaseline) : "—"} size="lg" sub={`기준의 ${caps.slotCapBps / 100}%까지 보너스 대상`} />
        </Card>
      </div>

      <div className="mt-6">
        <QrPanel merchant={address} />
      </div>

      <div className="mt-6">
        <SettlementCard merchant={address} signer={signer} balance={balance} onDone={refresh} />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="이번 시간 보너스 대상 매출"
          desc="슬롯 상한까지 채워지면 그 뒤 결제에는 보너스가 붙지 않아요. 결제 자체는 막히지 않아요."
          right={gauge && <Badge tone="gray">{kstHourLabel(gauge.epoch)}</Badge>}
        />
        {gauge ? (
          <>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
              <p className="tnum text-[28px] font-bold leading-none tracking-tight text-gray-900">
                {won(gauge.volume)}
                <span className="ml-2 text-[15px] font-medium text-gray-400">/ 상한 {won(gauge.cap)}</span>
              </p>
              <p className={cx("tnum text-[14px] font-semibold", tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : "text-brand-700")}>
                {remaining === 0n ? "상한 도달" : `남은 보너스 대상 ${won(remaining ?? 0n)}`}
              </p>
            </div>
            <Progress ratio={ratio} tone={tone} className="mt-3 h-3" />
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="이번 시간 결제" value={`${hourRows.length}건`} size="sm" />
              <Stat label="이번 시간 지급 보너스" value={won(hourBoost)} size="sm" />
              <Stat label="사용률" value={`${ratio}%`} size="sm" />
              <Stat label="epoch" value={<span className="font-mono text-[14px] font-medium text-gray-600">{gauge.epoch}</span>} size="sm" />
            </div>
          </>
        ) : (
          <p className="mt-4 text-[13px] text-gray-500">체인에서 읽는 중이에요.</p>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="수취 내역" desc="최근 50건, 엔진 기록 기준" right={<span>10초 갱신</span>} />
        {engineError && (
          <Notice tone="error" className="mt-3">
            {engineError}
          </Notice>
        )}
        {rows.length === 0 ? (
          <p className="mt-4 text-[13px] text-gray-500">아직 수취 기록이 없어요.</p>
        ) : (
          <Table className="mt-3" minWidth={680}>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>시각 (KST)</th>
                <th className={th}>결제자</th>
                <th className={thRight}>금액</th>
                <th className={thRight}>크레딧 사용</th>
                <th className={thRight}>보너스</th>
                <th className={th}>판정</th>
                <th className={th}>트랜잭션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((p) => (
                <tr key={`${p.txHash}-${p.blockNumber}`}>
                  <td className={cx(td, "tnum whitespace-nowrap")}>{kstShort(p.ts)}</td>
                  <td className={td}>
                    <Mono title={p.payer}>{short(p.payer)}</Mono>
                  </td>
                  <td className={cx(tdRight, "font-semibold")}>{num(p.amount)}</td>
                  <td className={cx(tdRight, p.useCredit > 0 ? "" : "text-gray-400")}>{num(p.useCredit)}</td>
                  <td className={cx(tdRight, p.boost > 0 ? "font-semibold text-brand-600" : "text-gray-400")}>{p.boost > 0 ? `+${num(p.boost)}` : "0"}</td>
                  <td className={td}>
                    <TierBadge tier={p.tier} />
                  </td>
                  <td className={td}>
                    <TxLink hash={p.txHash} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
