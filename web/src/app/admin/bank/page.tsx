"use client";

import { useState } from "react";
import { PersonaGate } from "@/components/PersonaGate";
import { usePersona } from "@/components/PersonaProvider";
import { SettlementDesk } from "@/components/bank/SettlementDesk";
import { PendingTable, RiskLogTable } from "@/components/city/RiskAndPending";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";

/** Bank operations: settlement payouts, pending-bonus clawback, onboarding policy. */
export default function BankPage() {
  const { persona } = usePersona();
  const [refreshKey, setRefreshKey] = useState(0);
  const isBank = persona?.role === "bank";
  const actor = isBank ? persona!.account : null;
  const bump = () => setRefreshKey((k) => k + 1);

  if (!persona || persona.role !== "bank") {
    return <PersonaGate roles={["bank"]} title="은행 백오피스예요" desc="은행 데모 계정을 고르면 정산 지급과 보류 보너스 환수를 처리할 수 있어요." />;
  }

  return (
    <>
      <PageHeader title="은행 · 정산" desc="가맹점 정산(원화 지급), 위험 판정으로 보류된 보너스의 환수, 지갑 온보딩 정책을 다뤄요." right={<Badge tone="gray">BANK_ROLE</Badge>} />
      <div className="space-y-6">
        <SettlementDesk bank={actor} onChanged={bump} />
        <PendingTable actor={actor} isBank={isBank} onChanged={bump} refreshKey={refreshKey} />
        <RiskLogTable />
        <Card>
          <CardHeader title="지갑 온보딩 정책" desc="소비자 앱의 '은행 등록하고 시작 자금 받기'가 호출하는 엔진 /onboard의 규칙이에요." />
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-gray-700">
            <li>지갑당 personId를 한 번 연결해요(개인 상한은 지갑이 아니라 personId 기준).</li>
            <li>iMKRW 100,000원을 KST 하루 1회 발행해요(실서비스에서는 원화 입금에 대응).</li>
            <li>지갑의 KAIA가 0.1 미만이면 수수료용 0.2 KAIA를 함께 보내요.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
