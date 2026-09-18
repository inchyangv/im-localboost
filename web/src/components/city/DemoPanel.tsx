"use client";

import { useState } from "react";
import { Button, Card, CardHeader, DemoBadge, Mono, Notice } from "@/components/ui";
import { replayLastSignature, runCollusionRing } from "@/lib/demo";

export function DemoPanel({ onChanged }: { onChanged: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState<"ring" | "replay" | null>(null);
  const [replay, setReplay] = useState<{ ok: boolean; errorName: string | null; message: string } | null>(null);
  const log = (line: string) => setLines((l) => [...l, `${new Date().toLocaleTimeString("ko-KR", { hour12: false })} ${line}`]);

  async function ring() {
    setBusy("ring");
    setLines([]);
    setReplay(null);
    try {
      await runCollusionRing(log);
    } catch (e) {
      log(`오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  async function attack() {
    setBusy("replay");
    setLines([]);
    setReplay(null);
    try {
      setReplay(await replayLastSignature(log));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card id="demo" className="scroll-mt-32 border border-dashed border-gray-300 shadow-none">
      <CardHeader
        title={
          <>
            데모 보조
            <DemoBadge />
          </>
        }
        desc="프로덕트 설계의 일부가 아니라 발표용 장치예요. 판정 결과는 나온 그대로 보여줘요."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-[14px] font-semibold text-gray-900">담합 링</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
            가맹점 2가 소비자 2~5에게 9,000원을 되돌려 준 뒤(환류) 각 소비자가 결제해요. tier 1이면 보류, tier 2면 즉시 차단돼요.
          </p>
          <Button variant="dark" onClick={ring} disabled={busy !== null} loading={busy === "ring"} className="mt-3" full>
            {busy === "ring" ? "실행 중" : "담합 링 실행"}
          </Button>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-[14px] font-semibold text-gray-900">서명 재사용 공격</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
            소비자 화면의 직전 서명을 같은 인자로 다시 제출해요. 컨트랙트가 nonce 재사용을 거부해야 해요.
          </p>
          <Button variant="outline" onClick={attack} disabled={busy !== null} loading={busy === "replay"} className="mt-3" full>
            {busy === "replay" ? "제출 중" : "서명 재사용 공격"}
          </Button>
        </div>
      </div>
      {replay && (
        <Notice tone={replay.ok ? "success" : "error"} className="mt-3" title={replay.ok ? "재사용이 차단됐어요" : "예상과 다른 결과예요"}>
          {replay.message}
          {replay.errorName && (
            <Mono className="ml-1.5" title={replay.errorName}>
              {replay.errorName}
            </Mono>
          )}
        </Notice>
      )}
      {lines.length > 0 && (
        <pre className="scroll-thin mt-3 max-h-64 overflow-auto rounded-xl bg-gray-900 p-4 font-mono text-[11.5px] leading-relaxed text-gray-100">{lines.join("\n")}</pre>
      )}
    </Card>
  );
}
