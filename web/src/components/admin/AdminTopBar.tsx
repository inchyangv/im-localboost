"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PersonaSwitcher } from "@/components/PersonaSwitcher";
import { EngineDot, NavTabs } from "@/components/TopBar";
import { chainId, chainLabel } from "@/lib/config";

const ADMIN_NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/merchant", label: "가맹점 데스크" },
  { href: "/admin/city", label: "대구시" },
  { href: "/admin/bank", label: "은행·정산" },
];

/** Admin header: dark band so it is never mistaken for the consumer app; demo accounts live here. */
export function AdminTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-900/95 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-5 px-5">
        <Link href="/admin" className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300" aria-label="관리자 도구 홈">
          <Logo inverse />
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80 ring-1 ring-inset ring-white/15">관리자</span>
        </Link>
        <div className="hidden sm:flex [&_a]:text-white/60 [&_a:hover]:bg-white/10 [&_a:hover]:text-white [&_a[aria-current=page]]:bg-white/[0.12] [&_a[aria-current=page]]:text-white">
          <NavTabs items={ADMIN_NAV} />
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden text-[12px] text-gray-400 md:inline">{chainLabel(chainId)}</span>
          <EngineDot className="hidden bg-white/10 text-white/70 lg:inline-flex" />
          <PersonaSwitcher />
        </div>
      </div>
      <div className="scroll-none overflow-x-auto border-t border-white/10 px-3 py-2 sm:hidden [&_a]:text-white/60 [&_a[aria-current=page]]:bg-white/[0.12] [&_a[aria-current=page]]:text-white">
        <NavTabs items={ADMIN_NAV} />
      </div>
    </header>
  );
}
