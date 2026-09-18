import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { chainId, chainLabel, deployment } from "@/lib/config";

/** Page container + footer shared by the consumer app and the admin tools. */
export function Shell({ children, footerLinks }: { children: ReactNode; footerLinks: Array<{ href: string; label: string }> }) {
  return (
    <>
      <main className="mx-auto w-full max-w-[1120px] px-5 pb-20 pt-8">
        {deployment ? (
          children
        ) : (
          <Notice tone="warn" title="배포 정보가 없어요">
            chainId <code className="font-mono">{chainId}</code> 항목이 <code className="font-mono">shared/deployments.json</code>에 없어요.{" "}
            <code className="font-mono">make deploy-local</code>을 실행하거나 <code className="font-mono">NEXT_PUBLIC_CHAIN_ID</code>를 확인하세요.
          </Notice>
        )}
      </main>
      <footer className="mx-auto w-full max-w-[1120px] px-5 pb-10 text-[12px] text-gray-500">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>달구벌페이 프로토타입 · {chainLabel(chainId)} (chainId {chainId}) · 하루 경계 KST</span>
          {footerLinks.map((l) => (
            <a key={l.href} href={l.href} className="underline underline-offset-2 hover:text-gray-700">
              {l.label}
            </a>
          ))}
        </p>
      </footer>
    </>
  );
}
