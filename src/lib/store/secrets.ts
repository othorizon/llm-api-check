import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { STORAGE_KEYS, safeStorage } from "./storage";

/**
 * API keys live in their own store so they can be excluded from exports and
 * kept in sessionStorage (tab-only) when the user prefers not to persist them.
 */
interface SecretsState {
  keys: Record<string, string>; // providerId -> apiKey
  setKey: (providerId: string, key: string) => void;
  removeKey: (providerId: string) => void;
  clear: () => void;
}

let currentKind: "local" | "session" = "local";

const dynamicStorage = {
  getItem: (name: string) => safeStorage(currentKind).getItem(name),
  setItem: (name: string, value: string) => safeStorage(currentKind).setItem(name, value),
  removeItem: (name: string) => safeStorage(currentKind).removeItem(name),
};

export const useSecrets = create<SecretsState>()(
  persist(
    (set) => ({
      keys: {},
      setKey: (providerId, key) => set((s) => ({ keys: { ...s.keys, [providerId]: key } })),
      removeKey: (providerId) =>
        set((s) => {
          const next = { ...s.keys };
          delete next[providerId];
          return { keys: next };
        }),
      clear: () => set({ keys: {} }),
    }),
    { name: STORAGE_KEYS.secrets, storage: createJSONStorage(() => dynamicStorage), skipHydration: true },
  ),
);

/** Switch where keys are persisted. Moves existing keys to the new storage. */
export function setSecretsStorageKind(kind: "local" | "session") {
  if (kind === currentKind) return;
  const previous = currentKind;
  currentKind = kind;
  const keys = useSecrets.getState().keys;
  safeStorage(previous).removeItem(STORAGE_KEYS.secrets);
  useSecrets.setState({ keys: { ...keys } }); // triggers persist into the new storage
}

export function getSecretsStorageKind() {
  return currentKind;
}

/** Rehydrate secrets from whichever storage currently holds them. */
export async function hydrateSecrets(persistKeys: boolean) {
  // Prefer the storage matching the user's preference, but recover keys left in the other one.
  currentKind = persistKeys ? "local" : "session";
  await useSecrets.persist.rehydrate();
  if (Object.keys(useSecrets.getState().keys).length === 0) {
    const other = persistKeys ? "session" : "local";
    const raw = safeStorage(other).getItem(STORAGE_KEYS.secrets);
    if (raw) {
      try {
        const parsed = JSON.parse(raw as string);
        const keys = parsed?.state?.keys;
        if (keys && typeof keys === "object") {
          useSecrets.setState({ keys });
          safeStorage(other).removeItem(STORAGE_KEYS.secrets);
        }
      } catch {
        /* ignore */
      }
    }
  }
}
