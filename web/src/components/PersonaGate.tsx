"use client";

import { usePersona } from "./PersonaProvider";
import { Button, Card, EmptyState } from "./ui";
import { WalletGlyph } from "./WalletButton";
import type { Role } from "@/lib/personas";

/** Shown when the current account cannot use this page. Offers the wallet (consumer pages) and
 *  one-click switches to a fitting demo persona. */
export function PersonaGate({ roles, title, desc, wallet = false }: { roles: Role[]; title: string; desc: string; wallet?: boolean }) {
  const { personas, select, connectWallet, wallet: w } = usePersona();
  return (
    <Card>
      <EmptyState title={title} desc={desc}>
        {wallet && (
          <Button onClick={() => connectWallet()} loading={w.connecting}>
            <WalletGlyph className="h-4 w-4" />Kaia Wallet 연결
          </Button>
        )}
        {roles.map((r, i) => {
          const p = personas.find((x) => x.role === r);
          if (!p) return null;
          return (
            <Button key={r} variant={!wallet && i === 0 ? "primary" : "secondary"} onClick={() => select(p.id)}>
              데모 {p.label} 선택
            </Button>
          );
        })}
      </EmptyState>
      {wallet && w.error && <p className="mt-2 text-center text-[12px] text-red-600">{w.error}</p>}
    </Card>
  );
}
