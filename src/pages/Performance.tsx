import * as React from "react";
import { useSearchParams } from "react-router";
import { Play, Square, History } from "lucide-react";
import { useT } from "@/i18n";
import { interpolate } from "@/i18n/core";
import { ClientOnly, Page } from "@/components/layout/AppShell";
import { LLink } from "@/components/layout/LLink";
import { SectionTitle, Progress, SeriesDot } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { CheckRow } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { ModelPicker } from "@/components/performance/ModelPicker";
import { PerfSummaryTable, ScenarioMatrix, PerfCharts, RunLog, EstimatedNote } from "@/components/performance/PerfResults";
import { SessionActions } from "@/components/results/SessionActions";
import { DEFAULT_PERF_CONFIG, type PerfConfig, type PerfSession } from "@/lib/perf/types";
import { buildJobs } from "@/lib/perf/runner";
import { useRun } from "@/lib/store/run";
import { useResults } from "@/lib/store/results";
import { useProviders } from "@/lib/store/providers";
import { fmtMs, fmtDate } from "@/lib/utils/format";
import { useLocale } from "@/i18n/core";

function useLocalConfig() {
  const [config, setConfig] = React.useState<PerfConfig>(() => {
    try {
      const raw = localStorage.getItem("wlcu:perf-config");
      return raw ? { ...DEFAULT_PERF_CONFIG, ...JSON.parse(raw) } : DEFAULT_PERF_CONFIG;
    } catch {
      return DEFAULT_PERF_CONFIG;
    }
  });
  const update = (patch: Partial<PerfConfig>) =>
    setConfig((c) => {
      const next = { ...c, ...patch };
      try {
        localStorage.setItem("wlcu:perf-config", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return [config, update] as const;
}

function LivePanel({ session }: { session: PerfSession }) {
  const t = useT();
  const progress = useRun((s) => s.perfProgress);
  const live = useRun((s) => s.perfLive);
  const stop = useRun((s) => s.stop);
  const pct = progress && progress.total ? progress.done / progress.total : 0;
  const current = progress?.currentModelId ? session.models.find((m) => m.id === progress.currentModelId) : null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-accent pulse-soft" /> {t.perf.running}
          </CardTitle>
          <CardDescription>
            {progress ? `${t.perf.phase[progress.phase]} · ${interpolate(t.perf.progress, { done: progress.done, total: progress.total })}` : t.common.loading}
            {progress?.waitingMs ? ` · ${interpolate(t.perf.waiting, { ms: progress.waitingMs })}` : ""}
          </CardDescription>
        </div>
        <Button variant="danger" size="sm" onClick={stop}>
          <Square className="h-3.5 w-3.5" /> {t.perf.stop}
        </Button>
      </CardHeader>
      <CardBody className="space-y-3">
        <Progress value={pct} />
        {current ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <SeriesDot index={session.models.findIndex((m) => m.id === current.id)} />
            <span className="font-medium">{current.label}</span>
            {progress?.currentMode ? <Badge>{t.perf.modeLabels[progress.currentMode]}</Badge> : null}
            {progress?.currentIndex != null && progress.currentIndex >= 0 ? <span className="text-muted">#{progress.currentIndex + 1}</span> : null}
            {live ? <span className="tnum text-muted">{interpolate(t.perf.liveTokens, { n: live.approxTokens, ms: Math.round(live.elapsedMs) })}</span> : null}
          </div>
        ) : null}
        {live && (live.preview || live.reasoningPreview) ? (
          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs leading-5 text-ink-2">
            {live.reasoningPreview && !live.preview ? <span className="italic text-muted">{t.perf.reasoningPreview} </span> : null}
            <span className="whitespace-pre-wrap break-words">{live.preview || live.reasoningPreview}</span>
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-ink align-middle" />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function PerfSessionView({ session, showActions = true }: { session: PerfSession; showActions?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const running = session.status === "running";
  return (
    <div className="space-y-4">
      {running ? <LivePanel session={session} /> : null}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t.perf.summary}</CardTitle>
            <CardDescription>
              {fmtDate(session.createdAt, locale === "zh" ? "zh-CN" : "en")} · {t.perf.promptSizes[session.config.promptSize]} · {t.perf.promptLangs[session.config.promptLang]} · {session.config.runs} {t.common.runs} · max {session.config.maxTokens} {t.common.tokens}
              {session.status === "aborted" ? ` · ${t.common.aborted}` : ""}
            </CardDescription>
          </div>
          {showActions ? <SessionActions session={session} /> : null}
        </CardHeader>
        <PerfSummaryTable session={session} />
        <CardBody className="border-t border-border py-2">
          <EstimatedNote session={session} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t.perf.scenarioTitle}</CardTitle>
            <CardDescription>{t.perf.scenarioHint}</CardDescription>
          </div>
        </CardHeader>
        <ScenarioMatrix session={session} />
      </Card>
      <PerfCharts session={session} />
      <RunLog session={session} />
    </div>
  );
}

function PerfWorkbench() {
  const t = useT();
  const models = useProviders((s) => s.models);
  const sessions = useResults((s) => s.sessions);
  const active = useRun((s) => s.active);
  const start = useRun((s) => s.startPerformance);
  const [params, setParams] = useSearchParams();
  const [config, update] = useLocalConfig();
  const [selected, setSelected] = React.useState<string[]>(() => models.map((m) => m.id).slice(0, 3));
  const [sessionId, setSessionId] = React.useState<string | null>(params.get("session"));
  React.useEffect(() => setSelected((s) => s.filter((id) => models.some((m) => m.id === id))), [models]);

  const perfSessions = sessions.filter((s): s is PerfSession => s.kind === "performance");
  const session = (sessionId ? perfSessions.find((s) => s.id === sessionId) : null) ?? perfSessions[0] ?? null;
  const running = !!active;
  const jobsPerModel = buildJobs(config, [{ model: { id: "x" } } as any]).length;

  const onStart = async () => {
    const id = await start(config, selected);
    if (id) {
      setSessionId(id);
      setParams({ session: id }, { replace: true });
    }
  };
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  return (
    <>
      <SectionTitle
        title={t.perf.title}
        subtitle={t.perf.subtitle}
        right={
          <LLink to="/results">
            <Button variant="ghost" size="sm">
              <History className="h-4 w-4" /> {t.perf.viewAll}
            </Button>
          </LLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <ModelPicker selected={selected} onChange={setSelected} disabled={running} />
          <Card>
            <CardHeader className="py-3">
              <CardTitle>{t.perf.config}</CardTitle>
              <Badge>{interpolate(t.perf.estimate, { requests: jobsPerModel })}</Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.perf.runs}>
                  <Input type="number" min={1} max={30} value={config.runs} onChange={(e) => update({ runs: num(e.target.value, 1, 30, 3) })} disabled={running} />
                </Field>
                <Field label={t.perf.maxTokens}>
                  <Input type="number" min={16} max={4096} value={config.maxTokens} onChange={(e) => update({ maxTokens: num(e.target.value, 16, 4096, 256) })} disabled={running} />
                </Field>
              </div>
              <div>
                <div className="mb-1 text-[13px] font-medium">{t.perf.modes}</div>
                <div className="-mx-2">
                  <CheckRow checked={config.modes.stream} onCheckedChange={(v) => update({ modes: { ...config.modes, stream: v } })} label={t.perf.modeStream} hint={t.perf.modeStreamHint} disabled={running} />
                  <CheckRow checked={config.modes.nonStream} onCheckedChange={(v) => update({ modes: { ...config.modes, nonStream: v } })} label={t.perf.modeNonStream} hint={t.perf.modeNonStreamHint} disabled={running} />
                  <CheckRow checked={config.modes.cache} onCheckedChange={(v) => update({ modes: { ...config.modes, cache: v } })} label={t.perf.modeCache} hint={t.perf.modeCacheHint} disabled={running} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.perf.promptSize}>
                  <Select value={config.promptSize} onChange={(e) => update({ promptSize: e.target.value as PerfConfig["promptSize"] })} disabled={running}>
                    {(["short", "medium", "long"] as const).map((s) => (
                      <option key={s} value={s}>
                        {t.perf.promptSizes[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t.perf.promptLang}>
                  <Select value={config.promptLang} onChange={(e) => update({ promptLang: e.target.value as PerfConfig["promptLang"] })} disabled={running}>
                    <option value="en">{t.perf.promptLangs.en}</option>
                    <option value="zh">{t.perf.promptLangs.zh}</option>
                  </Select>
                </Field>
              </div>
              <details className="group">
                <summary className="cursor-pointer select-none text-xs font-medium text-accent-ink">{t.perf.advanced}</summary>
                <div className="mt-3 space-y-3">
                  <div className="-mx-2">
                    <CheckRow checked={config.warmup} onCheckedChange={(v) => update({ warmup: v })} label={t.perf.warmup} disabled={running} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t.perf.interval}>
                      <Input type="number" min={0} max={60000} value={config.intervalMs} onChange={(e) => update({ intervalMs: num(e.target.value, 0, 60000, 500) })} disabled={running} />
                    </Field>
                    <Field label={t.perf.cacheDelay}>
                      <Input type="number" min={0} max={120000} value={config.cacheWarmDelayMs} onChange={(e) => update({ cacheWarmDelayMs: num(e.target.value, 0, 120000, 3000) })} disabled={running} />
                    </Field>
                    <Field label={t.perf.cacheRepeats}>
                      <Input type="number" min={1} max={10} value={config.cacheRepeats} onChange={(e) => update({ cacheRepeats: num(e.target.value, 1, 10, 2) })} disabled={running} />
                    </Field>
                    <Field label={t.perf.cachePrefix}>
                      <Input type="number" min={256} max={20000} value={config.cachePrefixTokens} onChange={(e) => update({ cachePrefixTokens: num(e.target.value, 256, 20000, 2500) })} disabled={running} />
                    </Field>
                  </div>
                </div>
              </details>
              {running ? (
                <Button variant="danger" className="w-full" onClick={() => useRun.getState().stop()}>
                  <Square className="h-4 w-4" /> {t.perf.stop}
                </Button>
              ) : (
                <Button variant="primary" className="w-full" onClick={onStart} disabled={selected.length === 0 || !(config.modes.stream || config.modes.nonStream || config.modes.cache)}>
                  <Play className="h-4 w-4" /> {t.perf.start}
                </Button>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="min-w-0">
          {session ? (
            <PerfSessionView session={session} />
          ) : (
            <Card>
              <CardBody className="py-16 text-center text-sm text-ink-2">{t.perf.empty}</CardBody>
            </Card>
          )}
          {perfSessions.length > 1 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{t.perf.lastRun}:</span>
              {perfSessions.slice(0, 6).map((s) => (
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

export function PerformancePage() {
  return (
    <Page>
      <ClientOnly>
        <PerfWorkbench />
      </ClientOnly>
    </Page>
  );
}
void fmtMs;
