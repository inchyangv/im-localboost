"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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

/**
 * Fades its children up the first time they scroll into view. `index` staggers siblings. Without
 * IntersectionObserver (or with reduced motion) the content is simply visible.
 */
export function Reveal({
  children,
  index = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={[seen ? "reveal-go" : "reveal-wait", className].filter(Boolean).join(" ")}
      style={{ ["--i" as string]: index } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
