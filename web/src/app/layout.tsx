import type { Metadata } from "next";
import "./globals.css";
import { PersonaProvider } from "@/components/PersonaProvider";
import { TopBar } from "@/components/TopBar";
import { Notice } from "@/components/ui";
import { chainId, chainLabel, deployment } from "@/lib/config";

export const metadata: Metadata = {
  title: {
    default: "iM LocalBoost",
    template: "%s | iM LocalBoost",
  },
  description: "상권·시간대별 동적 보너스 지역화폐 프로토타입",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard from jsDelivr (free CDN). The stack in globals.css falls back to system Korean fonts offline. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen bg-page text-gray-900">
        <PersonaProvider>
          <TopBar />
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
            <p>
              iM LocalBoost 프로토타입 · {chainLabel(chainId)} (chainId {chainId}) · 하루 경계 KST · 브라우저 서명은 데모 전용이에요
            </p>
          </footer>
        </PersonaProvider>
      </body>
    </html>
  );
}
