"use client";

import { useEffect, useState } from "react";
import { publicClient } from "@/lib/chain";
import { zones } from "@/lib/config";
import { addresses, localBoostAbi } from "@/lib/contracts";
import { pct } from "@/lib/format";

/** Fixed sketch coordinates for the five zones (not a real map). */
const LAYOUT: Record<number, { x: number; y: number; w: number; h: number }> = {
  1: { x: 150, y: 120, w: 120, h: 80 }, // 동성로 (center)
  2: { x: 250, y: 230, w: 120, h: 70 }, // 들안길 (south-east)
  3: { x: 60, y: 230, w: 110, h: 70 }, // 안지랑 (south-west)
  4: { x: 150, y: 20, w: 120, h: 70 }, // 북성로 (north)
  5: { x: 20, y: 110, w: 110, h: 80 }, // 서문시장 (west)
};

const REFRESH_MS = 10_000;

export function rateColor(bps: number): string {
  if (bps <= 0) return "#d1d5db"; // gray
  if (bps < 500) return "#bfdbfe"; // light
  if (bps < 1000) return "#60a5fa"; // medium
  return "#1d4ed8"; // strong
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

export function ZoneMap({
  rates,
  selected,
  onSelect,
}: {
  rates: Record<number, number>;
  selected: number | null;
  onSelect: (zoneId: number | null) => void;
}) {
  return (
    <svg viewBox="0 0 400 320" className="h-auto w-full max-w-md" role="img" aria-label="상권 약도">
      <rect x="0" y="0" width="400" height="320" fill="#f8fafc" rx="12" />
      {zones.map((z) => {
        const l = LAYOUT[z.id];
        const bps = rates[z.id] ?? 0;
        const active = selected === z.id;
        const dark = bps >= 1000;
        return (
          <g
            key={z.id}
            onClick={() => onSelect(active ? null : z.id)}
            className="cursor-pointer"
            role="button"
            aria-label={`${z.name} ${pct(bps)}`}
          >
            <rect
              x={l.x}
              y={l.y}
              width={l.w}
              height={l.h}
              rx="10"
              fill={rateColor(bps)}
              stroke={active ? "#111827" : "#94a3b8"}
              strokeWidth={active ? 3 : 1}
            />
            <text x={l.x + l.w / 2} y={l.y + l.h / 2 - 6} textAnchor="middle" fontSize="14" fontWeight="600" fill={dark ? "#fff" : "#111827"}>
              {z.name}
            </text>
            <text x={l.x + l.w / 2} y={l.y + l.h / 2 + 14} textAnchor="middle" fontSize="13" fill={dark ? "#fff" : "#374151"}>
              {pct(bps)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
