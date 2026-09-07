import { useMemo } from "react";
import { en, type Dict } from "./en";
import { zh } from "./zh";
import { interpolate, useLocale, type Locale } from "./core";
import type { Msg } from "@/lib/caps/types";

export const DICTS: Record<Locale, Dict> = { en, zh };

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? zh;
}

/** Returns the dictionary for the current locale. */
export function useT(): Dict {
  const locale = useLocale();
  return getDict(locale);
}

export function formatMsg(dict: Dict, m: Msg): string {
  const template = (dict.messages as Record<string, string>)[m.code] ?? (en.messages as Record<string, string>)[m.code] ?? m.code;
  return interpolate(template, m.params);
}

/** Hook returning a message formatter bound to the current locale. */
export function useMsg() {
  const dict = useT();
  return useMemo(() => (m: Msg) => formatMsg(dict, m), [dict]);
}

export function testInfo(dict: Dict, testId: string): { name: string; desc: string; why: string } {
  return (dict.caps.tests as Record<string, { name: string; desc: string; why: string }>)[testId] ?? { name: testId, desc: "", why: "" };
}

export * from "./core";
export type { Dict };
