import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, htmlLang, localeFromPath, localizePath, stripLocale } from "@/i18n/core";
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
