"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { cx } from "./ui";
import { chainId, chainLabel } from "@/lib/config";
import { health } from "@/lib/engine";

const NAV = [
  { href: "/", label: "소비자" },
  { href: "/merchant", label: "가맹점" },
  { href: "/city", label: "대구시·은행" },
];

const HEALTH_INTERVAL_MS = 15_000;

function useEngineHealth(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await health();
        if (alive) setOk(h.ok === true);
      } catch {
        if (alive) setOk(false);
      }
    };
    tick();
    const id = setInterval(tick, HEALTH_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return ok;
}

function NavTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cx("flex items-center gap-1", className)} aria-label="주요 화면">
      {NAV.map((n) => {
        const active = pathname === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors",
              active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TopBar() {
  const engineOk = useEngineHealth();
  const engineText = engineOk === null ? "엔진 확인 중" : engineOk ? "엔진 연결됨" : "엔진 연결 안 됨";
  const dot = engineOk === null ? "bg-gray-300" : engineOk ? "bg-brand-500" : "bg-red-500";

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-5 px-5">
        <Link
          href="/"
          className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
          aria-label="iM LocalBoost 홈"
        >
          <Logo />
        </Link>
        <NavTabs className="hidden sm:flex" />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span
            className="hidden items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-[12px] text-gray-600 md:inline-flex"
            title={`${chainLabel(chainId)} (chainId ${chainId}) · ${engineText}`}
          >
            <span className={cx("inline-block h-2 w-2 rounded-full", dot)} aria-hidden="true" />
            {engineText}
            <span className="text-gray-300">|</span>
            {chainLabel(chainId)}
          </span>
          <PersonaSwitcher />
        </div>
      </div>
      <div className="border-t border-gray-100 px-3 py-2 sm:hidden">
        <NavTabs />
      </div>
    </header>
  );
}
