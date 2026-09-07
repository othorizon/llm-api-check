import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { Languages, ShieldCheck } from "lucide-react";
import { getDict, useT } from "@/i18n";
import { browserLocale, htmlLang, localeFromPath, localizePath, stripLocale, useLocale, type Locale } from "@/i18n/core";
import { ROUTES } from "@/routes";
import { applySeo, seoTags } from "@/seo";
import { useSettings } from "@/lib/store/settings";
import { applyTheme, bootstrapStores, useHydration } from "@/lib/store/bootstrap";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { LLink } from "./LLink";
import { Button } from "@/components/ui/Button";

/** Runs once on the client: hydrate stores, apply theme, keep SEO tags in sync. */
function Bootstrap() {
  const location = useLocation();
  const navigate = useNavigate();
  React.useEffect(() => {
    void bootstrapStores().then(() => {
      applyTheme(useSettings.getState().theme);
      // A language the visitor chose earlier (toggle or LanguageBanner) wins over the URL.
      // First visits are never redirected: crawlers carry no stored preference, so every locale
      // stays indexable at its own URL. The LanguageBanner offers a switch instead.
      const preferred = useSettings.getState().locale;
      const current = localeFromPath(window.location.pathname);
      if (preferred && preferred !== current) navigate(localizePath(stripLocale(window.location.pathname), preferred) + window.location.search + window.location.hash, { replace: true });
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(useSettings.getState().theme);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  React.useEffect(() => {
    const locale = localeFromPath(location.pathname);
    const path = stripLocale(location.pathname);
    const route = ROUTES.find((r) => r.path === path);
    applySeo(seoTags(route?.seo ?? "notFound", path, locale), locale);
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);
  return null;
}

/**
 * First visit only: when the browser language differs from the page language, offer to switch.
 * Rendered after hydration, so prerendered HTML and crawlers never see it. Either choice is remembered.
 */
function LanguageBanner() {
  const locale = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const ready = useHydration((s) => s.ready);
  const stored = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);
  const [browser, setBrowser] = React.useState<Locale | null>(null);
  React.useEffect(() => setBrowser(browserLocale()), []);
  if (!ready || stored != null || !browser || browser === locale) return null;
  const copy = getDict(browser).banner.language;
  const accept = () => {
    setLocale(browser);
    navigate(localizePath(stripLocale(location.pathname), browser) + location.search + location.hash, { replace: true });
  };
  const dismiss = () => setLocale(locale);
  return (
    <div className="border-b border-border bg-surface-2" lang={htmlLang[browser]}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <Languages className="h-4 w-4 shrink-0 text-ink-2" aria-hidden />
        <p className="flex-1 text-ink-2">{copy.body}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={accept}>
            {copy.action}
          </Button>
          <Button size="sm" onClick={dismiss}>
            {copy.dismiss}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PrivacyBanner() {
  const t = useT();
  const ready = useHydration((s) => s.ready);
  const ack = useSettings((s) => s.privacyAck);
  const setAck = useSettings((s) => s.setPrivacyAck);
  if (!ready || ack) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:px-6">
        <ShieldCheck className="hidden h-5 w-5 shrink-0 text-good sm:block" />
        <p className="flex-1 text-ink-2">{t.banner.privacy}</p>
        <div className="flex items-center gap-2">
          <LLink to="/privacy" className="text-sm text-accent-ink underline underline-offset-2">
            {t.banner.details}
          </LLink>
          <Button size="sm" variant="primary" onClick={() => setAck(true)}>
            {t.banner.ok}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Bootstrap />
      <Header />
      <LanguageBanner />
      <main className="flex-1">{children}</main>
      <Footer />
      <PrivacyBanner />
    </div>
  );
}

export function Page({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 ${className}`}>{children}</div>;
}

/** Renders children only after the stores are hydrated; a skeleton before (and on the server). */
export function ClientOnly({ children, skeleton }: { children: React.ReactNode; skeleton?: React.ReactNode }) {
  const ready = useHydration((s) => s.ready);
  if (!ready) return <>{skeleton ?? <Skeleton />}</>;
  return <>{children}</>;
}

export function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded-md bg-surface-2" />
      <div className="h-32 animate-pulse rounded-card bg-surface-2" />
      <div className="h-64 animate-pulse rounded-card bg-surface-2" />
    </div>
  );
}
