"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePersona } from "./PersonaProvider";
import { ChevronDown, cx } from "./ui";
import { short } from "@/lib/format";
import { roleHome, type Persona, type Role } from "@/lib/personas";

const ROLE_STYLE: Record<Role, { initial: string; cls: string }> = {
  payer: { initial: "소", cls: "bg-brand-50 text-brand-700" },
  merchant: { initial: "가", cls: "bg-amber-50 text-amber-700" },
  city: { initial: "시", cls: "bg-blue-50 text-blue-700" },
  bank: { initial: "은", cls: "bg-gray-900 text-white" },
};

export function RoleAvatar({ role, size = "md" }: { role: Role; size?: "sm" | "md" }) {
  const s = ROLE_STYLE[role];
  return (
    <span
      aria-hidden="true"
      className={cx("grid shrink-0 place-items-center rounded-full font-bold", s.cls, size === "sm" ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-[13px]")}
    >
      {s.initial}
    </span>
  );
}

const GROUPS: Array<{ label: string; roles: Role[] }> = [
  { label: "소비자", roles: ["payer"] },
  { label: "가맹점", roles: ["merchant"] },
  { label: "운영", roles: ["city", "bank"] },
];

export function PersonaSwitcher() {
  const { persona, personas, select } = usePersona();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (personas.length === 0) {
    return <span className="text-[13px] text-red-600">페르소나 키가 설정되지 않았어요 (NEXT_PUBLIC_*_KEY)</span>;
  }

  const choose = (p: Persona) => {
    select(p.id);
    setOpen(false);
    const home = roleHome(p.role);
    if (pathname !== home) router.push(home);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="페르소나 선택"
        className={cx(
          "flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white pl-1 pr-3 text-[14px] font-semibold text-gray-900 transition-colors",
          "hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
        )}
      >
        {persona ? <RoleAvatar role={persona.role} /> : null}
        <span>{persona?.label ?? "선택"}</span>
        {persona && <span className="hidden font-mono text-[11px] font-normal text-gray-500 sm:inline">{short(persona.account.address, 4)}</span>}
        <ChevronDown className={cx("h-4 w-4 text-gray-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl bg-white p-2 shadow-pop ring-1 ring-gray-200/70">
          {GROUPS.map((g) => {
            const items = personas.filter((p) => g.roles.includes(p.role));
            if (items.length === 0) return null;
            return (
              <div key={g.label} className="py-1">
                <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</p>
                {items.map((p) => {
                  const active = persona?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => choose(p)}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                        active ? "bg-gray-100" : "hover:bg-gray-50",
                      )}
                    >
                      <RoleAvatar role={p.role} size="sm" />
                      <span className="flex-1">
                        <span className="block text-[14px] font-medium text-gray-900">{p.label}</span>
                        <span className="block font-mono text-[11px] text-gray-500">{short(p.account.address, 6)}</span>
                      </span>
                      {active && (
                        <svg className="h-4 w-4 text-brand-600" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          <p className="px-3 pb-1 pt-2 text-[11px] leading-relaxed text-gray-400">페르소나를 고르면 그 역할의 화면으로 이동해요. 키는 데모 전용이에요.</p>
        </div>
      )}
    </div>
  );
}
