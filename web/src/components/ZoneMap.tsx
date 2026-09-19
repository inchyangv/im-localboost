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
  none: { fill: "#f2f4f6", text: "#8b95a1", sub: "#6b7684", label: "0%" },
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
  const top = Math.max(0, ...zones.map((z) => rates[z.id] ?? 0));
  return (
    <div className={cx("surface-map overflow-hidden rounded-2xl ring-1 ring-inset ring-gray-100", className)}>
      <svg viewBox="0 0 388 324" className="h-auto w-full" role="img" aria-label="상권 약도">
        <defs>
          <filter id="zone-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0c1a1f" floodOpacity="0.12" />
          </filter>
        </defs>
        {/* Sketch roads from the centre district to the others, drawn under the blocks. */}
        {zones
          .filter((z) => z.id !== 1 && LAYOUT[z.id])
          .map((z) => {
            const c = center(z.id);
            return (
              <g key={z.id}>
                <line x1={hub.cx} y1={hub.cy} x2={c.cx} y2={c.cy} stroke="#ffffff" strokeWidth="11" strokeLinecap="round" />
                <line x1={hub.cx} y1={hub.cy} x2={c.cx} y2={c.cy} stroke="#d1d6db" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 7" />
              </g>
            );
          })}
        {zones.map((z) => {
          const l = LAYOUT[z.id];
          if (!l) return null;
          const bps = rates[z.id] ?? 0;
          const lv = rateLevel(bps);
          const s = LEVEL_STYLE[lv];
          const active = selected === z.id;
          const hot = bps > 0 && bps === top;
          return (
            <g
              key={z.id}
              onClick={() => onSelect(active ? null : z.id)}
              className="group cursor-pointer outline-none"
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
              {active && <rect x={l.x - 5} y={l.y - 5} width={l.w + 10} height={l.h + 10} rx="23" fill="none" stroke="#191f28" strokeWidth="2" />}
              <rect
                x={l.x}
                y={l.y}
                width={l.w}
                height={l.h}
                rx="18"
                fill={lv === "none" ? "#ffffff" : s.fill}
                stroke={lv === "none" ? "#e5e8eb" : "none"}
                filter="url(#zone-shadow)"
                className="transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90"
              />
              <text x={l.x + 16} y={l.y + 28} fontSize="13" fontWeight="600" fill={s.sub}>
                {z.name}
              </text>
              <text x={l.x + 16} y={l.y + l.h - 16} fontSize="22" fontWeight="700" letterSpacing="-0.8" fill={s.text} className="tnum">
                {pct(bps)}
              </text>
              {hot && (
                <g aria-hidden="true">
                  <circle cx={l.x + l.w - 18} cy={l.y + 22} r="4" fill={lv === "high" ? "#ffffff" : "#00a18e"} opacity="0.5">
                    <animate attributeName="r" values="4;11" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={l.x + l.w - 18} cy={l.y + 22} r="4" fill={lv === "high" ? "#ffffff" : "#00a18e"} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ZoneLegend({ className }: { className?: string }) {
  const levels: RateLevel[] = ["none", "low", "mid", "high"];
  return (
    <ul className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500", className)} aria-label="보너스율 범례">
      {levels.map((lv) => (
        <li key={lv} className="flex items-center gap-1.5">
          <span
            className={cx("inline-block h-3 w-3 rounded-[4px]", lv === "none" && "ring-1 ring-inset ring-gray-300")}
            style={{ background: lv === "none" ? "#ffffff" : LEVEL_STYLE[lv].fill }}
            aria-hidden="true"
          />
          {LEVEL_STYLE[lv].label}
        </li>
      ))}
    </ul>
  );
}
