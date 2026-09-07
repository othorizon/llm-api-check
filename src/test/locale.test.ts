import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { DEFAULT_LOCALE, LOCALES, htmlLang, localeFromPath, localizePath, redirectLocale, stripLocale, type Locale } from "@/i18n/core";
import { ROUTES } from "@/routes";
import { seoTags } from "@/seo";

describe("locale paths", () => {
  it("serves English at the root and Chinese under /zh", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(localizePath("/", "en")).toBe("/");
    expect(localizePath("/docs", "en")).toBe("/docs");
    expect(localizePath("docs", "en")).toBe("/docs");
    expect(localizePath("/", "zh")).toBe("/zh");
    expect(localizePath("/docs/providers", "zh")).toBe("/zh/docs/providers");
  });
  it("parses the locale prefix", () => {
    expect(localeFromPath("/")).toBe("en");
    expect(localeFromPath("/docs")).toBe("en");
    expect(localeFromPath("/zh")).toBe("zh");
    expect(localeFromPath("/zh/")).toBe("zh");
    expect(localeFromPath("/zh/docs")).toBe("zh");
    expect(localeFromPath("/zhx")).toBe("en");
    // /en is no longer a locale prefix (it 301s to the root at the edge)
    expect(localeFromPath("/en/docs")).toBe("en");
  });
  it("strips the locale prefix", () => {
    expect(stripLocale("/")).toBe("/");
    expect(stripLocale("/docs")).toBe("/docs");
    expect(stripLocale("/zh")).toBe("/");
    expect(stripLocale("/zh/")).toBe("/");
    expect(stripLocale("/zh/docs")).toBe("/docs");
  });
  it("round-trips every route in every locale", () => {
    for (const locale of LOCALES) {
      for (const r of ROUTES) {
        const url = localizePath(r.path, locale);
        expect(localeFromPath(url)).toBe(locale);
        expect(stripLocale(url)).toBe(r.path);
      }
    }
  });
});

describe("seo tags", () => {
  const links = (locale: "en" | "zh", path = "/docs") =>
    seoTags("docs", path, locale)
      .filter((t) => t.tag === "link")
      .map((t) => t.attrs);

  it("self-canonical per locale, hreflang for every locale, x-default = English", () => {
    for (const locale of LOCALES) {
      const l = links(locale);
      const canonical = l.find((a) => a.rel === "canonical")?.href;
      expect(canonical).toBe(`https://llmapicheck.dev${localizePath("/docs", locale)}`);
      const alternates = Object.fromEntries(l.filter((a) => a.rel === "alternate").map((a) => [a.hreflang, a.href]));
      for (const other of LOCALES) expect(alternates[htmlLang[other]]).toBe(`https://llmapicheck.dev${localizePath("/docs", other)}`);
      expect(alternates["x-default"]).toBe("https://llmapicheck.dev/docs");
    }
  });
  it("home x-default is the site root", () => {
    const alternates = links("zh", "/").filter((a) => a.rel === "alternate");
    expect(alternates.find((a) => a.hreflang === "x-default")?.href).toBe("https://llmapicheck.dev/");
    expect(alternates.find((a) => a.hreflang === "zh-CN")?.href).toBe("https://llmapicheck.dev/zh");
  });
  it("sets the html language and og:locale per locale", () => {
    const og = (locale: "en" | "zh") => seoTags("home", "/", locale).find((t) => t.attrs.property === "og:locale")?.attrs.content;
    expect(og("en")).toBe("en_US");
    expect(og("zh")).toBe("zh_CN");
  });
});

describe("locale redirect rule", () => {
  it("remembered choice wins in both directions", () => {
    expect(redirectLocale("en", "zh", "en")).toBe("zh");
    expect(redirectLocale("zh", "en", "zh")).toBe("en");
    expect(redirectLocale("en", "en", "zh")).toBeNull();
    expect(redirectLocale("zh", "zh", "en")).toBeNull();
  });
  it("without a choice, only Chinese-language browsers are redirected (one-way)", () => {
    expect(redirectLocale("en", null, "zh")).toBe("zh");
    expect(redirectLocale("zh", null, "en")).toBeNull();
    expect(redirectLocale("en", null, "en")).toBeNull();
    expect(redirectLocale("zh", null, "zh")).toBeNull();
    expect(redirectLocale("en", null, null)).toBeNull();
  });
});

describe("index.html inline redirect script", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

  /** Runs the inline script against a fake browser and returns the URL it redirected to, if any. */
  function run(pathname: string, stored: Locale | null, language: string, search = "", hash = "") {
    let replaced: string | null = null;
    const settings = stored ? JSON.stringify({ state: { locale: stored, theme: "light" }, version: 0 }) : null;
    const sandbox = {
      location: { pathname, search, hash, replace: (u: string) => void (replaced = u) },
      localStorage: { getItem: (k: string) => (k === "wlcu:settings" ? settings : null) },
      navigator: { language },
      document: { documentElement: { style: {}, classList: { add() {} } } },
      window: { matchMedia: () => ({ matches: false }) },
      setTimeout: () => 0,
    };
    runInNewContext(script, sandbox);
    return replaced as string | null;
  }

  it("agrees with redirectLocale() and localizePath() for every case", () => {
    const languages: Array<[string, Locale]> = [["zh-CN", "zh"], ["zh", "zh"], ["zh-TW", "zh"], ["en-US", "en"], ["fr", "en"], ["", "en"]];
    for (const r of ROUTES) {
      for (const current of LOCALES) {
        for (const stored of [null, ...LOCALES] as Array<Locale | null>) {
          for (const [language, browser] of languages) {
            const url = localizePath(r.path, current);
            const target = redirectLocale(current, stored, browser);
            const expected = target ? localizePath(r.path, target) + "?x=1#top" : null;
            expect(run(url, stored, language, "?x=1", "#top"), `${url} stored=${stored} lang=${language}`).toBe(expected);
          }
        }
      }
    }
  });
  it("never redirects a crawler-like visitor (en-US, no storage)", () => {
    expect(run("/", null, "en-US")).toBeNull();
    expect(run("/zh", null, "en-US")).toBeNull();
    expect(run("/zh/docs", null, "en-US")).toBeNull();
  });
  it("does not loop and never touches unknown prefixes", () => {
    expect(run("/zh", "zh", "zh-CN")).toBeNull();
    expect(run("/zhx", null, "zh-CN")).toBe("/zh/zhx");
  });
});
