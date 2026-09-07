import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { App } from "./App";
import { ROUTES } from "./routes";
import { seoTags, tagsToHtml } from "./seo";
import { LOCALES, localizePath, htmlLang, type Locale } from "./i18n/core";
import "./styles.css";

export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
}

export interface PrerenderPage {
  url: string;
  head: string;
  lang: string;
  locale: Locale;
  app: boolean;
}

/** All pages to prerender, in both locales. */
export function pages(): PrerenderPage[] {
  const out: PrerenderPage[] = [];
  for (const locale of LOCALES) {
    for (const r of ROUTES) {
      out.push({ url: localizePath(r.path, locale), head: tagsToHtml(seoTags(r.seo, r.path, locale)), lang: htmlLang[locale], locale, app: !!r.app });
    }
  }
  return out;
}

export function notFoundHead(): string {
  return tagsToHtml(seoTags("notFound", "/404", "zh"));
}
