import { cx } from "./ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="10" fill="#00A18E" />
      <circle cx="10.5" cy="10.5" r="2.25" fill="#D3EFE9" />
      <path
        d="M10.5 14V20.75C10.5 23.9 12.1 25.5 15.25 25.5H16.25C18.45 25.5 19.9 24.8 21.5 23.2L26 18.7"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20.5 18.7H26V24.2" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className="whitespace-nowrap text-[17px] font-bold tracking-[-0.025em] text-gray-900">
        <span className="text-brand-600">달구벌</span>페이
      </span>
    </span>
  );
}
