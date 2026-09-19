"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 700;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Counts from the previously shown value to `value`. Presentation only: in-between frames are whole
 * numbers and the last frame always prints the exact input, so no rounded amount ever stays on screen.
 */
export function CountUp({ value, format }: { value: bigint | number; format: (v: bigint) => string }) {
  const target = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  const [shown, setShown] = useState<bigint>(target);
  const shownRef = useRef<bigint>(target);
  const mounted = useRef(false);

  useEffect(() => {
    const from = mounted.current ? shownRef.current : 0n;
    mounted.current = true;
    const safe = target <= BigInt(Number.MAX_SAFE_INTEGER) && target >= -BigInt(Number.MAX_SAFE_INTEGER);
    if (from === target || !safe || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const a = Number(from);
    const b = Number(target);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 4);
      const next = t >= 1 ? target : BigInt(Math.round(a + (b - a) * eased));
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return <>{format(shown)}</>;
}
