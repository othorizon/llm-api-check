import { getDict } from "@/i18n";
import { htmlLang, localizePath, type Locale } from "@/i18n/core";
import type { SeoKey } from "./routes";

export interface SeoTag {
  tag: "title" | "meta" | "link" | "script";
  attrs: Record<string, string>;
  text?: string;
}

export function siteUrl(): string {
  const v = (import.meta.env?.VITE_SITE_URL as string | undefined) ?? "";
  return v.replace(/\/+$/, "");
}

/** Full set of head tags for a page in a locale. Shared by prerender and the client. */
export function seoTags(seo: SeoKey, path: string, locale: Locale): SeoTag[] {
  const dict = getDict(locale);
  const page = dict.meta.pages[seo];
  const base = siteUrl();
  const localPath = localizePath(path, locale);
  const url = base ? base + localPath : "";
  const title = seo === "home" ? page.title : `${page.title} · ${dict.meta.siteName}`;
  const tags: SeoTag[] = [
    { tag: "title", attrs: {}, text: title },
    { tag: "meta", attrs: { name: "description", content: page.description } },
    { tag: "meta", attrs: { property: "og:title", content: title } },
    { tag: "meta", attrs: { property: "og:description", content: page.description } },
    { tag: "meta", attrs: { property: "og:type", content: "website" } },
    { tag: "meta", attrs: { property: "og:site_name", content: dict.meta.siteName } },
    { tag: "meta", attrs: { property: "og:locale", content: locale === "zh" ? "zh_CN" : "en_US" } },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
    { tag: "meta", attrs: { name: "twitter:title", content: title } },
    { tag: "meta", attrs: { name: "twitter:description", content: page.description } },
  ];
  if (base) {
    tags.push({ tag: "link", attrs: { rel: "canonical", href: url } });
    tags.push({ tag: "meta", attrs: { property: "og:url", content: url } });
    tags.push({ tag: "meta", attrs: { property: "og:image", content: `${base}/og.png` } });
    tags.push({ tag: "meta", attrs: { name: "twitter:image", content: `${base}/og.png` } });
    tags.push({ tag: "link", attrs: { rel: "alternate", hreflang: "zh-CN", href: base + localizePath(path, "zh") } });
    tags.push({ tag: "link", attrs: { rel: "alternate", hreflang: "en", href: base + localizePath(path, "en") } });
    tags.push({ tag: "link", attrs: { rel: "alternate", hreflang: "x-default", href: base + localizePath(path, "zh") } });
  } else {
    tags.push({ tag: "meta", attrs: { property: "og:image", content: "/og.png" } });
    tags.push({ tag: "meta", attrs: { name: "twitter:image", content: "/og.png" } });
  }
  if (seo === "home") {
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: dict.meta.siteName,
      alternateName: dict.meta.shortName,
      description: page.description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any (browser)",
      browserRequirements: "Requires JavaScript",
      inLanguage: htmlLang[locale],
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      ...(url ? { url } : {}),
    };
    const faq = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: dict.home.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    };
    tags.push({ tag: "script", attrs: { type: "application/ld+json" }, text: JSON.stringify(ld) });
    tags.push({ tag: "script", attrs: { type: "application/ld+json" }, text: JSON.stringify(faq) });
  }
  return tags;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function tagsToHtml(tags: SeoTag[]): string {
  return tags
    .map((t) => {
      const attrs = Object.entries(t.attrs)
        .map(([k, v]) => ` ${k}="${esc(v)}"`)
        .join("");
      if (t.tag === "title") return `<title>${esc(t.text ?? "")}</title>`;
      if (t.tag === "script") return `<script${attrs}>${(t.text ?? "").replace(/</g, "\\u003c")}</script>`;
      return `<${t.tag}${attrs}>`;
    })
    .join("\n    ");
}

/** Client-side: reconcile <head> with the tags for the current page. */
export function applySeo(tags: SeoTag[], locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = htmlLang[locale];
  const head = document.head;
  for (const old of head.querySelectorAll("[data-seo]")) old.remove();
  for (const t of tags) {
    if (t.tag === "title") {
      document.title = t.text ?? "";
      continue;
    }
    const el = document.createElement(t.tag);
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    if (t.text) el.textContent = t.text;
    el.setAttribute("data-seo", "");
    head.appendChild(el);
  }
}
