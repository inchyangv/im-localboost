"use client";

import { useState } from "react";
import { DemoBadge } from "./DemoBadge";
import { replayLastSignature, runCollusionRing } from "@/lib/demo";

export function DemoPanel({ onChanged }: { onChanged: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState<"ring" | "replay" | null>(null);
  const [replay, setReplay] = useState<{ ok: boolean; errorName: string | null; message: string } | null>(null);
  const log = (line: string) => setLines((l) => [...l, `${new Date().toLocaleTimeString("ko-KR", { hour12: false })} ${line}`]);

  async function ring() {
    setBusy("ring");
    setLines([]);
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
    <section className="rounded border border-dashed border-purple-300 bg-white p-4">
      <h2 className="text-base font-semibold">
        데모 보조
        <DemoBadge />
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        담합 링: 가맹점 2가 소비자 2~5에게 9,000원을 되돌려 준 뒤(환류) 각 소비자가 결제합니다. 판정은 나온 그대로 표시됩니다
        (tier 1 → 보류, tier 2 → 즉시 차단). 서명 재사용: 소비자 화면의 직전 서명을 같은 인자로 다시 제출합니다 (보관된 서명이 없거나 곧 만료되면 소비자 1이 1,000원 결제를 먼저 합니다).
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button onClick={ring} disabled={busy !== null} className="rounded bg-purple-700 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy === "ring" ? "실행 중…" : "담합 링 실행"}
        </button>
        <button onClick={attack} disabled={busy !== null} className="rounded border border-purple-700 px-4 py-2 text-sm text-purple-800 disabled:opacity-50">
          {busy === "replay" ? "제출 중…" : "서명 재사용 공격"}
        </button>
      </div>
      {replay && (
        <p className={`mt-3 rounded p-2 text-sm ${replay.ok ? "border border-green-300 bg-green-50 text-green-800" : "border border-red-300 bg-red-50 text-red-800"}`}>
          {replay.ok ? "재사용이 차단되었습니다: " : ""}
          {replay.message}
          {replay.errorName && <code className="ml-1 text-xs">({replay.errorName})</code>}
        </p>
      )}
      {lines.length > 0 && (
        <pre className="mt-3 max-h-64 overflow-auto rounded bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">{lines.join("\n")}</pre>
      )}
    </section>
  );
}
