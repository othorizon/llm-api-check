import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { STORAGE_KEYS, safeStorage } from "./storage";

export type Theme = "system" | "light" | "dark";

interface SettingsState {
  theme: Theme;
  /** Remember API keys across browser sessions (localStorage) or only for the tab (sessionStorage). */
  persistKeys: boolean;
  /** Whether the user dismissed the privacy banner. */
  privacyAck: boolean;
  /** Preferred locale chosen explicitly by the user. */
  locale: "zh" | "en" | null;
  setTheme: (t: Theme) => void;
  setPersistKeys: (v: boolean) => void;
  setPrivacyAck: (v: boolean) => void;
  setLocale: (l: "zh" | "en" | null) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      persistKeys: true,
      privacyAck: false,
      locale: null,
      setTheme: (theme) => set({ theme }),
      setPersistKeys: (persistKeys) => set({ persistKeys }),
      setPrivacyAck: (privacyAck) => set({ privacyAck }),
      setLocale: (locale) => set({ locale }),
    }),
    { name: STORAGE_KEYS.settings, storage: createJSONStorage(() => safeStorage("local")), skipHydration: true },
  ),
);
