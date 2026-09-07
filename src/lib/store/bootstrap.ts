import { create } from "zustand";
import { useSettings, type Theme } from "./settings";
import { useProviders } from "./providers";
import { useResults } from "./results";
import { hydrateSecrets } from "./secrets";

export const useHydration = create<{ ready: boolean }>(() => ({ ready: false }));

let started = false;
export async function bootstrapStores() {
  if (started) return;
  started = true;
  await useSettings.persist.rehydrate();
  await Promise.all([useProviders.persist.rehydrate(), useResults.persist.rehydrate()]);
  await hydrateSecrets(useSettings.getState().persistKeys);
  useHydration.setState({ ready: true });
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
}
