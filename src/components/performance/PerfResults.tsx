import * as React from "react";
import { useMsg, useT } from "@/i18n";
import { interpolate } from "@/i18n/core";
import type { ModeStats, PerfModelResult, PerfSession, RunSample, ScenarioId, Stats } from "@/lib/perf/types";
import { SCENARIOS } from "@/lib/perf/scoring";
import { fmtInt, fmtMs, fmtNum, fmtPct } from "@/lib/utils/format";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { GradeBadge, StatusPill } from "@/components/ui/StatusPill";
import { SeriesDot, Tabs } from "@/components/ui/Misc";
import { Popover, Tip } from "@/components/ui/Overlay";
import { Badge } from "@/components/ui/Badge";
import { StripPlot, BarChart } from "@/components/charts/StripPlot";
import { cn } from "@/lib/utils/cn";

function Th({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <th className={cn("whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted", className)} title={title}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("tnum whitespace-nowrap px-3 py-2 align-middle text-sm", className)}>{children}</td>;
}

function StatCell({ s, kind, estimated }: { s: Stats | null | undefined; kind: "ms" | "tps"; estimated?: boolean }) {
  const t = useT();
  if (!s) return <span className="text-muted">—</span>;
  const f = kind === "ms" ? (v: number) => fmtMs(v) : (v: number) => fmtNum(v, 1);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-medium">
        {estimated ? "≈" : ""}
        {f(s.p50)}
      </span>
      {s.n > 1 ? (
        <span className="text-xs text-muted" title={`${t.perf.metrics.p95} ${f(s.p95)} · ${t.perf.metrics.min} ${f(s.min)} · ${t.perf.metrics.max} ${f(s.max)}`}>
          p95 {f(s.p95)}
        </span>
      ) : null}
    </span>
  );
}

