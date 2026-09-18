"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";
import { publicClient } from "@/lib/chain";
import { zones } from "@/lib/config";
import { addresses, localBoostAbi } from "@/lib/contracts";
import { pct } from "@/lib/format";

/** Fixed sketch coordinates for the five zones (not a real map). */
const LAYOUT: Record<number, { x: number; y: number; w: number; h: number }> = {
  4: { x: 138, y: 22, w: 132, h: 78 }, // 북성로 (north)
  5: { x: 14, y: 120, w: 112, h: 84 }, // 서문시장 (west)
  1: { x: 138, y: 120, w: 132, h: 84 }, // 동성로 (center)
  3: { x: 58, y: 226, w: 122, h: 76 }, // 안지랑 (south-west)
  2: { x: 244, y: 226, w: 130, h: 76 }, // 들안길 (south-east)
};

const REFRESH_MS = 10_000;

export type RateLevel = "none" | "low" | "mid" | "high";

export function rateLevel(bps: number): RateLevel {
  if (bps <= 0) return "none";
  if (bps < 500) return "low";
  if (bps < 1000) return "mid";
  return "high";
}

const LEVEL_STYLE: Record<RateLevel, { fill: string; text: string; sub: string; label: string }> = {
  none: { fill: "#f2f4f6", text: "#4e5968", sub: "#8b95a1", label: "0%" },
  low: { fill: "#d3efe9", text: "#045f55", sub: "#00776a", label: "5% 미만" },
  mid: { fill: "#8fd9ca", text: "#045f55", sub: "#00776a", label: "5~10%" },
  high: { fill: "#00a18e", text: "#ffffff", sub: "rgba(255,255,255,0.85)", label: "10% 이상" },
};

export function rateColor(bps: number): string {
  return LEVEL_STYLE[rateLevel(bps)].fill;
}

export function useZoneRates(): { rates: Record<number, number>; refresh: () => Promise<void> } {
  const [rates, setRates] = useState<Record<number, number>>({});
  const refresh = async () => {
    try {
      const entries = await Promise.all(
        zones.map(async (z) => {
          const r = (await publicClient.readContract({
            address: addresses.LocalBoost,
            abi: localBoostAbi,
            functionName: "currentRate",
            args: [z.id],
          })) as number;
          return [z.id, Number(r)] as const;
        }),
      );
      setRates(Object.fromEntries(entries));
    } catch {
      // keep the last known values when the RPC is unreachable
    }
  };
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { rates, refresh };
}

function center(id: number) {
  const l = LAYOUT[id];
  return { cx: l.x + l.w / 2, cy: l.y + l.h / 2 };
}

export function ZoneMap({
  rates,
  selected,
  onSelect,
  className,
}: {
  rates: Record<number, number>;
  selected: number | null;
  onSelect: (zoneId: number | null) => void;
  className?: string;
}) {
  const hub = center(1);
  return (
    <svg viewBox="0 0 388 320" className={cx("h-auto w-full", className)} role="img" aria-label="상권 약도">
      {/* Sketch roads from the centre district to the others, drawn under the blocks. */}
      {zones
        .filter((z) => z.id !== 1 && LAYOUT[z.id])
        .map((z) => {
          const c = center(z.id);
          return <line key={z.id} x1={hub.cx} y1={hub.cy} x2={c.cx} y2={c.cy} stroke="#e9edf0" strokeWidth="4" strokeLinecap="round" />;
        })}
      {zones.map((z) => {
        const l = LAYOUT[z.id];
        if (!l) return null;
        const bps = rates[z.id] ?? 0;
        const s = LEVEL_STYLE[rateLevel(bps)];
        const active = selected === z.id;
        return (
          <g
            key={z.id}
            onClick={() => onSelect(active ? null : z.id)}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(active ? null : z.id);
              }
            }}
            aria-label={`${z.name} ${pct(bps)}`}
            aria-pressed={active}
          >
            {active && <rect x={l.x - 4} y={l.y - 4} width={l.w + 8} height={l.h + 8} rx="20" fill="none" stroke="#191f28" strokeWidth="2" />}
            <rect x={l.x} y={l.y} width={l.w} height={l.h} rx="16" fill={s.fill} className="transition-opacity hover:opacity-90" />
            <text x={l.x + l.w / 2} y={l.y + l.h / 2 - 8} textAnchor="middle" fontSize="14" fontWeight="600" fill={s.text}>
              {z.name}
            </text>
            <text x={l.x + l.w / 2} y={l.y + l.h / 2 + 16} textAnchor="middle" fontSize="17" fontWeight="700" fill={s.text} className="tnum">
              {pct(bps)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ZoneLegend({ className }: { className?: string }) {
  const levels: RateLevel[] = ["none", "low", "mid", "high"];
  return (
    <ul className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500", className)} aria-label="보너스율 범례">
      {levels.map((lv) => (
        <li key={lv} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[4px]" style={{ background: LEVEL_STYLE[lv].fill }} aria-hidden="true" />
          {LEVEL_STYLE[lv].label}
        </li>
      ))}
    </ul>
  );
}
