import type { Metadata } from "next";
import "./globals.css";
import { PersonaProvider } from "@/components/PersonaProvider";

export const metadata: Metadata = {
  title: {
    default: "달구벌페이",
    template: "%s | 달구벌페이",
  },
  description: "상권·시간대별 동적 보너스 지역화폐 프로토타입",
};

/** Root: fonts + wallet/persona context. The consumer app and the admin tools each add their own top bar and shell. */
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
        <PersonaProvider>{children}</PersonaProvider>
      </body>
    </html>
  );
}
