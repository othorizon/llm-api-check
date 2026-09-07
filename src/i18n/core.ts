import { createContext, useContext } from "react";
import type { Msg } from "@/lib/caps/types";

export type Locale = "zh" | "en";
/** Locales in prerender / route order. The default locale is served at the site root. */
export const LOCALES: Locale[] = ["en", "zh"];
export const DEFAULT_LOCALE: Locale = "en";

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** URL prefix of a locale: "" for the default locale (root), "/zh" for the others. */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/** Parse the locale prefix from a pathname. `/zh/x` → zh, otherwise the default locale. */
export function localeFromPath(pathname: string): Locale {
  for (const locale of LOCALES) {
    const prefix = localePrefix(locale);
    if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) return locale;
  }
  return DEFAULT_LOCALE;
}

/** Strip the locale prefix. */
export function stripLocale(pathname: string): string {
  const prefix = localePrefix(localeFromPath(pathname));
  if (!prefix) return pathname;
  return pathname.slice(prefix.length) || "/";
}

/** Build a localised href for an unprefixed path. */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const prefix = localePrefix(locale);
  if (!prefix) return clean;
  return clean === "/" ? prefix : `${prefix}${clean}`;
}

/**
 * Locale a visitor should be sent to before the page renders, or null to stay put.
 * A remembered choice always wins. Without one, browsers whose language is a non-default
 * locale are sent to that locale; the reverse never happens automatically (an English-language
 * browser on a Chinese URL is only offered a switch by the banner), so crawlers, which render
 * as en-US with no storage, never see a redirect. Mirrored by the inline script in index.html.
 */
export function redirectLocale(current: Locale, stored: Locale | null, browser: Locale | null): Locale | null {
  const target = stored ?? (browser && browser !== DEFAULT_LOCALE ? browser : null);
  return target && target !== current ? target : null;
}

/** Locale matching the browser language, or null when unknown (e.g. on the server). */
export function browserLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  const lang = (navigator.language || "").toLowerCase();
  if (!lang) return null;
  return LOCALES.find((l) => lang === l || lang.startsWith(`${l}-`)) ?? DEFAULT_LOCALE;
}

export function interpolate(template: string, params?: Msg["params"]): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? "" : String(params[k])));
}

export const htmlLang: Record<Locale, string> = { zh: "zh-CN", en: "en" };
