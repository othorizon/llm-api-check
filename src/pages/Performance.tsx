import * as React from "react";
import { useSearchParams } from "react-router";
import { Play, Square, History, AlertTriangle, RotateCcw } from "lucide-react";
import { useT } from "@/i18n";
import { interpolate, useLocale } from "@/i18n/core";
import { ClientOnly, Page } from "@/components/layout/AppShell";
import { LLink } from "@/components/layout/LLink";
import { SectionTitle, Progress, SeriesDot } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Misc";
import { estimateTokens } from "@/lib/llm/tokens";
import { APPROX_INPUT_TOKENS } from "@/lib/perf/prompts";
import { CheckRow } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { ModelPicker, useModelSelection } from "@/components/performance/ModelPicker";
import { PerfSummaryTable, ScenarioMatrix, PerfCharts, RunLog, EstimatedNote, CacheComparisonList, ConditionBadge } from "@/components/performance/PerfResults";
import { SessionActions } from "@/components/results/SessionActions";
import { DEFAULT_PERF_CONFIG, PERF_CONFIG_VERSION, type CacheMode, type PerfConfig, type PerfSession, type PromptSource } from "@/lib/perf/types";
import { requestsPerModel } from "@/lib/perf/runner";
import { REASONING_DIALECTS } from "@/lib/caps/reasoning-dialects";
import type { CapSession } from "@/lib/caps/types";
import { useRun } from "@/lib/store/run";
import { useResults } from "@/lib/store/results";
import { useProviders } from "@/lib/store/providers";
import { fmtDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const CONFIG_KEY = "wlcu:perf-config";
const MODELS_KEY = "wlcu:perf-models";

function useLocalConfig() {
  const [config, setConfig] = React.useState<PerfConfig>(() => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return DEFAULT_PERF_CONFIG;
      const parsed = JSON.parse(raw);
      if (parsed.version !== PERF_CONFIG_VERSION) return DEFAULT_PERF_CONFIG;
      return { ...DEFAULT_PERF_CONFIG, ...parsed.config, modes: { ...DEFAULT_PERF_CONFIG.modes, ...(parsed.config?.modes ?? {}) } };
    } catch {
      return DEFAULT_PERF_CONFIG;
    }
  });
  const update = (patch: Partial<PerfConfig>) =>
    setConfig((c) => {
      const next = { ...c, ...patch };
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify({ version: PERF_CONFIG_VERSION, config: next }));
      } catch {
        /* ignore */
      }
      return next;
    });
  const reset = () => {
    try {
      localStorage.removeItem(CONFIG_KEY);
    } catch {
      /* ignore */
    }
    setConfig(DEFAULT_PERF_CONFIG);
  };
  return [config, update, reset] as const;
}

