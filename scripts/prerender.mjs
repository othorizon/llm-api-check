// Prerenders every route (both locales) into static HTML, writes 404.html,
// robots.txt, sitemap.xml, _redirects and _headers. Runs after `vite build` and `vite build --ssr`.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const ssrDir = join(root, "dist-ssr");
const template = readFileSync(join(dist, "index.html"), "utf8");
const siteUrl = (process.env.VITE_SITE_URL || process.env.CF_PAGES_URL || "https://llmapicheck.dev").replace(/\/+$/, "");

const entryFile = join(ssrDir, "entry-server.js");
if (!existsSync(entryFile)) {
  console.error("SSR bundle not found at", entryFile);
  process.exit(1);
}
const { render, pages, notFoundHead, notFoundLang, DEFAULT_LOCALE } = await import(pathToFileURL(entryFile).href);

function fill(head, html, lang) {
  return template
    .replace("<!--app-head-->", head)
    .replace("<!--app-html-->", html)
    .replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
}

function outPath(url) {
  if (url === "/") return join(dist, "index.html");
  return join(dist, url.replace(/^\//, "") + ".html");
}

const all = pages();
let count = 0;
for (const page of all) {
  const html = render(page.url);
  const file = outPath(page.url);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, fill(page.head, html, page.lang));
  count++;
}
// 404 page in the default locale; the router shows the localised page on the client.
writeFileSync(join(dist, "404.html"), fill(notFoundHead(), render("/__not_found__"), notFoundLang));

// robots + sitemap
const robots = ["User-agent: *", "Allow: /", siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml` : "", ""].filter((l, i, a) => !(l === "" && i === a.length - 2)).join("\n");
writeFileSync(join(dist, "robots.txt"), robots);
if (siteUrl) {
  const now = new Date().toISOString().slice(0, 10);
  // Group the locale variants of each route by its unprefixed path.
  const byPath = new Map();
  for (const p of all) {
    if (!byPath.has(p.path)) byPath.set(p.path, {});
    byPath.get(p.path)[p.locale] = p;
  }
  const urls = [];
  for (const [path, locs] of byPath) {
    for (const page of Object.values(locs)) {
      const alts = Object.values(locs)
        .map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${siteUrl}${alt.url}"/>`)
        .join("\n");
      // x-default: the default locale (English), for searchers whose language matches no hreflang.
      const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}${locs[DEFAULT_LOCALE].url}"/>`;
      const home = path === "/";
      const priority = home ? (page.locale === DEFAULT_LOCALE ? "1.0" : "0.9") : "0.7";
      urls.push(`  <url>\n    <loc>${siteUrl}${page.url}</loc>\n    <lastmod>${now}</lastmod>\n${alts}\n${xDefault}\n    <changefreq>${home ? "weekly" : "monthly"}</changefreq>\n    <priority>${priority}</priority>\n  </url>`);
    }
  }
  writeFileSync(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`);
} else {
  console.warn("VITE_SITE_URL not set: skipping sitemap.xml and canonical URLs. Set it in your Cloudflare build environment.");
}

// Redirects (Cloudflare Workers static assets / Pages `_redirects`).
// English used to live under /en; it is now the default locale at the site root.
const redirects = `# English moved from /en to the site root (Chinese is under /zh).
/en / 301
/en/* /:splat 301
`;
writeFileSync(join(dist, "_redirects"), redirects);

// Security headers. The inline theme script gets a CSP hash so no 'unsafe-inline' is needed.
const inline = template.match(/<script>([\s\S]*?)<\/script>/);
const hash = inline ? `'sha256-${createHash("sha256").update(inline[1]).digest("base64")}'` : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' ${hash}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src *",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const headers = `/*
  Content-Security-Policy: ${csp}
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
writeFileSync(join(dist, "_headers"), headers);
rmSync(ssrDir, { recursive: true, force: true });
console.log(`Prerendered ${count} pages + 404.html${siteUrl ? " + sitemap.xml" : ""} + _redirects (site: ${siteUrl || "unset"})`);
