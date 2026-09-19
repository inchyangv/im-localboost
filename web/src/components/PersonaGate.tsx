"use client";

import { useState } from "react";
import { usePersona } from "./PersonaProvider";
import { Button, Card, EmptyState } from "./ui";
import { WalletGlyph, WalletPicker } from "./WalletButton";
import { chainId, chainLabel } from "@/lib/config";
import type { Role } from "@/lib/personas";

/** Shown when the current account cannot use this page. Offers the wallet picker (consumer pages) and
 *  one-click switches to a fitting demo persona. */
export function PersonaGate({ roles, title, desc, wallet = false }: { roles: Role[]; title: string; desc: string; wallet?: boolean }) {
  const { personas, select, wallet: w } = usePersona();
  const [picker, setPicker] = useState(false);
  return (
    <Card className="reveal">
      <EmptyState icon={wallet ? "wallet" : roles[0] === "bank" ? "bank" : roles[0] === "merchant" ? "store" : "shield"} title={title} desc={desc}>
        {wallet && (
          <Button onClick={() => setPicker(true)} loading={w.connecting}>
            <WalletGlyph className="h-4 w-4" />
            지갑 연결
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
      {wallet && (
        <p className="-mt-4 pb-6 text-center text-[12px] text-gray-400 sm:pb-10">
          {chainLabel(chainId)}에서 동작해요. 다른 네트워크에 있으면 연결 후 전환을 안내해요.
        </p>
      )}
      {wallet && w.error && !picker && <p className="mt-2 text-center text-[12px] text-red-600">{w.error}</p>}
      {picker && <WalletPicker onClose={() => setPicker(false)} />}
    </Card>
  );
}
