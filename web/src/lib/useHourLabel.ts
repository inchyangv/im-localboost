"use client";

import { useEffect, useState } from "react";
import { hourEpoch } from "@/lib/contracts";
import { kstHourLabel } from "@/lib/format";

/**
 * Current KST hour slot label ("22시 ~ 23시"). Empty until mounted: these pages are prerendered at
 * build time, so reading the clock during render makes the server HTML disagree with the client
 * (React #425). Refreshes every 30s so the label follows the hour.
 */
export function useHourLabel(): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => setLabel(kstHourLabel(hourEpoch(Math.floor(Date.now() / 1000))));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return label;
}
