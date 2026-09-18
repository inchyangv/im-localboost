"use client";

import { usePersona } from "./PersonaProvider";
import { short } from "@/lib/format";

export function PersonaSwitcher() {
  const { persona, personas, select } = usePersona();
  if (personas.length === 0) {
    return <span className="text-sm text-red-600">페르소나 키가 설정되지 않았습니다 (NEXT_PUBLIC_*_KEY)</span>;
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">페르소나</span>
      <select
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
        value={persona?.id ?? ""}
        onChange={(e) => select(e.target.value)}
        aria-label="페르소나 선택"
      >
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {persona && (
        <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs" title={persona.account.address}>
          {short(persona.account.address, 6)}
        </code>
      )}
    </label>
  );
}
