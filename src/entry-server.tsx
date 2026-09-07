import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { App } from "./App";
import { ROUTES } from "./routes";
import { seoTags, tagsToHtml } from "./seo";
import { DEFAULT_LOCALE, LOCALES, localizePath, htmlLang, type Locale } from "./i18n/core";
import "./styles.css";

export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
}

export interface PrerenderPage {
  /** Localised URL, e.g. `/zh/docs`. */
  url: string;
  /** Unprefixed route path, e.g. `/docs`; shared by all locales of the page. */
  path: string;
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
      out.push({ url: localizePath(r.path, locale), path: r.path, head: tagsToHtml(seoTags(r.seo, r.path, locale)), lang: htmlLang[locale], locale, app: !!r.app });
    }
  }
  return out;
}

export { DEFAULT_LOCALE };
export const notFoundLang = htmlLang[DEFAULT_LOCALE];

export function notFoundHead(): string {
  return tagsToHtml(seoTags("notFound", "/404", DEFAULT_LOCALE));
}
