import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { Languages, Menu, Moon, Sun, X, Monitor } from "lucide-react";
import { useT } from "@/i18n";
import { localizePath, stripLocale, useLocale } from "@/i18n/core";
import { REPO_URL } from "@/routes";
import { cn } from "@/lib/utils/cn";
import { useSettings, type Theme } from "@/lib/store/settings";
import { applyTheme } from "@/lib/store/bootstrap";
import { LLink, LNavLink } from "./LLink";
import { Tip } from "@/components/ui/Overlay";

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-6 w-6", className)} aria-hidden>
      <rect x="2" y="2" width="28" height="28" rx="7" fill="currentColor" />
      <path d="M9 21.5 12.2 10h2.4l2.1 7.4L18.8 10h2.4l3.2 11.5h-2.5l-2-7.6-2.2 7.6h-2.2l-2.2-7.6-2 7.6z" fill="var(--bg)" />
    </svg>
  );
}

const themeCycle: Theme[] = ["system", "light", "dark"];

export function Header() {
  const t = useT();
  const locale = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const setLocale = useSettings((s) => s.setLocale);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [location.pathname]);

  const nav = [
    { to: "/models", label: t.nav.models },
    { to: "/performance", label: t.nav.performance },
    { to: "/capabilities", label: t.nav.capabilities },
    { to: "/messages", label: t.nav.messages },
    { to: "/results", label: t.nav.results },
    { to: "/docs", label: t.nav.docs },
    { to: "/privacy", label: t.nav.privacy },
  ];
  const other = locale === "zh" ? "en" : "zh";
  const switchLocale = () => {
    setLocale(other);
    navigate(localizePath(stripLocale(location.pathname), other) + location.search + location.hash);
  };
  const cycleTheme = () => {
    const next = themeCycle[(themeCycle.indexOf(theme) + 1) % themeCycle.length];
    setTheme(next);
    applyTheme(next);
  };
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? t.nav.dark : theme === "light" ? t.nav.light : t.nav.system;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <LLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span className="hidden sm:inline">{t.meta.siteName}</span>
          <span className="sm:hidden">{t.meta.shortName}</span>
        </LLink>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {nav.map((n) => (
            <LNavLink key={n.to} to={n.to} className={({ isActive }) => cn("rounded-md px-2.5 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink", isActive && "bg-surface-2 text-ink font-medium")}>
              {n.label}
            </LNavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Tip content={t.nav.language}>
            <button type="button" onClick={switchLocale} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={t.nav.language}>
              <Languages className="h-4 w-4" />
              <span className="text-xs font-medium">{locale === "zh" ? "EN" : "中文"}</span>
            </button>
          </Tip>
          <Tip content={`${t.nav.theme}: ${themeLabel}`}>
            <button type="button" onClick={cycleTheme} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={`${t.nav.theme}: ${themeLabel}`}>
              <ThemeIcon className="h-4 w-4" />
            </button>
          </Tip>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="hidden h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex" aria-label={t.nav.github}>
            <GithubMark className="h-4 w-4" />
          </a>
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 md:hidden" aria-label={t.nav.menu} aria-expanded={open}>
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="border-t border-border bg-surface px-4 py-2 md:hidden" aria-label="Mobile">
          {nav.map((n) => (
            <LNavLink key={n.to} to={n.to} className={({ isActive }) => cn("block rounded-md px-3 py-2 text-sm text-ink-2 hover:bg-surface-2", isActive && "bg-surface-2 text-ink font-medium")}>
              {n.label}
            </LNavLink>
          ))}
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="block rounded-md px-3 py-2 text-sm text-ink-2 hover:bg-surface-2">
            {t.nav.github}
          </a>
        </nav>
      ) : null}
    </header>
  );
}