function RadioCard({ checked, onSelect, name, label, desc, disabled }: { checked: boolean; onSelect: () => void; name: string; label: string; desc: string; disabled?: boolean }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors", checked ? "border-ink bg-surface-2" : "border-border hover:bg-surface-2", disabled && "cursor-not-allowed opacity-60")}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onSelect} disabled={disabled} className="mt-1 h-3.5 w-3.5 accent-[var(--ink)]" />
      <span>
        <span className="block text-sm font-medium leading-5">{label}</span>
        <span className="block text-xs leading-5 text-muted">{desc}</span>
      </span>
    </label>
  );
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
            {progress?.currentCache && session.config.cacheMode === "compare" ? <ConditionBadge condition={progress.currentCache} /> : null}
            {progress?.currentIndex != null && progress.currentIndex >= 0 ? <span className="text-muted">#{progress.currentIndex + 1}</span> : progress?.phase === "warmup" ? <span className="text-muted">{t.perf.warmupRow}</span> : null}
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

function dialectLabel(id: string | null | undefined, none: string) {
  if (!id) return none;
  return REASONING_DIALECTS.find((d) => d.id === id)?.label ?? id;
}

function ReasoningDroppedNote({ session }: { session: PerfSession }) {
  const t = useT();
  const rows = session.models
    .map((snap) => ({ snap, n: (session.results[snap.id]?.samples ?? []).filter((s) => s.reasoningParamDropped).length }))
    .filter((x) => x.n > 0);
  if (!rows.length) return null;
  return (
    <ul className="space-y-0.5 text-xs text-warning-ink">
      {rows.map(({ snap, n }) => (
        <li key={snap.id}>{interpolate(t.perf.reasoningDropped, { model: snap.label, dialect: dialectLabel(session.config.disableReasoning, t.perf.reasoningOffNone), n })}</li>
      ))}
    </ul>
  );
}

/** What the capability test found out about switching reasoning off, per selected model. */
function KnownDialects({ modelIds }: { modelIds: string[] }) {
  const t = useT();
  const sessions = useResults((s) => s.sessions);
  const models = useProviders((s) => s.models);
  const rows: { label: string; dialects: string[] }[] = [];
  for (const id of modelIds) {
    const model = models.find((m) => m.id === id);
    if (!model) continue;
    const session = sessions.find((x): x is CapSession => x.kind === "capability" && !!x.results[id]?.outcomes["reasoning.toggle"]);
    const outcome = session?.results[id]?.outcomes["reasoning.toggle"];
    if (!outcome) continue;
    const facts = outcome.evidence.facts ?? {};
    if (facts.reasonsByDefault === false) rows.push({ label: model.label || model.model, dialects: [] });
    else if (outcome.suggestions?.length) rows.push({ label: model.label || model.model, dialects: outcome.suggestions.map((x) => x.label) });
  }
  if (!rows.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs leading-5 text-muted">
      {rows.map((r) => (
        <li key={r.label}>{r.dialects.length ? interpolate(t.perf.reasoningKnown, { model: r.label, dialects: r.dialects.join("; ") }) : interpolate(t.perf.reasoningNotNeeded, { model: r.label })}</li>
      ))}
    </ul>
  );
}

export function PerfSessionView({ session, showActions = true }: { session: PerfSession; showActions?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const running = session.status === "running";
  const cfg = session.config;
  return (
    <div className="space-y-4">
      {running ? <LivePanel session={session} /> : null}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t.perf.summary}</CardTitle>
            <CardDescription>
              {fmtDate(session.createdAt, locale === "zh" ? "zh-CN" : "en")} · {t.perf.cacheModes[cfg.cacheMode].name} · {cfg.promptSource === "custom" ? `${t.perf.promptCustom} (≈ ${estimateTokens(cfg.customPrompt)} ${t.common.tokens})` : `${t.perf.promptSizes[cfg.promptSize]} · ${t.perf.promptLangs[cfg.promptLang]}`} · {cfg.runs} {t.common.runs} · max {cfg.maxTokens} {t.common.tokens} · {t.perf.reasoningOff}: <span className="mono">{dialectLabel(cfg.disableReasoning, t.perf.reasoningOffNone)}</span>
              {session.status === "aborted" ? ` · ${t.common.aborted}` : ""}
            </CardDescription>
          </div>
          {showActions ? <SessionActions session={session} /> : null}
        </CardHeader>
        <PerfSummaryTable session={session} />
        {cfg.cacheMode === "compare" ? (
          <CardBody className="border-t border-border">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.perf.compare.title}</div>
            <CacheComparisonList session={session} />
          </CardBody>
        ) : null}
        <CardBody className="border-t border-border space-y-1 py-2">
          <EstimatedNote session={session} />
          <ReasoningDroppedNote session={session} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t.perf.scenarioTitle}</CardTitle>
            <CardDescription>
              {t.perf.scenarioHint}
              {cfg.cacheMode === "compare" ? ` ${interpolate(t.perf.scoreBasis, { condition: t.perf.conditionShort.miss })}` : ""}
            </CardDescription>
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
  const sessions = useResults((s) => s.sessions);
  const active = useRun((s) => s.active);
  const start = useRun((s) => s.startPerformance);
  const [params, setParams] = useSearchParams();
  const [config, update, reset] = useLocalConfig();
  const locale = useLocale();
  const pageLang: PerfConfig["promptLang"] = locale === "zh" ? "zh" : "en";
  const effective: PerfConfig = { ...config, promptLang: config.promptLangAuto ? pageLang : config.promptLang };
  const [selected, setSelected] = useModelSelection(MODELS_KEY, 3);
  const [sessionId, setSessionId] = React.useState<string | null>(params.get("session"));

  const perfSessions = sessions.filter((s): s is PerfSession => s.kind === "performance");
  const session = (sessionId ? perfSessions.find((s) => s.id === sessionId) : null) ?? perfSessions[0] ?? null;
  const running = !!active;
  const perModel = requestsPerModel(config);
  const anyMode = config.modes.stream || config.modes.nonStream;
  const hitInvolved = config.cacheMode !== "miss";
  const customTokens = estimateTokens(config.customPrompt);
  const promptTokens = config.promptSource === "custom" ? customTokens : APPROX_INPUT_TOKENS[config.promptSize];
  const promptMissing = config.promptSource === "custom" && config.customPrompt.trim().length === 0;
  const cacheTooShort = hitInvolved && promptTokens < 1024;

  const onStart = () => {
    const id = start(effective, selected);
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
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <ModelPicker selected={selected} onChange={setSelected} disabled={running} />
        <Card>
          <CardHeader className="py-3">
            <CardTitle>{t.perf.config}</CardTitle>
            <div className="flex items-center gap-1">
              <Badge>{interpolate(t.perf.estimate, { requests: perModel })}</Badge>
              <Button size="sm" variant="ghost" onClick={reset} disabled={running} className="h-7 px-2 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> {t.common.reset}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <div className="mb-1.5 text-[13px] font-medium">{t.perf.modes}</div>
              <div className="-mx-2">
                <CheckRow checked={config.modes.stream} onCheckedChange={(v) => update({ modes: { ...config.modes, stream: v } })} label={t.perf.modeStream} hint={t.perf.modeStreamHint} disabled={running} />
                <CheckRow checked={config.modes.nonStream} onCheckedChange={(v) => update({ modes: { ...config.modes, nonStream: v } })} label={t.perf.modeNonStream} hint={t.perf.modeNonStreamHint} disabled={running} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-medium">{t.perf.cacheMode}</div>
              <div className="space-y-2">
                {(["miss", "hit", "compare"] as CacheMode[]).map((m) => (
                  <RadioCard key={m} name="cacheMode" checked={config.cacheMode === m} onSelect={() => update({ cacheMode: m })} label={t.perf.cacheModes[m].name} desc={t.perf.cacheModes[m].desc} disabled={running} />
                ))}
              </div>
            </div>
            <Field label={t.perf.reasoningOff} hint={t.perf.reasoningOffHint}>
              <Select value={config.disableReasoning ?? ""} onChange={(e) => update({ disableReasoning: e.target.value || null })} disabled={running} className="mono text-xs">
                {REASONING_DIALECTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
                <option value="">{t.perf.reasoningOffNone}</option>
              </Select>
              <KnownDialects modelIds={selected} />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium">{t.perf.prompt}</span>
                <Tabs
                  value={config.promptSource}
                  onValueChange={(v) => !running && update({ promptSource: v as PromptSource })}
                  items={[
                    { value: "generated", label: t.perf.promptGenerated },
                    { value: "custom", label: t.perf.promptCustom },
                  ]}
                />
              </div>
              {config.promptSource === "custom" ? (
                <Field label={<span className="sr-only">{t.perf.promptCustom}</span>} hint={t.perf.promptCustomHint} error={promptMissing ? t.perf.promptEmpty : undefined}>
                  <Textarea value={config.customPrompt} onChange={(e) => update({ customPrompt: e.target.value })} placeholder={t.perf.promptCustomPlaceholder} rows={6} disabled={running} spellCheck={false} className="text-xs leading-5" />
                  <div className="tnum mt-1 text-right text-xs text-muted" aria-live="polite">
                    {interpolate(t.perf.promptStats, { tokens: customTokens.toLocaleString(), chars: config.customPrompt.length.toLocaleString() })}
                  </div>
                </Field>
              ) : (
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
                    <Select value={effective.promptLang} onChange={(e) => update({ promptLang: e.target.value as PerfConfig["promptLang"], promptLangAuto: false })} disabled={running}>
                      <option value="en">{t.perf.promptLangs.en}</option>
                      <option value="zh">{t.perf.promptLangs.zh}</option>
                    </Select>
                  </Field>
                </div>
              )}
              {cacheTooShort ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-warning-ink">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {interpolate(t.perf.cacheSizeHint, { tokens: promptTokens })}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.perf.runs} hint={t.perf.runsHint}>
                <Input type="number" min={1} max={30} value={config.runs} onChange={(e) => update({ runs: num(e.target.value, 1, 30, 3) })} disabled={running} />
              </Field>
              <Field label={t.perf.maxTokens}>
                <Input type="number" min={16} max={4096} value={config.maxTokens} onChange={(e) => update({ maxTokens: num(e.target.value, 16, 4096, 256) })} disabled={running} />
              </Field>
            </div>
            <details className="group">
              <summary className="cursor-pointer select-none text-xs font-medium text-accent-ink">{t.perf.advanced}</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label={t.perf.interval}>
                  <Input type="number" min={0} max={60000} value={config.intervalMs} onChange={(e) => update({ intervalMs: num(e.target.value, 0, 60000, 500) })} disabled={running} />
                </Field>
                {hitInvolved ? (
                  <Field label={t.perf.cacheDelay} hint={t.perf.cacheDelayHint}>
                    <Input type="number" min={0} max={120000} value={config.cacheWarmDelayMs} onChange={(e) => update({ cacheWarmDelayMs: num(e.target.value, 0, 120000, 3000) })} disabled={running} />
                  </Field>
                ) : null}
              </div>
            </details>
            {running ? (
              <Button variant="danger" className="w-full" onClick={() => useRun.getState().stop()}>
                <Square className="h-4 w-4" /> {t.perf.stop}
              </Button>
            ) : (
              <Button variant="primary" className="w-full" onClick={onStart} disabled={selected.length === 0 || !anyMode || promptMissing}>
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
  );
}

export function PerformancePage() {
  const t = useT();
  return (
    <Page>
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
      <ClientOnly>
        <PerfWorkbench />
      </ClientOnly>
    </Page>
  );
}
