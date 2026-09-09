import * as React from "react";
import { useSearchParams } from "react-router";
import { History, Play, Square } from "lucide-react";
import { useT, testInfo } from "@/i18n";
import { interpolate } from "@/i18n/core";
import { LLink } from "@/components/layout/LLink";
import { SectionTitle } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import { CheckRow } from "@/components/ui/Toggle";
import { InfoPopover } from "@/components/ui/Overlay";
import { ModelPicker, useModelSelection } from "@/components/performance/ModelPicker";
import { CapSessionView, probeCount } from "@/components/capabilities/CapMatrix";
import { suiteTests } from "@/lib/caps/registry";
import type { CapConfig, CapSession, CapSuiteId, ProbeKind } from "@/lib/caps/types";
import { useRun } from "@/lib/store/run";
import { useResults } from "@/lib/store/results";
import { useLocale } from "@/i18n/core";

function useProbeConfig(storageKey: string, defaults: CapConfig) {
  const [config, setConfig] = React.useState<CapConfig>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...defaults, ...JSON.parse(raw), suites: { ...defaults.suites, ...(JSON.parse(raw).suites ?? {}) } } : defaults;
    } catch {
      return defaults;
    }
  });
  const update = (patch: Partial<CapConfig>) =>
    setConfig((c) => {
      const next = { ...c, ...patch };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return [config, update] as const;
}

export function ProbeHeader({ title, subtitle, intro }: { title: string; subtitle: string; intro?: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <SectionTitle
        title={title}
        subtitle={subtitle}
        right={
          <LLink to="/results">
            <Button variant="ghost" size="sm">
              <History className="h-4 w-4" /> {t.perf.viewAll}
            </Button>
          </LLink>
        }
      />
      {intro ? <p className="-mt-1 mb-5 max-w-3xl text-sm leading-6 text-ink-2">{intro}</p> : null}
    </>
  );
}

export function ProbeWorkbench({ kind, suites, defaults, startLabel, storageKey, selectionKey }: { kind: ProbeKind; suites: CapSuiteId[]; defaults: CapConfig; startLabel: string; storageKey: string; selectionKey: string }) {
  const t = useT();
  const locale = useLocale();
  const sessions = useResults((s) => s.sessions);
  const active = useRun((s) => s.active);
  const start = useRun((s) => s.startCapabilities);
  const [params, setParams] = useSearchParams();
  const [config, update] = useProbeConfig(storageKey, defaults);
  const [selected, setSelected] = useModelSelection(selectionKey, 2);
  const [sessionId, setSessionId] = React.useState<string | null>(params.get("session"));
  const pageLang: "en" | "zh" = locale === "zh" ? "zh" : "en";
  const effectiveLang: "en" | "zh" = config.langAuto === false ? config.lang : pageLang;

  const mine = sessions.filter((s): s is CapSession => s.kind === kind);
  const session = (sessionId ? mine.find((s) => s.id === sessionId) : null) ?? mine[0] ?? null;
  const running = !!active;
  const effectiveSuites = Object.fromEntries(Object.keys(config.suites).map((k) => [k, suites.includes(k as CapSuiteId) ? config.suites[k as CapSuiteId] : false])) as Record<CapSuiteId, boolean>;
  const count = probeCount(effectiveSuites);
  const anySuite = suites.some((s) => effectiveSuites[s]);

  const onStart = () => {
    const id = start({ ...config, lang: effectiveLang, suites: effectiveSuites }, selected, kind);
    if (id) {
      setSessionId(id);
      setParams({ session: id }, { replace: true });
    }
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <ModelPicker selected={selected} onChange={setSelected} disabled={running} />
          <Card>
            <CardHeader className="py-3">
              <CardTitle>{t.caps.suites}</CardTitle>
              <Badge>{interpolate(t.caps.estimate, { requests: count + 2 })}</Badge>
            </CardHeader>
            <CardBody className="space-y-4 px-3">
              {kind === "messages" ? (
                <ul className="space-y-1 px-2 text-sm">
                  {suiteTests("messages").map((x) => {
                    const info = testInfo(t, x.id);
                    return (
                      <li key={x.id} className="flex items-center gap-1.5 py-0.5">
                        <span className="text-ink-2">{info.name}</span>
                        <InfoPopover title={info.name} what={info.desc} why={info.why} labels={{ what: t.common.whatItDoes, why: t.common.why }} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div>
                  {suites.map((s) => (
                    <CheckRow key={s} checked={!!config.suites[s]} onCheckedChange={(v) => update({ suites: { ...config.suites, [s]: v } })} label={t.caps.suiteInfo[s].name} hint={t.caps.suiteInfo[s].desc} disabled={running} right={<Badge className="mt-0.5">{suiteTests(s).length}</Badge>} />
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 px-2">
                <Field label={t.caps.promptLang}>
                  <Select value={effectiveLang} onChange={(e) => update({ lang: e.target.value as "en" | "zh", langAuto: false })} disabled={running}>
                    <option value="en">{t.perf.promptLangs.en}</option>
                    <option value="zh">{t.perf.promptLangs.zh}</option>
                  </Select>
                </Field>
                <Field label={t.caps.concurrency}>
                  <Select value={String(config.concurrency)} onChange={(e) => update({ concurrency: Number(e.target.value) })} disabled={running}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="px-2">
                {running ? (
                  <Button variant="danger" className="w-full" onClick={() => useRun.getState().stop()}>
                    <Square className="h-4 w-4" /> {t.caps.stop}
                  </Button>
                ) : (
                  <Button variant="primary" className="w-full" onClick={onStart} disabled={selected.length === 0 || !anySuite}>
                    <Play className="h-4 w-4" /> {startLabel}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
        <div className="min-w-0">
          {session ? (
            <CapSessionView session={session} />
          ) : (
            <Card>
              <CardBody className="py-16 text-center text-sm text-ink-2">{t.caps.empty}</CardBody>
            </Card>
          )}
          {mine.length > 1 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{t.perf.lastRun}:</span>
              {mine.slice(0, 6).map((s) => (
                <button key={s.id} type="button" onClick={() => setSessionId(s.id)} className={`rounded-md border px-2 py-0.5 ${s.id === session?.id ? "border-ink text-ink" : "border-border hover:bg-surface-2"}`}>
                  {new Date(s.createdAt).toLocaleTimeString()} · {s.models.map((m) => m.label).join(", ").slice(0, 40)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
