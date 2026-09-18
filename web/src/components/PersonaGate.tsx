"use client";

import { usePersona } from "./PersonaProvider";
import { Button, Card, EmptyState } from "./ui";
import type { Role } from "@/lib/personas";

/** Shown when the current persona cannot use this page. Offers one-click switches to a fitting persona. */
export function PersonaGate({ roles, title, desc }: { roles: Role[]; title: string; desc: string }) {
  const { personas, select } = usePersona();
  return (
    <Card>
      <EmptyState title={title} desc={desc}>
        {roles.map((r, i) => {
          const p = personas.find((x) => x.role === r);
          if (!p) return null;
          return (
            <Button key={r} variant={i === 0 ? "primary" : "secondary"} onClick={() => select(p.id)}>
              {p.label} 선택
            </Button>
          );
        })}
      </EmptyState>
    </Card>
  );
}