export function PerfSummaryTable({ session }: { session: PerfSession }) {
  const t = useT();
  const m = t.perf.metrics;
  const anyStream = session.config.modes.stream;
  const anyNon = session.config.modes.nonStream;
  const anyCache = session.config.modes.cache;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <Th>{t.common.model}</Th>
            {anyStream ? (
              <>
                <Th title={m.ttfcLong}>{m.ttfc}</Th>
                <Th title={m.ttftLong}>{m.ttft}</Th>
                <Th title={m.decodeTpsLong}>{m.decodeTps}</Th>
              </>
            ) : null}
            {anyNon ? (
              <>
                <Th title={m.totalLong}>{m.latency}</Th>
                <Th title={m.e2eTpsLong}>{m.e2eTps}</Th>
              </>
            ) : null}
            {anyCache ? <Th>{m.cache}</Th> : null}
            <Th>{m.success}</Th>
            <Th>{t.perf.scenarios.voice.name}</Th>
          </tr>
        </thead>
        <tbody>
          {session.models.map((snap, i) => {
            const r = session.results[snap.id];
            const okAll = r ? r.samples.filter((s) => !s.warmup) : [];
            const success = okAll.length ? okAll.filter((s) => s.ok).length / okAll.length : null;
            const voice = r?.scores.find((s) => s.id === "voice");
            return (
              <tr key={snap.id} className="border-b border-border last:border-0">
                <Td>
                  <div className="flex items-center gap-2">
                    <SeriesDot index={i} />
                    <div>
                      <div className="font-medium">{snap.label}</div>
                      <div className="text-xs text-muted">{snap.providerName}</div>
                    </div>
                  </div>
                </Td>
                {anyStream ? (
                  <>
                    <Td>
                      <StatCell s={r?.stream?.ttfc} kind="ms" />
                    </Td>
                    <Td>
                      <StatCell s={r?.stream?.ttft} kind="ms" />
                    </Td>
                    <Td>
                      <StatCell s={r?.stream?.decodeTps} kind="tps" estimated={r?.stream?.estimated} />
                    </Td>
                  </>
                ) : null}
                {anyNon ? (
                  <>
                    <Td>
                      <StatCell s={r?.nonStream?.total} kind="ms" />
                    </Td>
                    <Td>
                      <StatCell s={r?.nonStream?.e2eTps} kind="tps" estimated={r?.nonStream?.estimated} />
                    </Td>
                  </>
                ) : null}
                {anyCache ? (
                  <Td>
                    <CacheCell r={r} />
                  </Td>
                ) : null}
                <Td>{success == null ? <span className="text-muted">—</span> : <span className={success < 1 ? "text-critical-ink" : ""}>{fmtPct(success)}</span>}</Td>
                <Td>{voice ? <ScoreCell result={r} scenario="voice" /> : "—"}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CacheCell({ r }: { r: PerfModelResult | undefined }) {
  const t = useT();
  const c = r?.cache;
  if (!c || c.warm.ok === 0) return <span className="text-muted">—</span>;
  if (c.reported && c.cachedTokensWarm != null && c.cachedTokensWarm > 0) {
    return (
      <span className="inline-flex flex-col leading-tight">
        <span className="font-medium text-good-ink">{fmtPct(c.hitRatio)}</span>
        {c.ttftImprovement != null ? <span className="text-xs text-muted">TTFT {c.ttftImprovement >= 0 ? "−" : "+"}{fmtPct(Math.abs(c.ttftImprovement))}</span> : null}
      </span>
    );
  }
  if (!c.reported && c.ttftImprovement != null && c.ttftImprovement > 0.3) return <span className="text-warning-ink">{interpolate(t.perf.cacheVerdict.fasterOnly, { pct: Math.round(c.ttftImprovement * 100) })}</span>;
  return <span className="text-muted">{c.reported ? t.perf.cacheVerdict.none : t.perf.cacheVerdict.unreported}</span>;
}

function ScoreCell({ result, scenario }: { result: PerfModelResult | undefined; scenario: ScenarioId }) {
  const t = useT();
  const fm = useMsg();
  const s = result?.scores.find((x) => x.id === scenario);
  if (!s) return <span className="text-muted">—</span>;
  return (
    <Popover
      trigger={
        <button type="button" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" aria-label={`${t.perf.scenarios[scenario].name}: ${s.grade ?? "-"}`}>
          <GradeBadge grade={s.grade} score={s.score} />
        </button>
      }
    >
      <div className="mb-1 font-semibold">{t.perf.scenarios[scenario].name}</div>
      <p className="mb-3 text-xs leading-5 text-muted">{t.perf.scenarios[scenario].desc}</p>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.perf.reasons}</div>
      <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2">
        {s.reasons.map((r, i) => (
          <li key={i}>{fm(r)}</li>
        ))}
      </ul>
    </Popover>
  );
}

export function ScenarioMatrix({ session }: { session: PerfSession }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <Th>{t.perf.scenarioTitle}</Th>
            {session.models.map((snap, i) => (
              <Th key={snap.id}>
                <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                  <SeriesDot index={i} />
                  {snap.label}
                </span>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCENARIOS.map((sc) => (
            <tr key={sc} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5 align-middle">
                <div className="text-sm font-medium">{t.perf.scenarios[sc].name}</div>
                <div className="max-w-xs text-xs leading-5 text-muted">{t.perf.scenarios[sc].desc}</div>
              </td>
              {session.models.map((snap) => (
                <td key={snap.id} className="px-3 py-2.5 align-middle">
                  <ScoreCell result={session.results[snap.id]} scenario={sc} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerfCharts({ session }: { session: PerfSession }) {
  const t = useT();
  const ttfcRows = session.models.map((snap, i) => {
    const r = session.results[snap.id];
    const samples = (r?.samples ?? []).filter((s) => s.mode === "stream" && !s.warmup && s.ok && s.ttfcMs != null);
    return { label: snap.label, index: i, values: samples.map((s) => ({ v: s.ttfcMs!, title: `${snap.label} · #${s.index + 1}: ${fmtMs(s.ttfcMs)}` })), median: r?.stream?.ttfc?.p50 ?? null };
  });
  const tpsRows = session.models.map((snap, i) => {
    const r = session.results[snap.id];
    const v = r?.stream?.decodeTps?.p50 ?? r?.nonStream?.e2eTps?.p50 ?? null;
    return { label: snap.label, index: i, value: v, title: `${snap.label}: ${fmtNum(v, 1)} tok/s` };
  });
  const hasTtfc = ttfcRows.some((r) => r.values.length);
  const hasTps = tpsRows.some((r) => r.value != null);
  if (!hasTtfc && !hasTps) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasTtfc ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t.perf.chartTtft}</CardTitle>
              <CardDescription>{t.perf.chartHint}</CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            <StripPlot rows={ttfcRows} format={(v) => fmtMs(v)} ariaLabel={t.perf.chartTtft} />
          </CardBody>
        </Card>
      ) : null}
      {hasTps ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.perf.chartTps}</CardTitle>
          </CardHeader>
          <CardBody>
            <BarChart rows={tpsRows} format={(v) => fmtNum(v, 0)} ariaLabel={t.perf.chartTps} />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

export function RunLog({ session }: { session: PerfSession }) {
  const t = useT();
  const [filter, setFilter] = React.useState<string>("all");
  const rows: { snapIndex: number; label: string; s: RunSample }[] = [];
  session.models.forEach((snap, i) => (session.results[snap.id]?.samples ?? []).forEach((s) => rows.push({ snapIndex: i, label: snap.label, s })));
  rows.sort((a, b) => a.s.startedAt - b.s.startedAt);
  const shown = rows.filter((r) => filter === "all" || r.s.mode === filter || (filter === "cache" && r.s.mode.startsWith("cache")));
  const c = t.perf.columns;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t.perf.runLog}</CardTitle>
          <CardDescription>{t.perf.runLogHint}</CardDescription>
        </div>
        <Tabs
          value={filter}
          onValueChange={setFilter}
          items={[
            { value: "all", label: t.common.all },
            ...(session.config.modes.stream ? [{ value: "stream", label: t.perf.modeLabels.stream }] : []),
            ...(session.config.modes.nonStream ? [{ value: "non_stream", label: t.perf.modeLabels.non_stream }] : []),
            ...(session.config.modes.cache ? [{ value: "cache", label: t.perf.metrics.cache }] : []),
          ]}
        />
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th>{c.run}</Th>
              <Th>{t.common.model}</Th>
              <Th>{c.mode}</Th>
              <Th>{c.ttft}</Th>
              <Th>{c.ttfc}</Th>
              <Th>{c.total}</Th>
              <Th>{c.tokens}</Th>
              <Th>{c.decode}</Th>
              <Th>{c.e2e}</Th>
              <Th>{c.cached}</Th>
              <Th>{c.finish}</Th>
              <Th>{c.status}</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ snapIndex, label, s }) => (
              <tr key={s.id} className={cn("border-b border-border last:border-0", s.warmup && "opacity-60")}>
                <Td className="text-muted">{s.warmup ? "warm-up" : s.index + 1}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <SeriesDot index={snapIndex} />
                    {label}
                  </span>
                </Td>
                <Td>
                  <Badge>{t.perf.modeLabels[s.mode]}</Badge>
                </Td>
                <Td>{fmtMs(s.ttftMs)}</Td>
                <Td>{fmtMs(s.ttfcMs)}</Td>
                <Td>{s.ok ? fmtMs(s.totalMs) : "—"}</Td>
                <Td>
                  {s.tokensEstimated ? "≈" : ""}
                  {fmtInt(s.completionTokens)}
                  {s.reasoningTokens ? <span className="text-xs text-muted"> (+{fmtInt(s.reasoningTokens)} r)</span> : null}
                </Td>
                <Td>{fmtNum(s.decodeTps, 1)}</Td>
                <Td>{fmtNum(s.e2eTps, 1)}</Td>
                <Td>{s.cachedTokens != null ? fmtInt(s.cachedTokens) : "—"}</Td>
                <Td className="text-xs text-muted">{s.finishReason ?? "—"}</Td>
                <Td>
                  {s.ok ? (
                    <StatusPill status="pass" label="OK" compact />
                  ) : (
                    <Tip content={s.error?.message ?? "error"}>
                      <span>
                        <StatusPill status="error" label={`${s.error?.kind ?? "error"}${s.error?.status ? ` ${s.error.status}` : ""}`} compact />
                      </span>
                    </Tip>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function EstimatedNote({ session }: { session: PerfSession }) {
  const t = useT();
  const est = Object.values(session.results).some((r) => r.stream?.estimated || r.nonStream?.estimated);
  if (!est) return null;
  return <p className="text-xs text-muted">{t.perf.metrics.estimatedNote}</p>;
}

export function modeStatsOk(s: ModeStats | null | undefined) {
  return !!s && s.ok > 0;
}
