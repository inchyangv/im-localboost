"use client";

import { useEffect, useState } from "react";
import { DemoBadge } from "./DemoBadge";

interface Scenario {
  vulnerable_slot_sales_uplift: number | null;
  net_sales_per_won: number | null;
  deadweight_ratio: number | null;
  farming_leakage: number | null;
  detection_precision: number | null;
  detection_recall: number | null;
  total_sales: number;
  total_boost: number;
  k: number | null;
}

interface Results {
  meta: { seed: number; days: number; consumers: number; generated_at: string };
  definitions?: Record<string, string>;
  scenarios: Record<string, Scenario>;
}

const METRICS: Array<keyof Scenario> = [
  "vulnerable_slot_sales_uplift",
  "net_sales_per_won",
  "deadweight_ratio",
  "farming_leakage",
  "detection_precision",
  "detection_recall",
];
const ORDER = ["none", "A", "B", "C_on", "C_off"];

function Bars({ metric, scenarios }: { metric: keyof Scenario; scenarios: Record<string, Scenario> }) {
  const names = ORDER.filter((n) => n in scenarios);
  const values = names.map((n) => scenarios[n][metric] as number | null);
  const max = Math.max(1e-9, ...values.map((v) => (v === null ? 0 : Math.abs(v))));
  const W = 260;
  const H = 120;
  const pad = 22;
  const bw = (W - pad * 2) / names.length;
  return (
    <div className="rounded border border-gray-200 p-2">
      <p className="text-xs font-medium">{metric}</p>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="mt-1 w-full" role="img" aria-label={metric}>
        <line x1={pad} y1={H} x2={W - pad} y2={H} stroke="#9ca3af" />
        {names.map((n, i) => {
          const v = values[i];
          const h = v === null ? 0 : (Math.abs(v) / max) * (H - 20);
          const x = pad + i * bw + bw * 0.15;
          return (
            <g key={n}>
              {v === null ? (
                <rect x={x} y={H - 6} width={bw * 0.7} height={6} fill="none" stroke="#d1d5db" strokeDasharray="2 2" />
              ) : (
                <rect x={x} y={H - h} width={bw * 0.7} height={h} fill={v < 0 ? "#dc2626" : "#2563eb"} />
              )}
              <text x={x + bw * 0.35} y={H + 12} textAnchor="middle" fontSize="9" fill="#374151">
                {n}
              </text>
              <text x={x + bw * 0.35} y={v === null ? H - 10 : Math.max(10, H - h - 3)} textAnchor="middle" fontSize="8" fill="#111827">
                {v === null ? "해당 없음" : v.toFixed(3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function SimPanel() {
  const [data, setData] = useState<Results | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch("/sim/results.json", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setData((await r.json()) as Results);
      })
      .catch(() => setMissing(true));
  }, []);

  return (
    <section className="rounded border border-dashed border-purple-300 bg-white p-4">
      <h2 className="text-base font-semibold">
        시뮬레이션
        <DemoBadge />
      </h2>
      {missing || !data ? (
        <p className="mt-1 text-xs text-gray-500">
          {missing ? (
            <>
              결과 파일이 없습니다. <code>make sim</code>을 실행하세요.
            </>
          ) : (
            "읽는 중…"
          )}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-gray-500">
            seed {data.meta.seed} · {data.meta.days}일 · 소비자 {data.meta.consumers.toLocaleString("ko-KR")}명 · 생성 {data.meta.generated_at}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {METRICS.map((m) => (
              <Bars key={m} metric={m} scenarios={data.scenarios} />
            ))}
          </div>
          <table className="mt-3 w-full text-[11px]">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">시나리오</th>
                <th className="py-1 text-right">총매출</th>
                <th className="py-1 text-right">총 보너스</th>
                <th className="py-1 text-right">k</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ORDER.filter((n) => n in data.scenarios).map((n) => (
                <tr key={n}>
                  <td className="py-1">{n}</td>
                  <td className="py-1 text-right">{data.scenarios[n].total_sales.toLocaleString("ko-KR")}</td>
                  <td className="py-1 text-right">{data.scenarios[n].total_boost.toLocaleString("ko-KR")}</td>
                  <td className="py-1 text-right">{data.scenarios[n].k === null ? "해당 없음" : data.scenarios[n].k}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.definitions && (
            <details className="mt-2 text-[11px] text-gray-600">
              <summary className="cursor-pointer">지표 정의</summary>
              <ul className="mt-1 list-disc pl-4">
                {Object.entries(data.definitions).map(([k, v]) => (
                  <li key={k}>
                    <code>{k}</code>: {v}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sim/compare.png" alt="시뮬레이션 비교 차트 (matplotlib)" className="mt-3 w-full rounded border border-gray-200" />
        </>
      )}
    </section>
  );
}
