import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { short, txUrl } from "@/lib/format";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Layout ---------- */

export function Card({
  children,
  className,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={cx("rounded-2xl bg-white shadow-card", padded && "p-6", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  desc,
  right,
  className,
  size = "md",
}: {
  title: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className={cx("font-bold text-gray-900", size === "lg" ? "text-[22px] leading-tight" : "text-[17px] leading-snug")}>{title}</h2>
        {desc && <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{desc}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2 text-[13px] text-gray-500">{right}</div>}
    </div>
  );
}

export function PageHeader({ title, desc, right }: { title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900">{title}</h1>
        {desc && <p className="mt-1.5 text-[14px] text-gray-500">{desc}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* ---------- Buttons ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "danger" | "dark" | "ghost";
  size?: "lg" | "md" | "sm";
  full?: boolean;
  loading?: boolean;
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700",
  secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300",
  outline: "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 active:bg-gray-100",
  danger: "bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200",
  dark: "bg-gray-900 text-white hover:bg-gray-800 active:bg-black",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  lg: "h-14 rounded-2xl px-6 text-[16px]",
  md: "h-11 rounded-xl px-4 text-[15px]",
  sm: "h-9 rounded-lg px-3 text-[13px]",
};

export function Button({ variant = "primary", size = "md", full, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 font-semibold transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        full && "w-full",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Badges ---------- */

export type Tone = "gray" | "brand" | "amber" | "red" | "dark" | "blue";

const BADGE_TONES: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-600",
  brand: "bg-brand-50 text-brand-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  dark: "bg-gray-900 text-white",
  blue: "bg-blue-50 text-blue-700",
};

export function Badge({ tone = "gray", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold leading-5", BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export const TIER_LABELS: Record<number, string> = { 0: "정상", 1: "보류", 2: "차단" };

export function TierBadge({ tier }: { tier: number }) {
  const tone: Tone = tier === 0 ? "brand" : tier === 1 ? "amber" : "red";
  return (
    <Badge tone={tone} title={`위험 등급 tier ${tier}`}>
      {TIER_LABELS[tier] ?? `tier ${tier}`}
      <span className="font-medium opacity-70">{tier}</span>
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="gray" className="ml-2 align-middle">
      데모 전용
    </Badge>
  );
}

/* ---------- Forms ---------- */

export const inputCls =
  "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-gray-900 placeholder:text-gray-400 " +
  "transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 " +
  "disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400";

export const selectCls = cx(inputCls, "select-chevron pr-10");

export function Field({
  label,
  hint,
  error,
  right,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-gray-600">{label}</span>
        {right && <span className="text-[12px] text-gray-500">{right}</span>}
      </div>
      {children}
      {error ? <p className="mt-1.5 text-[12px] text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

/** Whole-won amount input that shows thousands separators while storing an integer. */
export function AmountInput({
  value,
  onChange,
  disabled,
  size = "md",
  id,
  ariaLabel,
  placeholder = "0",
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: "md" | "lg";
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        className={cx(
          inputCls,
          "tnum pr-10 text-right",
          size === "lg" && "h-16 rounded-2xl px-5 pr-12 text-[28px] font-bold tracking-tight",
        )}
        value={value > 0 ? value.toLocaleString("ko-KR") : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          onChange(digits ? Math.min(Number.MAX_SAFE_INTEGER, parseInt(digits, 10)) : 0);
        }}
      />
      <span
        className={cx(
          "pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-500",
          size === "lg" ? "right-5 text-[18px] font-semibold" : "text-[14px]",
        )}
      >
        원
      </span>
    </div>
  );
}

/* ---------- Data display ---------- */

export function Stat({
  label,
  value,
  sub,
  size = "md",
  align = "left",
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
  tone?: "default" | "brand" | "muted";
}) {
  const valueCls = size === "lg" ? "text-[32px] leading-none" : size === "md" ? "text-[22px] leading-tight" : "text-[16px] leading-tight";
  const toneCls = tone === "brand" ? "text-brand-600" : tone === "muted" ? "text-gray-400" : "text-gray-900";
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="text-[13px] text-gray-500">{label}</p>
      <p className={cx("tnum mt-1 font-bold tracking-tight", valueCls, toneCls)}>{value}</p>
      {sub && <p className="mt-1 text-[12px] text-gray-500">{sub}</p>}
    </div>
  );
}

export function Progress({ ratio, tone = "brand", className }: { ratio: number; tone?: "brand" | "amber" | "red" | "gray"; className?: string }) {
  const pct = Math.max(0, Math.min(100, ratio));
  const fill = tone === "brand" ? "bg-brand-500" : tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-red-500" : "bg-gray-400";
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-gray-100", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warn" | "error";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const cls =
    tone === "success"
      ? "bg-brand-50 text-brand-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800"
        : tone === "error"
          ? "bg-red-50 text-red-700"
          : "bg-gray-50 text-gray-700";
  return (
    <div className={cx("rounded-xl px-4 py-3 text-[13px] leading-relaxed", cls, className)} role={tone === "error" ? "alert" : undefined}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <p className="text-[15px] font-semibold text-gray-800">{title}</p>
      {desc && <p className="mt-1 max-w-sm text-[13px] text-gray-500">{desc}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Mono({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <code title={title} className={cx("rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] text-gray-600", className)}>
      {children}
    </code>
  );
}

export function TxLink({ hash, n = 5, label }: { hash: string; n?: number; label?: string }) {
  const url = txUrl(hash);
  const text = label ?? short(hash, n);
  if (!url) {
    return (
      <code className="font-mono text-[12px] text-gray-500" title={hash}>
        {text}
      </code>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[12px] text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500"
      title={hash}
    >
      {text}
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 3h7v7M13 3 7 9M11 13H3V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/* ---------- Tables ---------- */

export const th = "py-2 pr-3 text-left text-[12px] font-medium text-gray-500 first:pl-0 last:pr-0";
export const thRight = cx(th, "text-right");
export const td = "py-2.5 pr-3 align-middle text-[13px] text-gray-800 first:pl-0 last:pr-0";
export const tdRight = cx(td, "tnum text-right");

export function Table({ children, className, minWidth }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cx("scroll-thin -mx-1 overflow-x-auto px-1", className)}>
      <table className="w-full border-collapse" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

/* ---------- Icons (inline, no icon library) ---------- */

export function CheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="m7.5 12.5 3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinusCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
