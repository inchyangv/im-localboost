import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import { Notice, cx } from "@/components/ui";
import { chainId, chainLabel, deployment } from "@/lib/config";

/** Page container + footer shared by the consumer app and the admin tools. `bottomTabs` leaves room for the phone tab bar. */
export function Shell({
  children,
  footerLinks,
  bottomTabs = false,
}: {
  children: ReactNode;
  footerLinks: Array<{ href: string; label: string }>;
  bottomTabs?: boolean;
}) {
  return (
    <>
      <main className="mx-auto min-h-[calc(100vh-16rem)] w-full max-w-[1120px] px-4 pb-16 pt-7 sm:px-5 sm:pt-10">
        {deployment ? (
          children
        ) : (
          <Notice tone="warn" title="배포 정보가 없어요">
            chainId <code className="font-mono">{chainId}</code> 항목이 <code className="font-mono">shared/deployments.json</code>에 없어요.{" "}
            <code className="font-mono">make deploy-local</code>을 실행하거나 <code className="font-mono">NEXT_PUBLIC_CHAIN_ID</code>를 확인하세요.
          </Notice>
        )}
      </main>
      <footer className={cx("border-t border-gray-900/[0.06]", bottomTabs && "pb-20 sm:pb-0")}>
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-7 text-[12px] text-gray-500 sm:px-5">
          <p className="flex items-center gap-2.5">
            <LogoMark className="h-5 w-5 opacity-80 grayscale" />
            <span>
              달구벌페이 프로토타입 · {chainLabel(chainId)} (chainId {chainId}) · 하루 경계 KST
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {footerLinks.map((l) => (
              <a key={l.href} href={l.href} className="font-medium text-gray-600 transition-colors hover:text-gray-900">
                {l.label} →
              </a>
            ))}
          </p>
        </div>
      </footer>
    </>
  );
}
