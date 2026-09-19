"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { NetworkBanner, WalletButton } from "./WalletButton";
import { Icon, LiveDot, cx, type IconName } from "./ui";
import { health } from "@/lib/engine";

const CONSUMER_NAV: Array<{ href: string; label: string; short: string; icon: IconName }> = [
  { href: "/", label: "결제", short: "결제", icon: "pay" },
  { href: "/map", label: "가맹점 지도", short: "지도", icon: "map" },
  { href: "/history", label: "내 결제 내역", short: "내역", icon: "list" },
];

const HEALTH_INTERVAL_MS = 15_000;

export function useEngineHealth(): boolean | null {
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

export function EngineDot({ className }: { className?: string }) {
  const engineOk = useEngineHealth();
  const text = engineOk === null ? "엔진 확인 중" : engineOk ? "엔진 연결됨" : "엔진 연결 안 됨";
  return (
    <span className={cx("inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-medium text-gray-600", className)} title={text}>
      <LiveDot tone={engineOk === null ? "gray" : engineOk ? "brand" : "red"} />
      {text}
    </span>
  );
}

export function NavTabs({ items, className }: { items: Array<{ href: string; label: string }>; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cx("flex items-center gap-1", className)} aria-label="주요 화면">
      {items.map((n) => {
        const root = n.href === "/" || n.href === "/admin";
        const active = pathname === n.href || (!root && pathname.startsWith(n.href));
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "whitespace-nowrap rounded-full px-3.5 py-2 text-[14px] transition-colors duration-150",
              active ? "bg-gray-100 font-semibold text-gray-900" : "font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Consumer app tab bar on phones: thumb-reachable, like a native app. The header keeps the wallet controls. */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-gray-200/70 bg-white/90 backdrop-blur-xl sm:hidden" aria-label="주요 화면">
      <ul className="mx-auto flex max-w-md">
        {CONSUMER_NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/pay") : pathname.startsWith(n.href);
          return (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] transition-[color,transform] duration-150 active:scale-95",
                  active ? "font-bold text-brand-600" : "font-medium text-gray-400",
                )}
              >
                <Icon name={n.icon} className="h-6 w-6" />
                {n.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Consumer app header: navigation, engine status, wallet controls. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-900/[0.06] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-6 px-5">
        <Link href="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2" aria-label="달구벌페이 홈">
          <Logo />
        </Link>
        <NavTabs items={CONSUMER_NAV} className="hidden sm:flex" />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <EngineDot className="hidden lg:inline-flex" />
          <WalletButton />
        </div>
      </div>
      <NetworkBanner />
    </header>
  );
}
