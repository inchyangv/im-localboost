import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = { title: { default: "관리자 도구", template: "%s | 달구벌페이 관리자" } };

/** Internal tools: dashboard, merchant desk, city and bank operations. Demo accounts live only here. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminTopBar />
      <Shell footerLinks={[{ href: "/", label: "소비자 앱으로" }]}>{children}</Shell>
    </>
  );
}
