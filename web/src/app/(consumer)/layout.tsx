import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { BottomTabs, TopBar } from "@/components/TopBar";

/** Consumer app: pays with the user's own wallet. No demo accounts here. */
export default function ConsumerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar />
      <Shell footerLinks={[{ href: "/admin", label: "관리자 도구" }]} bottomTabs>
        {children}
      </Shell>
      <BottomTabs />
    </>
  );
}
