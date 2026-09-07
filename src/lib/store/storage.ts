import type { StateStorage } from "zustand/middleware";

/** Storage that never throws (private mode, SSR, disabled storage). */
export function safeStorage(kind: "local" | "session"): StateStorage {
  const get = (): Storage | null => {
    try {
      if (typeof window === "undefined") return null;
      return kind === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    getItem: (name) => {
      try {
        return get()?.getItem(name) ?? null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        get()?.setItem(name, value);
      } catch {
        /* quota / disabled */
      }
    },
    removeItem: (name) => {
      try {
        get()?.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

export const STORAGE_KEYS = {
  providers: "wlcu:providers",
  secrets: "wlcu:secrets",
  settings: "wlcu:settings",
  results: "wlcu:results",
} as const;

/** Estimate bytes used by this app in localStorage (for the privacy page). */
export function storageUsage(): { bytes: number; keys: string[] } {
  try {
    if (typeof window === "undefined") return { bytes: 0, keys: [] };
    let bytes = 0;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.startsWith("wlcu:")) continue;
      keys.push(k);
      bytes += (localStorage.getItem(k)?.length ?? 0) * 2;
    }
    return { bytes, keys };
  } catch {
    return { bytes: 0, keys: [] };
  }
}

export function clearAllAppData() {
  try {
    for (const k of Object.values(STORAGE_KEYS)) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
