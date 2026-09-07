import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { STORAGE_KEYS, safeStorage } from "./storage";
import type { ModelConfig, ProviderConfig } from "./types";
import { getPreset } from "@/lib/providers/presets";
import { uid } from "@/lib/utils/id";

interface ProvidersState {
  providers: ProviderConfig[];
  models: ModelConfig[];
  addProvider: (p: Omit<ProviderConfig, "id" | "createdAt"> & { id?: string }) => ProviderConfig;
  updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
  removeProvider: (id: string) => void;
  addModel: (m: Omit<ModelConfig, "id" | "createdAt"> & { id?: string }) => ModelConfig;
  updateModel: (id: string, patch: Partial<ModelConfig>) => void;
  removeModel: (id: string) => void;
  duplicateModel: (id: string) => void;
  importAll: (data: { providers: ProviderConfig[]; models: ModelConfig[] }, mode: "merge" | "replace") => void;
  reset: () => void;
}

export const useProviders = create<ProvidersState>()(
  persist(
    (set, get) => ({
      providers: [],
      models: [],
      addProvider: (p) => {
        const provider: ProviderConfig = { ...p, id: p.id ?? uid("prov"), createdAt: Date.now(), extraHeaders: p.extraHeaders ?? {} };
        set((s) => ({ providers: [...s.providers, provider] }));
        return provider;
      },
      updateProvider: (id, patch) => set((s) => ({ providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removeProvider: (id) => set((s) => ({ providers: s.providers.filter((p) => p.id !== id), models: s.models.filter((m) => m.providerId !== id) })),
      addModel: (m) => {
        const model: ModelConfig = { ...m, id: m.id ?? uid("model"), createdAt: Date.now(), extraBody: m.extraBody ?? {} };
        set((s) => ({ models: [...s.models, model] }));
        return model;
      },
      updateModel: (id, patch) => set((s) => ({ models: s.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      removeModel: (id) => set((s) => ({ models: s.models.filter((m) => m.id !== id) })),
      duplicateModel: (id) => {
        const src = get().models.find((m) => m.id === id);
        if (!src) return;
        set((s) => ({ models: [...s.models, { ...src, id: uid("model"), label: `${src.label || src.model} (copy)`, createdAt: Date.now() }] }));
      },
      importAll: (data, mode) =>
        set((s) => {
          const providers = Array.isArray(data.providers) ? data.providers : [];
          const models = Array.isArray(data.models) ? data.models : [];
          if (mode === "replace") return { providers, models };
          const pids = new Set(s.providers.map((p) => p.id));
          const mids = new Set(s.models.map((m) => m.id));
          return { providers: [...s.providers, ...providers.filter((p) => !pids.has(p.id))], models: [...s.models, ...models.filter((m) => !mids.has(m.id))] };
        }),
      reset: () => set({ providers: [], models: [] }),
    }),
    { name: STORAGE_KEYS.providers, storage: createJSONStorage(() => safeStorage("local")), skipHydration: true, version: 1 },
  ),
);

export function providerLabel(p: ProviderConfig | undefined): string {
  if (!p) return "?";
  return p.name || getPreset(p.presetId).name;
}

export function findModel(id: string): { model: ModelConfig; provider: ProviderConfig | undefined } | null {
  const s = useProviders.getState();
  const model = s.models.find((m) => m.id === id);
  if (!model) return null;
  return { model, provider: s.providers.find((p) => p.id === model.providerId) };
}
