import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { STORAGE_KEYS, safeStorage } from "./storage";
import type { PerfSession } from "@/lib/perf/types";
import type { CapSession } from "@/lib/caps/types";

export type Session = PerfSession | CapSession;

const MAX_SESSIONS = 40;

interface ResultsState {
  sessions: Session[];
  upsert: (s: Session) => void;
  patch: (id: string, fn: (s: Session) => Session) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useResults = create<ResultsState>()(
  persist(
    (set) => ({
      sessions: [],
      upsert: (s) =>
        set((st) => {
          const idx = st.sessions.findIndex((x) => x.id === s.id);
          const next = idx === -1 ? [s, ...st.sessions] : st.sessions.map((x) => (x.id === s.id ? s : x));
          return { sessions: next.slice(0, MAX_SESSIONS) };
        }),
      patch: (id, fn) => set((st) => ({ sessions: st.sessions.map((x) => (x.id === id ? fn(x) : x)) })),
      remove: (id) => set((st) => ({ sessions: st.sessions.filter((x) => x.id !== id) })),
      clear: () => set({ sessions: [] }),
    }),
    { name: STORAGE_KEYS.results, storage: createJSONStorage(() => safeStorage("local")), skipHydration: true, version: 1 },
  ),
);
