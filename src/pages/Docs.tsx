import * as React from "react";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/core";
import { Page } from "@/components/layout/AppShell";
import { LNavLink } from "@/components/layout/LLink";
import { SectionTitle } from "@/components/ui/Misc";
import { MethodologyContent } from "@/content/docs-methodology";
import { CapabilitiesDocsContent } from "@/content/docs-capabilities";
import { ProvidersDocsContent } from "@/content/docs-providers";
import { cn } from "@/lib/utils/cn";

function DocsLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const t = useT();
  const nav = [
    { to: "/docs", label: t.docs.methodology },
    { to: "/docs/capabilities", label: t.docs.capabilities },
    { to: "/docs/providers", label: t.docs.providers },
  ];
  return (
    <Page>
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.docs.title}</div>
          <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
            {nav.map((n) => (
              <LNavLink key={n.to} to={n.to} end className={({ isActive }) => cn("whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink", isActive && "bg-surface-2 font-medium text-ink")}>
                {n.label}
              </LNavLink>
            ))}
          </nav>
        </aside>
        <article className="min-w-0 max-w-3xl">
          <SectionTitle title={title} subtitle={subtitle} />
          {children}
        </article>
      </div>
    </Page>
  );
}

export function DocsPage() {
  const t = useT();
  const locale = useLocale();
  return (
    <DocsLayout title={t.meta.pages.docs.title} subtitle={t.meta.pages.docs.description}>
      <MethodologyContent locale={locale} />
    </DocsLayout>
  );
}
export function DocsCapabilitiesPage() {
  const t = useT();
  const locale = useLocale();
  return (
    <DocsLayout title={t.meta.pages.docsCapabilities.title} subtitle={t.meta.pages.docsCapabilities.description}>
      <CapabilitiesDocsContent locale={locale} />
    </DocsLayout>
  );
}
export function DocsProvidersPage() {
  const t = useT();
  const locale = useLocale();
  return (
    <DocsLayout title={t.meta.pages.docsProviders.title} subtitle={t.meta.pages.docsProviders.description}>
      <ProvidersDocsContent locale={locale} />
    </DocsLayout>
  );
}
