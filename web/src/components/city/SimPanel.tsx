"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, Table, cx, td, tdRight, th, thRight } from "@/components/ui";

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

const METRICS: Array<{ key: keyof Scenario; label: string }> = [
  { key: "vulnerable_slot_sales_uplift", label: "취약 슬롯 매출 증가율" },
  { key: "net_sales_per_won", label: "예산 1원당 순증 매출" },
  { key: "deadweight_ratio", label: "사중 손실 비율" },
  { key: "farming_leakage", label: "파밍 누수율" },
  { key: "detection_precision", label: "탐지 정밀도" },
  { key: "detection_recall", label: "탐지 재현율" },
];

const SCENARIOS: Array<{ key: string; label: string }> = [
  { key: "none", label: "혜택 없음" },
  { key: "A", label: "일률 10%" },
  { key: "B", label: "동적 율" },
  { key: "C_on", label: "담합·방어 켬" },
  { key: "C_off", label: "담합·방어 끔" },
];

function Bars({ metric, label, scenarios }: { metric: keyof Scenario; label: string; scenarios: Record<string, Scenario> }) {
  const items = SCENARIOS.filter((s) => s.key in scenarios);
  const values = items.map((s) => scenarios[s.key][metric] as number | null);
  const max = Math.max(1e-9, ...values.map((v) => (v === null ? 0 : Math.abs(v))));
  const W = 300;
  const H = 110;
  const padX = 8;
  const bw = (W - padX * 2) / items.length;
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-[13px] font-semibold text-gray-800">{label}</p>
      <p className="font-mono text-[10px] text-gray-400">{metric}</p>
      <svg viewBox={`0 0 ${W} ${H + 34}`} className="mt-2 w-full" role="img" aria-label={label}>
        <line x1={padX} y1={H} x2={W - padX} y2={H} stroke="#e5e8eb" />
        {items.map((s, i) => {
          const v = values[i];
          const h = v === null ? 0 : (Math.abs(v) / max) * (H - 22);
          const x = padX + i * bw + bw * 0.18;
          const w = bw * 0.64;
          return (
            <g key={s.key}>
              {v === null ? (
                <rect x={x} y={H - 6} width={w} height={6} rx="2" fill="none" stroke="#d1d6db" strokeDasharray="3 2" />
              ) : (
                <rect x={x} y={H - h} width={w} height={h} rx="3" fill={v < 0 ? "#e5484d" : "#00a18e"} />
              )}
              <text x={x + w / 2} y={v === null ? H - 10 : Math.max(10, H - h - 4)} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#333d4b">
                {v === null ? "해당 없음" : v.toFixed(3)}
              </text>
              <text x={x + w / 2} y={H + 13} textAnchor="middle" fontSize="9.5" fill="#4e5968">
                {s.label}
              </text>
              <text x={x + w / 2} y={H + 25} textAnchor="middle" fontSize="8.5" fill="#b0b8c1" fontFamily="ui-monospace, monospace">
                {s.key}
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
    <Card id="sim" className="scroll-mt-32">
      <CardHeader
        title="시뮬레이션 결과"
        desc="다항 로짓 소비자 모형으로 다섯 시나리오를 비교했어요. 수치는 나온 그대로예요."
        right={
          data && (
            <span className="tnum">
              seed {data.meta.seed} · {data.meta.days}일 · 소비자 {data.meta.consumers.toLocaleString("ko-KR")}명 · {data.meta.generated_at}
            </span>
          )
        }
      />
      {missing || !data ? (
        <p className="mt-4 text-[13px] text-gray-500">
          {missing ? (
            <>
              결과 파일이 없어요. <code className="font-mono">make sim</code>을 실행하세요.
            </>
          ) : (
            "읽는 중이에요."
          )}
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {METRICS.map((m) => (
              <Bars key={m.key} metric={m.key} label={m.label} scenarios={data.scenarios} />
            ))}
          </div>
          <Table className="mt-4" minWidth={480}>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>시나리오</th>
                <th className={thRight}>총매출</th>
                <th className={thRight}>총 보너스</th>
                <th className={thRight}>k</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {SCENARIOS.filter((s) => s.key in data.scenarios).map((s) => (
                <tr key={s.key}>
                  <td className={cx(td, "font-medium")}>
                    {s.label} <span className="font-mono text-[11px] text-gray-400">{s.key}</span>
                  </td>
                  <td className={tdRight}>{data.scenarios[s.key].total_sales.toLocaleString("ko-KR")}</td>
                  <td className={tdRight}>{data.scenarios[s.key].total_boost.toLocaleString("ko-KR")}</td>
                  <td className={tdRight}>{data.scenarios[s.key].k === null ? "해당 없음" : data.scenarios[s.key].k}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {data.definitions && (
            <details className="mt-3 text-[12px] text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-700">지표 정의</summary>
              <ul className="mt-2 space-y-1 pl-1">
                {Object.entries(data.definitions).map(([k, v]) => (
                  <li key={k}>
                    <code className="font-mono text-[11px] text-gray-500">{k}</code> {v}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details className="mt-3 text-[12px] text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">matplotlib 원본 차트 (sim/out/compare.png)</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sim/compare.png" alt="시뮬레이션 비교 차트 (matplotlib)" className="mt-2 w-full rounded-xl border border-gray-200" />
          </details>
        </>
      )}
    </Card>
  );
}
