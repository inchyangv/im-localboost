import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "관리자 도구" };

/** Internal area: merchant tools, city/bank operations and the payments dashboard. Demo accounts live here. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
