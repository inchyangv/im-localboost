import { cx } from "./ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="38" height="38" rx="12" fill="#007F72" />
      <path d="M1 26.5C8.8 22.5 17.8 25.1 23.7 18.4C29.2 12.2 33.6 14 39 14V27C39 33.6 33.6 39 27 39H13C6.4 39 1 33.6 1 27V26.5Z" fill="#009E8C" />
      <rect x="1" y="1" width="38" height="38" rx="12" stroke="#006F65" strokeWidth="2" />
      <circle cx="11.75" cy="11.75" r="3" fill="#A8E0D5" />
      <path
        d="M11.75 17V23C11.75 26.9 13.85 29 17.75 29H19.25C22.05 29 23.95 28.1 26 26.05L31.25 20.8"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24.9 20.8H31.25V27.15" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 3.5C14.2 0.8 24.6 1.1 31.5 4.8" stroke="white" strokeOpacity="0.16" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-9 w-9 shrink-0 drop-shadow-[0_2px_4px_rgba(0,119,106,0.22)]" />
      <span className="flex flex-col whitespace-nowrap">
        <span className={cx("text-[19px] font-extrabold leading-[1.05] tracking-[-0.045em]", inverse ? "text-white" : "text-gray-900")}>
          <span className={inverse ? "text-brand-300" : "text-brand-700"}>달구벌</span>페이
        </span>
        <span className={cx("mt-1 text-[7px] font-bold leading-none tracking-[0.2em]", inverse ? "text-gray-400" : "text-gray-500")}>
          DAEGU LOCAL PAY
        </span>
      </span>
    </span>
  );
}
