"use client";

import { useCallback, useEffect, useState } from "react";
import { PersonaGate } from "@/components/PersonaGate";
import { useConsumerActor } from "@/components/PersonaProvider";
import { RecentList } from "@/components/consumer/RecentList";
import { WalletCard } from "@/components/consumer/WalletCard";
import { CountUp } from "@/components/motion";
import { Card, IconTile, PageHeader, Stat } from "@/components/ui";
import { publicClient } from "@/lib/chain";
import { addresses, dalgubeolPayAbi, registryAbi, tokenAbi } from "@/lib/contracts";
import { payments as fetchPayments, type PaymentRow } from "@/lib/engine";
import { num, won } from "@/lib/format";

const REFRESH_MS = 10_000;
const ZERO_PERSON = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** The connected wallet's own payments (engine records) plus balances. */
export default function HistoryPage() {
  const actor = useConsumerActor(true);
  const address = actor?.address ?? null;
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [credit, setCredit] = useState<bigint | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setRows(await fetchPayments({ payer: address, limit: 50 }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    try {
      const [bal, personId] = await Promise.all([
        publicClient.readContract({ address: addresses.MockIMKRW, abi: tokenAbi, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
        publicClient.readContract({ address: addresses.MerchantRegistry, abi: registryAbi, functionName: "personOf", args: [address] }) as Promise<`0x${string}`>,
      ]);
      const cr = (await publicClient.readContract({ address: addresses.DalgubeolPay, abi: dalgubeolPayAbi, functionName: "creditOf", args: [personId] })) as bigint;
      setBalance(bal);
      setCredit(cr);
      setRegistered(personId !== ZERO_PERSON);
    } catch {
      setBalance(null);
      setCredit(null);
    }
  }, [address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!actor || !address) {
    return (
      <>
        <PageHeader title="내 결제 내역" />
        <PersonaGate roles={[]} wallet title="지갑을 연결하면 내역을 볼 수 있어요" desc="결제 내역은 연결한 지갑 주소 기준으로 보여요." />
      </>
    );
  }

  const totalSpent = rows.reduce((s, p) => s + p.amount, 0);
  const totalBoost = rows.reduce((s, p) => s + p.boost, 0);

  return (
    <>
      <PageHeader title="내 결제 내역" desc="이 지갑으로 한 결제와 받은 보너스예요. 10초마다 갱신돼요." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <WalletCard kind={actor.kind} label={actor.label} address={address} balance={balance} credit={credit} registered={registered} />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card className="reveal" style={{ ["--i" as string]: 2 }}>
              <Stat
                icon={<IconTile name="list" tone="gray" size="sm" />}
                label="결제 건수"
                value={<CountUp value={rows.length} format={(v) => `${num(v)}건`} />}
                sub="엔진이 읽은 최근 50건"
              />
            </Card>
            <Card className="reveal" style={{ ["--i" as string]: 3 }}>
              <Stat
                icon={<IconTile name="spark" tone="brand" size="sm" />}
                label="총 결제 · 총 보너스"
                value={<CountUp value={totalSpent} format={won} />}
                tone="default"
                sub={`보너스 ${won(totalBoost)}`}
              />
            </Card>
          </div>
        </div>
        <div>
          {error && <p className="mb-3 text-[12px] text-red-600">{error}</p>}
          <RecentList rows={rows} />
        </div>
      </div>
    </>
  );
}
