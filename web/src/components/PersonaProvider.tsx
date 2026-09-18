"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { personas, type Persona } from "@/lib/personas";

const STORAGE_KEY = "dalgubeolpay.persona";

interface PersonaContextValue {
  persona: Persona | null;
  personas: Persona[];
  select: (id: string) => void;
}

const PersonaContext = createContext<PersonaContextValue>({ persona: null, personas, select: () => {} });

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string>(personas[0]?.id ?? "");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && personas.some((p) => p.id === saved)) setId(saved);
    } catch {
      // localStorage may be unavailable; keep the default persona.
    }
  }, []);

  const value = useMemo<PersonaContextValue>(
    () => ({
      persona: personas.find((p) => p.id === id) ?? null,
      personas,
      select: (next: string) => {
        setId(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore
        }
      },
    }),
    [id],
  );

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  return useContext(PersonaContext);
}
