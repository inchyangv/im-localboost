"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { Badge, Button, Card, CardHeader, Notice, TxLink, inputCls } from "@/components/ui";
import { applyCaps, proposeCaps, readCaps } from "@/lib/city";
import type { Caps } from "@/lib/config";
import { parseChainError } from "@/lib/errors";

const FIELDS: Array<{ key: keyof Caps; label: string; unit: string }> = [
  { key: "maxRateBps", label: "최대 보너스율", unit: "bps" },
  { key: "perTxBoost", label: "건당 보너스 상한", unit: "원" },
  { key: "personDailyBoost", label: "1인 일일 상한", unit: "원" },
  { key: "slotCapBps", label: "슬롯 상한", unit: "bps" },
  { key: "pendingDelay", label: "보류 지연", unit: "초" },
  { key: "capsDelay", label: "상한 변경 지연", unit: "초" },
];

export function CapsPanel({ actor, isCity }: { actor: PrivateKeyAccount | null; isCity: boolean }) {
  const [current, setCurrent] = useState<Caps | null>(null);
  const [form, setForm] = useState<Caps | null>(null);
  const [readyAt, setReadyAt] = useState<number>(0);
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<"propose" | "apply" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: React.ReactNode } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await readCaps();
      setCurrent(r.caps);
      setForm((f) => f ?? r.caps);
      setReadyAt(r.readyAt);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clock);
    };
  }, [load]);

  async function run(kind: "propose" | "apply") {
    if (!actor || !form) return;
    setBusy(kind);
    setMsg(null);
    try {
      const hash = kind === "propose" ? await proposeCaps(actor, form) : await applyCaps(actor);
      setMsg({
        ok: true,
        text: (
          <>
            {kind === "propose" ? "제안" : "적용"} 완료 <TxLink hash={hash} />
          </>
        ),
      });
      if (kind === "apply") setForm(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: parseChainError(e).message });
    } finally {
      setBusy(null);
    }
  }

  const left = readyAt > 0 ? readyAt - now : null;
  const dirty = current && form && FIELDS.some((f) => current[f.key] !== form[f.key]);

  return (
    <Card id="caps" className="scroll-mt-44 lg:scroll-mt-32">
      <CardHeader
        title="상한 제안·적용"
        desc="대구시가 제안하면 타임락이 시작되고, 지연 시간이 지나면 누구나 적용할 수 있어요. 컨트랙트가 모든 상한을 강제해요."
        right={
          left !== null && (
            <Badge tone={left > 0 ? "amber" : "brand"} className="tnum">
              {left > 0 ? `적용 가능까지 ${left}초` : "적용 가능"}
            </Badge>
          )
        }
      />
      {current && form ? (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          {FIELDS.map((f) => {
            const changed = current[f.key] !== form[f.key];
            return (
              <label key={f.key} className="block">
                <span className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="font-medium text-gray-600">{f.label}</span>
                  <span className="text-[11px] text-gray-400">{f.unit}</span>
                </span>
                <input
                  type="number"
                  min={0}
                  className={`${inputCls} tnum h-11 ${changed ? "border-brand-500 ring-2 ring-brand-100" : ""}`}
                  value={form[f.key]}
                  disabled={!isCity}
                  onChange={(e) => setForm({ ...form, [f.key]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                />
                <span className="tnum mt-1 block text-[11px] text-gray-400">현재 {current[f.key].toLocaleString("ko-KR")}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-gray-500">체인에서 상한을 읽는 중이에요.</p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="dark" onClick={() => run("propose")} disabled={!isCity || !actor || !form || busy !== null || !dirty} loading={busy === "propose"}>
          제안
        </Button>
        <Button variant="secondary" onClick={() => run("apply")} disabled={!actor || busy !== null || readyAt === 0 || (left ?? 1) > 0} loading={busy === "apply"}>
          적용
        </Button>
        {!isCity && <span className="text-[12px] text-gray-500">제안은 대구시만, 적용은 누구나 할 수 있어요.</span>}
        {isCity && !dirty && current && <span className="text-[12px] text-gray-500">값을 바꾸면 제안할 수 있어요.</span>}
      </div>
      {msg && (
        <Notice tone={msg.ok ? "success" : "error"} className="mt-3">
          {msg.text}
        </Notice>
      )}
    </Card>
  );
}
