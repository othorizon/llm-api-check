import { createContext, useContext } from "react";
import type { Msg } from "@/lib/caps/types";

export type Locale = "zh" | "en";
export const LOCALES: Locale[] = ["zh", "en"];
export const DEFAULT_LOCALE: Locale = "zh";

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Parse the locale prefix from a pathname. `/en/x` → en, otherwise zh. */
export function localeFromPath(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "zh";
}

/** Strip the locale prefix. */
export function stripLocale(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3) || "/";
  return pathname;
}

/** Build a localised href for an unprefixed path. */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === "en") return clean === "/" ? "/en" : `/en${clean}`;
  return clean;
}

export function interpolate(template: string, params?: Msg["params"]): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? "" : String(params[k])));
}

export const htmlLang: Record<Locale, string> = { zh: "zh-CN", en: "en" };
