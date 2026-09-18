"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { chainId } from "@/lib/config";
import { health } from "@/lib/engine";

const NAV = [
  { href: "/", label: "소비자" },
  { href: "/merchant", label: "가맹점" },
  { href: "/city", label: "대구시·은행" },
];

const HEALTH_INTERVAL_MS = 15_000;

export function TopBar() {
  const pathname = usePathname();
  const [engineOk, setEngineOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await health();
        if (alive) setEngineOk(h.ok === true);
      } catch {
        if (alive) setEngineOk(false);
      }
    };
    tick();
    const id = setInterval(tick, HEALTH_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          iM-LocalBoost
        </Link>
        <nav className="flex gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded px-3 py-1 ${pathname === n.href ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <PersonaSwitcher />
          <span className="flex items-center gap-1 text-xs text-gray-600" title="체인 ID">
            chainId <code className="font-mono">{chainId}</code>
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-600" title="엔진 /health">
            엔진
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                engineOk === null ? "bg-gray-300" : engineOk ? "bg-green-500" : "bg-red-500"
              }`}
              aria-label={engineOk === null ? "확인 중" : engineOk ? "정상" : "연결 안 됨"}
            />
          </span>
        </div>
      </div>
    </header>
  );
}
