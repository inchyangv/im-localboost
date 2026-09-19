import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { short, txUrl } from "@/lib/format";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Layout ---------- */

const CARD_TONES = {
  default: "bg-white shadow-card",
  /** Deep surface for the one focal element of a screen (balance). */
  ink: "surface-ink shadow-ink",
  tint: "bg-brand-50 ring-1 ring-inset ring-brand-100",
  flat: "bg-gray-50 ring-1 ring-inset ring-gray-100",
} as const;

export function Card({
  children,
  className,
  padded = true,
  tone = "default",
  ...rest
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  padded?: boolean;
  tone?: keyof typeof CARD_TONES;
}) {
  return (
    // min-w-0: as a grid item the card may shrink below its content's min-content width (wide tables scroll inside it).
    <section className={cx("min-w-0 rounded-3xl", CARD_TONES[tone], padded && "p-5 sm:p-6", className)} {...rest}>
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
        <h2 className={cx("font-bold tracking-heading text-gray-900", size === "lg" ? "text-[22px] leading-tight" : "text-[17px] leading-snug")}>{title}</h2>
        {desc && <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{desc}</p>}
      </div>
      {right && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-[13px] text-gray-500 sm:shrink-0">{right}</div>}
    </div>
  );
}

export function PageHeader({ title, desc, right, eyebrow }: { title: ReactNode; desc?: ReactNode; right?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="reveal mb-6 flex flex-wrap items-end justify-between gap-x-3 gap-y-4 sm:mb-7">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-[13px] font-semibold text-brand-600">{eyebrow}</p>}
        <h1 className="text-[26px] font-bold leading-[1.2] tracking-display text-gray-900 sm:text-[30px]">{title}</h1>
        {desc && <p className="mt-2 text-[14px] leading-relaxed text-gray-500 sm:text-[15px]">{desc}</p>}
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
  primary: "bg-brand-500 text-white shadow-cta-sm hover:bg-brand-600 active:bg-brand-700 disabled:shadow-none",
  secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300",
  outline: "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 active:bg-gray-100",
  danger: "bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200",
  dark: "bg-gray-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-gray-800 active:bg-black",
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
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold",
        "transition-[transform,background-color,box-shadow,color] duration-150 ease-out active:scale-[0.97]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        variant === "primary" && size === "lg" && "btn-shine shadow-cta",
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

/* Two field looks that never share a conflicting utility (bg-white + bg-gray-100 on one element resolves by CSS
   order, not by class order), so pick one instead of overriding the other. */
const inputCore =
  "w-full text-gray-900 placeholder:text-gray-400 transition-[border-color,box-shadow,background-color] duration-150 " +
  "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 " +
  "disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400";

/** Outlined field: forms in cards. */
export const inputCls = "h-12 rounded-xl border border-gray-200 bg-white px-4 text-[15px] hover:border-gray-300 " + inputCore;

/** Filled field: search boxes and the large amount entry. Size (height, radius, padding, text) is set by the caller. */
export const inputSoftCls = "border border-transparent bg-gray-100 focus:bg-white " + inputCore;

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
          "tnum text-right",
          size === "lg" ? cx(inputSoftCls, "h-[72px] rounded-2xl px-5 pr-12 text-[32px] font-bold tracking-display") : cx(inputCls, "pr-10"),
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
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
  tone?: "default" | "brand" | "muted";
  icon?: ReactNode;
}) {
  const valueCls = size === "lg" ? "text-[30px] sm:text-[32px]" : size === "md" ? "text-[22px]" : "text-[16px]";
  const toneCls = tone === "brand" ? "text-brand-600" : tone === "muted" ? "text-gray-400" : "text-gray-900";
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={cx("flex items-center gap-2", align === "right" && "justify-end")}>
        {icon}
        <p className="text-[13px] font-medium text-gray-500">{label}</p>
      </div>
      <p className={cx("num-display", icon ? "mt-3" : "mt-2", valueCls, toneCls)}>{value}</p>
      {sub && <p className="mt-2 text-[12px] text-gray-500">{sub}</p>}
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
    <div className={cx("flex gap-2.5 rounded-2xl px-4 py-3 text-[13px] leading-relaxed", cls, className)} role={tone === "error" ? "alert" : undefined}>
      <Icon name={tone === "success" ? "check" : tone === "info" ? "info" : "alert"} className="mt-[3px] h-4 w-4 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, desc, children, icon }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center py-10 text-center sm:py-14">
      {icon && <IconTile name={icon} tone="brand" size="lg" className="mb-5" />}
      <p className="text-[19px] font-bold tracking-heading text-gray-900">{title}</p>
      {desc && <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-gray-500 text-balance">{desc}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Inline row placeholder for lists and cards that have nothing to show yet. */
export function EmptyRow({ icon = "list", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-4 text-[13px] text-gray-500">
      <IconTile name={icon} tone="gray" size="sm" />
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx("skeleton inline-block align-middle", className)} aria-hidden="true" />;
}

/** Pulsing dot next to data that refreshes on its own. */
export function LiveDot({ tone = "brand", className }: { tone?: "brand" | "red" | "gray"; className?: string }) {
  const bg = tone === "brand" ? "bg-brand-500" : tone === "red" ? "bg-red-500" : "bg-gray-300";
  return (
    <span className={cx("relative inline-flex h-2 w-2", className)} aria-hidden="true">
      {tone !== "gray" && <span className={cx("absolute inset-0 animate-pulse-ring rounded-full", bg)} />}
      <span className={cx("relative inline-block h-2 w-2 rounded-full", bg)} />
    </span>
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

export const th = "whitespace-nowrap border-b border-gray-100 pb-2.5 pr-3 text-left text-[12px] font-medium text-gray-500 first:pl-0 last:pr-0";
export const thRight = cx(th, "text-right");
export const td = "py-3 pr-3 align-middle text-[13px] text-gray-800 first:pl-0 last:pr-0";
export const tr = "border-t border-gray-100 first:border-t-0 transition-colors hover:bg-gray-50/80";
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
      <path className="draw-stroke" d="m7.5 12.5 3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path className="draw-stroke" d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

/* ---------- Line icon set (20px grid, 1.6 stroke) ---------- */

const ICON_PATHS = {
  pay: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2.5" />
      <path d="M2.5 8.5h15M5.5 12.5h3" />
    </>
  ),
  map: (
    <>
      <path d="M10 17.5s5.5-4.6 5.5-9a5.5 5.5 0 1 0-11 0c0 4.4 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8.5" r="2" />
    </>
  ),
  list: (
    <>
      <path d="M5 3h10a1 1 0 0 1 1 1v13l-2.5-1.5L11 17l-2.5-1.5L6 17l-2-1V4a1 1 0 0 1 1-1Z" />
      <path d="M7 7.5h6M7 10.5h4" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" />
      <path d="M11.5 11.5h2.2v2.2M17 11.5v2.2M11.5 17h2.2M17 17h-.01M14.6 14.6H17" />
    </>
  ),
  shield: (
    <>
      <path d="M10 2.5 4 5v4.6c0 3.7 2.4 6.6 6 7.9 3.6-1.3 6-4.2 6-7.9V5l-6-2.5Z" />
      <path d="m7.5 10 1.8 1.8 3.4-3.6" />
    </>
  ),
  spark: <path d="M11 2.5 4.5 11h5l-.5 6.5L15.5 9h-5l.5-6.5Z" />,
  arrow: <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />,
  store: (
    <>
      <path d="M3.5 8.5v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7" />
      <path d="M2.5 6 4 3.5h12L17.5 6a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0Z" />
      <path d="M8 16.5v-4h4v4" />
    </>
  ),
  food: <path d="M6 2.5v15M4 2.5v4.5a2 2 0 0 0 4 0V2.5M14 17.5v-6M14 11.5c-1.5 0-2.5-1.5-2.5-4.5s1-4.5 2.5-4.5v9Z" />,
  cafe: (
    <>
      <path d="M4 7.5h10V12a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7.5Z" />
      <path d="M14 9h1a2 2 0 0 1 0 4h-1M7 2.5v2M10.5 2.5v2" />
    </>
  ),
  bag: (
    <>
      <path d="M4.5 6.5h11l1 10h-13l1-10Z" />
      <path d="M7.5 8.5v-3a2.5 2.5 0 0 1 5 0v3" />
    </>
  ),
  service: (
    <>
      <circle cx="5.5" cy="5.5" r="2" />
      <circle cx="5.5" cy="14.5" r="2" />
      <path d="M7.2 6.6 16.5 14M7.2 13.4 16.5 6" />
    </>
  ),
  trend: <path d="M3 14.5 8 9.5l3 3 6-6.5M12.5 6H17v4.5" />,
  ban: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m5.2 5.2 9.6 9.6" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="10" cy="6" rx="6" ry="2.5" />
      <path d="M4 6v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6M4 10v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H15v3" />
      <rect x="3" y="6.5" width="14" height="10" rx="2.5" />
      <path d="M13.5 11.5h.01" />
    </>
  ),
  bank: <path d="M3 8 10 3.5 17 8M4.5 8v6.5M8 8v6.5M12 8v6.5M15.5 8v6.5M3 16.5h14" />,
  check: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m7 10.2 2 2 4-4.2" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9.5v4M10 6.5h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10 3.5 2.8 16h14.4L10 3.5Z" />
      <path d="M10 8.5v3.5M10 14h.01" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

const TILE_TONES = {
  brand: "bg-brand-50 text-brand-600",
  gray: "bg-gray-100 text-gray-500",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  ink: "bg-white/10 text-white",
  solid: "bg-brand-500 text-white",
} as const;

const TILE_SIZES = {
  sm: "h-8 w-8 rounded-[10px] [&>svg]:h-4 [&>svg]:w-4",
  md: "h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5",
  lg: "h-14 w-14 rounded-2xl [&>svg]:h-7 [&>svg]:w-7",
} as const;

/** Rounded icon chip: merchant categories, KPI cards, empty states. */
export function IconTile({
  name,
  tone = "gray",
  size = "md",
  className,
}: {
  name: IconName;
  tone?: keyof typeof TILE_TONES;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  return (
    <span className={cx("grid shrink-0 place-items-center", TILE_TONES[tone], TILE_SIZES[size], className)} aria-hidden="true">
      <Icon name={name} />
    </span>
  );
}

export const CATEGORY_ICONS: Record<number, IconName> = { 1: "food", 2: "cafe", 3: "bag", 4: "service" };
