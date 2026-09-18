import type { Metadata } from "next";
import "./globals.css";
import { PersonaProvider } from "@/components/PersonaProvider";
import { TopBar } from "@/components/TopBar";
import { chainId, deployment } from "@/lib/config";

export const metadata: Metadata = {
  title: "iM-LocalBoost",
  description: "상권·시간대별 동적 보너스 지역화폐 프로토타입",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <PersonaProvider>
          <TopBar />
          <main className="mx-auto max-w-6xl px-4 py-6">
            {deployment ? (
              children
            ) : (
              <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
                <p className="font-semibold">배포 정보가 없습니다.</p>
                <p className="mt-1 text-gray-700">
                  chainId <code>{chainId}</code> 항목이 <code>shared/deployments.json</code>에 없습니다.{" "}
                  <code>make deploy-local</code>을 실행하거나 <code>NEXT_PUBLIC_CHAIN_ID</code>를 확인하세요.
                </p>
              </div>
            )}
          </main>
        </PersonaProvider>
      </body>
    </html>
  );
}
