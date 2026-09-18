"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { applyCaps, proposeCaps, readCaps } from "@/lib/city";
import type { Caps } from "@/lib/config";
import { parseChainError } from "@/lib/errors";
import { short } from "@/lib/format";

const FIELDS: Array<{ key: keyof Caps; label: string }> = [
  { key: "maxRateBps", label: "최대 율 (bps)" },
  { key: "perTxBoost", label: "건당 보너스 상한 (원)" },
  { key: "personDailyBoost", label: "1인 일일 상한 (원)" },
  { key: "slotCapBps", label: "슬롯 상한 (bps)" },
  { key: "pendingDelay", label: "보류 지연 (초)" },
  { key: "capsDelay", label: "상한 변경 지연 (초)" },
];

export function CapsPanel({ actor, isCity }: { actor: PrivateKeyAccount | null; isCity: boolean }) {
  const [current, setCurrent] = useState<Caps | null>(null);
  const [form, setForm] = useState<Caps | null>(null);
  const [readyAt, setReadyAt] = useState<number>(0);
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    setBusy(true);
    setMsg(null);
    try {
      const hash = kind === "propose" ? await proposeCaps(actor, form) : await applyCaps(actor);
      setMsg({ ok: true, text: `${kind === "propose" ? "제안" : "적용"} 완료 (tx ${short(hash, 5)})` });
      if (kind === "apply") setForm(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: parseChainError(e).message });
    } finally {
      setBusy(false);
    }
  }

  const left = readyAt > 0 ? readyAt - now : null;

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold">상한 제안·적용 (대구시)</h2>
      {current && form && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-gray-600">{f.label}</span>
              <input
                type="number"
                min={0}
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1"
                value={form[f.key]}
                disabled={!isCity}
                onChange={(e) => setForm({ ...form, [f.key]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              />
              <span className="text-[10px] text-gray-400">현재 {current[f.key]}</span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => run("propose")} disabled={!isCity || !actor || busy || !form} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          제안
        </button>
        <button onClick={() => run("apply")} disabled={!actor || busy || readyAt === 0} className="rounded border border-gray-400 px-3 py-1.5 text-sm disabled:opacity-50">
          적용
        </button>
        {left !== null && (
          <span className="text-xs text-gray-600">{left > 0 ? `적용 가능까지 ${left}초` : "적용 가능 (누구나)"}</span>
        )}
      </div>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </section>
  );
}
