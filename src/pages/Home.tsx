import { ArrowRight, Gauge, Brain, Wrench, Eye, ShieldCheck, Sparkles, Database, MessagesSquare } from "lucide-react";
import { useT } from "@/i18n";
import { Page } from "@/components/layout/AppShell";
import { LLink } from "@/components/layout/LLink";
import { Button } from "@/components/ui/Button";
import { PROVIDER_PRESETS } from "@/lib/providers/presets";
import { useLocale } from "@/i18n/core";

const featureIcons = [Gauge, Sparkles, Brain, Wrench, Eye, MessagesSquare];

export function HomePage() {
  const t = useT();
  const locale = useLocale();
  const providers = PROVIDER_PRESETS.filter((p) => p.region !== "custom" && p.region !== "local");
  return (
    <>
      <section className="border-b border-border bg-surface">
        <Page className="py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
              <ShieldCheck className="h-3.5 w-3.5 text-good" />
              {t.home.heroKicker}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t.home.heroTitle}</h1>
            <p className="mt-5 text-lg leading-8 text-ink-2">{t.home.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LLink to="/models">
                <Button variant="primary" size="lg">
                  {t.home.ctaStart} <ArrowRight className="h-4 w-4" />
                </Button>
              </LLink>
              <LLink to="/docs">
                <Button variant="outline" size="lg">
                  {t.home.ctaDocs}
                </Button>
              </LLink>
            </div>
          </div>
          <div className="mt-14">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t.home.providersTitle}</div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {providers.map((p) => (
                <li key={p.id} className="rounded-md border border-border bg-bg px-2.5 py-1 text-sm text-ink-2">
                  {locale === "zh" && p.nameZh ? p.nameZh : p.name}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">{t.home.providersMore}</p>
          </div>
        </Page>
      </section>

      <Page className="py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.home.features.map((f, i) => {
            const Icon = featureIcons[i] ?? Database;
            return (
              <div key={f.title} className="rounded-card border border-border bg-surface p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold">{f.title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-ink-2">{f.body}</p>
              </div>
            );
          })}
        </div>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold tracking-tight">{t.home.howTitle}</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {t.home.how.map((s, i) => (
              <li key={s.title} className="relative rounded-card border border-border bg-surface p-5 pt-6">
                <span className="mono absolute -top-3 left-5 rounded-md bg-ink px-2 py-0.5 text-xs font-semibold text-bg">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20 rounded-card border border-border bg-surface p-6 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 text-good-ink">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-semibold">{t.home.privacyTitle}</span>
              </div>
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-2">{t.home.privacyBody}</p>
            </div>
            <LLink to="/privacy">
              <Button variant="outline">{t.home.privacyCta}</Button>
            </LLink>
          </div>
        </section>

        <section className="mt-20 max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight">{t.home.faqTitle}</h2>
          <div className="mt-6 divide-y divide-border rounded-card border border-border bg-surface">
            {t.home.faq.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-6 text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </Page>
    </>
  );
}
