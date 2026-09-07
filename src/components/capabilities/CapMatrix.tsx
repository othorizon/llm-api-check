import * as React from "react";
import { useMsg, useT, testInfo } from "@/i18n";
import { useLocale } from "@/i18n/core";
import type { CapOutcome, CapSession, CapSuiteId } from "@/lib/caps/types";
import { REASONING_DIALECTS } from "@/lib/caps/reasoning-dialects";
import { ALL_TESTS, SUITE_ORDER, testsForSuites } from "@/lib/caps/registry";
import { useRun } from "@/lib/store/run";
import { useProviders } from "@/lib/store/providers";
import { cn } from "@/lib/utils/cn";
import { safeJson, fmtDate } from "@/lib/utils/format";
import { StatusPill } from "@/components/ui/StatusPill";
import { InfoPopover, Drawer } from "@/components/ui/Overlay";
import { CodeBlock, Kv, SeriesDot } from "@/components/ui/Misc";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SessionActions } from "@/components/results/SessionActions";

/** Groups for the message-format suite (display only). */
const MESSAGE_GROUPS: Record<string, string[]> = {
  system: ["messages.multi_system_start", "messages.system_mid"],
  turns: ["messages.consecutive_user", "messages.consecutive_assistant", "messages.assistant_last"],
  tools: ["messages.tool_call_no_result", "messages.orphan_tool_result"],
  other: ["messages.content_parts"],
};

export function CapDetail({ session, modelId, testId, onClose }: { session: CapSession; modelId: string | null; testId: string | null; onClose: () => void }) {
  const t = useT();
  const fm = useMsg();
  const updateModel = useProviders((s) => s.updateModel);
  const models = useProviders((s) => s.models);
  const [applied, setApplied] = React.useState(false);
  const snap = session.models.find((m) => m.id === modelId);
  const outcome: CapOutcome | undefined = modelId && testId ? session.results[modelId]?.outcomes[testId] : undefined;
  const info = testId ? testInfo(t, testId) : null;
  const liveModel = models.find((m) => m.id === modelId);
  React.useEffect(() => setApplied(false), [modelId, testId]);
  return (
    <Drawer open={!!outcome} onOpenChange={(o) => !o && onClose()} title={info?.name ?? ""} description={snap ? `${snap.label} · ${snap.providerName}` : undefined}>
      {outcome && info ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={outcome.status} label={t.status[outcome.status]} />
            <span className="text-sm text-ink-2">{fm(outcome.summary)}</span>
          </div>
          <div className="rounded-md bg-surface-2 p-3 text-xs leading-5 text-ink-2">
            <div className="mb-1 font-semibold text-ink">{t.common.whatItDoes}</div>
            <p>{info.desc}</p>
            <div className="mb-1 mt-2 font-semibold text-ink">{t.common.why}</div>
            <p>{info.why}</p>
          </div>
          {outcome.suggestion ? (
            <div className="rounded-md border border-good/40 bg-good/5 p-3">
              <div className="mb-1 text-sm font-semibold">{t.caps.suggestion}</div>
              <p className="mb-2 text-xs text-ink-2">{t.caps.suggestionHint}</p>
              {Object.keys(outcome.suggestion.extraBody).length ? <CodeBlock code={JSON.stringify(outcome.suggestion.extraBody, null, 2)} copyLabel={t.common.copy} /> : <div className="mono rounded-md border border-border bg-surface px-3 py-2 text-xs">{t.models.maxTokensParam}: {outcome.suggestion.maxTokensParam}</div>}
              {liveModel ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="mt-2"
                  disabled={applied}
                  onClick={() => {
                    updateModel(liveModel.id, { extraBody: { ...(liveModel.extraBody ?? {}), ...outcome.suggestion!.extraBody }, ...(outcome.suggestion!.maxTokensParam ? { maxTokensParam: outcome.suggestion!.maxTokensParam } : {}) });
                    setApplied(true);
                  }}
                >
                  {applied ? t.caps.applied : t.caps.applyToModel}
                </Button>
              ) : null}
            </div>
          ) : null}
          {outcome.evidence.notes.length ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.caps.notes}</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                {outcome.evidence.notes.map((n, i) => (
                  <li key={i}>{fm(n)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {outcome.evidence.table ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.caps.table}</div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-2">
                      {outcome.evidence.table.columns.map((c) => (
                        <th key={c} className="mono whitespace-nowrap px-2 py-1.5 text-left font-semibold text-muted">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.evidence.table.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {r.map((c, j) => (
                          <td key={j} className={cn("px-2 py-1.5 align-top", j === 0 ? "mono" : "tnum")}>
                            {c === true ? "✓" : c === false ? "✗" : c == null ? "—" : String(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {outcome.evidence.facts && Object.keys(outcome.evidence.facts).length ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.caps.facts}</div>
              <Kv items={Object.entries(outcome.evidence.facts).map(([k, v]) => ({ k: <span className="mono">{k}</span>, v: v === true ? "✓" : v === false ? "✗" : v == null ? "—" : String(v) }))} />
            </div>
          ) : null}
          {outcome.evidence.error ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.caps.error}</div>
              <CodeBlock code={safeJson(outcome.evidence.error)} copyLabel={t.common.copy} />
            </div>
          ) : null}
          {outcome.evidence.request ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.caps.request}</div>
              <CodeBlock code={safeJson(outcome.evidence.request, 12000)} copyLabel={t.common.copy} />
            </div>
          ) : null}
          {outcome.evidence.response ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t.caps.response}</div>
              <CodeBlock code={safeJson(outcome.evidence.response, 12000)} copyLabel={t.common.copy} />
            </div>
          ) : null}
          <div className="text-xs text-muted">
            {t.common.duration}: {outcome.durationMs} ms · {fmtDate(outcome.startedAt)}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

function suitesInSession(session: CapSession): CapSuiteId[] {
  const present = new Set<CapSuiteId>();
  for (const s of SUITE_ORDER) if (session.config.suites[s] || s === "connectivity") present.add(s);
  return SUITE_ORDER.filter((s) => present.has(s));
}

export function CapMatrix({ session }: { session: CapSession }) {
  const t = useT();
  const fm = useMsg();
  const capProgress = useRun((s) => s.capProgress);
  const active = useRun((s) => s.active);
  const [sel, setSel] = React.useState<{ modelId: string; testId: string } | null>(null);
  const suites = suitesInSession(session);
  const tests = testsForSuites(session.config.suites);
  const isMessages = session.kind === "messages";
  const running = session.status === "running" && active?.sessionId === session.id;

  const rowsFor = (suite: CapSuiteId) => tests.filter((x) => x.suite === suite).map((x) => x.id);
  const groups: { title: string; ids: string[] }[] = [];
  if (isMessages) {
    groups.push({ title: t.caps.suiteInfo.connectivity.name, ids: rowsFor("connectivity") });
    for (const [g, ids] of Object.entries(MESSAGE_GROUPS)) groups.push({ title: (t.msgs.groups as Record<string, string>)[g], ids: ids.filter((id) => tests.some((x) => x.id === id)) });
  } else for (const s of suites) groups.push({ title: t.caps.suiteInfo[s].name, ids: rowsFor(s) });

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{t.common.test}</th>
              {session.models.map((snap, i) => (
                <th key={snap.id} className="min-w-[200px] px-3 py-2 text-left align-bottom">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <SeriesDot index={i} />
                    {snap.label}
                  </div>
                  <div className="text-xs font-normal text-muted">{snap.providerName}</div>
                  {running && capProgress[snap.id] ? <div className="mt-1 text-[11px] font-normal text-accent-ink">{capProgress[snap.id].testId ? `${testInfo(t, capProgress[snap.id].testId!).name}…` : ""} {capProgress[snap.id].done}/{capProgress[snap.id].total}</div> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              g.ids.length ? (
                <React.Fragment key={g.title}>
                  <tr className="bg-surface-2/70">
                    <td colSpan={session.models.length + 1} className="sticky left-0 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {g.title}
                    </td>
                  </tr>
                  {g.ids.map((id) => {
                    const info = testInfo(t, id);
                    return (
                      <tr key={id} className="border-b border-border last:border-0">
                        <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="font-medium">{info.name}</span>
                            <InfoPopover title={info.name} what={info.desc} why={info.why} labels={{ what: t.common.whatItDoes, why: t.common.why }} />
                          </div>
                          <div className="mono text-[11px] text-muted">{id}</div>
                        </td>
                        {session.models.map((snap) => {
                          const o = session.results[snap.id]?.outcomes[id];
                          const isCurrent = running && capProgress[snap.id]?.testId === id;
                          return (
                            <td key={snap.id} className="px-3 py-2 align-top">
                              {o ? (
                                <button type="button" onClick={() => setSel({ modelId: snap.id, testId: id })} className="group flex w-full flex-col items-start gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                                  <StatusPill status={o.status} label={t.status[o.status]} compact />
                                  <span className="line-clamp-2 text-xs leading-4 text-ink-2 group-hover:text-ink">{fm(o.summary)}</span>
                                  {o.suggestion ? (
                                    <Badge tone="good" className="mono">
                                      {o.suggestion.label}
                                    </Badge>
                                  ) : null}
                                </button>
                              ) : isCurrent ? (
                                <StatusPill status="running" label={t.status.running} compact />
                              ) : running ? (
                                <StatusPill status="pending" label={t.status.pending} compact />
                              ) : (
                                <span className="text-xs text-muted">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ) : null,
            )}
          </tbody>
        </table>
      </div>
      <CapDetail session={session} modelId={sel?.modelId ?? null} testId={sel?.testId ?? null} onClose={() => setSel(null)} />
    </>
  );
}

function highlightsFor(session: CapSession, modelId: string, t: ReturnType<typeof useT>): { tone: "good" | "warning" | "critical" | "neutral"; text: string }[] {
  const o = session.results[modelId]?.outcomes ?? {};
  const out: { tone: "good" | "warning" | "critical" | "neutral"; text: string }[] = [];
  const h = t.caps.highlights;
  const st = (id: string) => o[id]?.status;
  if (st("reasoning.default") === "pass") out.push({ tone: "neutral", text: h.reasoning_on });
  else if (st("reasoning.default") === "fail") out.push({ tone: "neutral", text: h.reasoning_off });
  const tog = o["reasoning.toggle"];
  if (tog?.suggestion) out.push({ tone: "good", text: h.toggle.replace("{dialect}", tog.suggestion.label) });
  const toolModes = [
    ["tools.auto", "auto"],
    ["tools.required", "required"],
    ["tools.named", "named"],
    ["tools.parallel", "parallel"],
    ["tools.streaming", "stream"],
  ].filter(([id]) => st(id) === "pass");
  if (o["tools.auto"]) out.push(toolModes.length ? { tone: "good", text: h.tools.replace("{modes}", toolModes.map((x) => x[1]).join(", ")) } : { tone: "critical", text: h.toolsNo });
  const structModes = [
    ["structured.json_object", "json_object"],
    ["structured.json_schema", "json_schema"],
    ["structured.json_schema_strict", "strict"],
    ["structured.json_schema_nested", "nested"],
  ].filter(([id]) => st(id) === "pass");
  if (o["structured.json_object"]) out.push(structModes.length ? { tone: "good", text: h.structured.replace("{modes}", structModes.map((x) => x[1]).join(", ")) } : { tone: "critical", text: h.structuredNo });
  if (o["vision.base64"]) out.push(st("vision.base64") === "pass" ? { tone: "good", text: h.vision } : { tone: "critical", text: h.visionNo });
  if (o["cache.auto"]) out.push(st("cache.auto") === "pass" ? { tone: "good", text: h.cache } : { tone: "warning", text: h.cacheNo });
  return out;
}

export function CapSessionView({ session, showActions = true }: { session: CapSession; showActions?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const stop = useRun((s) => s.stop);
  const active = useRun((s) => s.active);
  const running = session.status === "running" && active?.sessionId === session.id;
  const isMessages = session.kind === "messages";
  const suiteNames = suitesInSession(session)
    .filter((s) => s !== "connectivity")
    .map((s) => t.caps.suiteInfo[s].name);
  return (
    <div className="space-y-4">
      {!isMessages ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle>{t.caps.summaryTitle}</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {session.models.map((snap, i) => {
              const hs = highlightsFor(session, snap.id, t);
              return (
                <div key={snap.id} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                    <SeriesDot index={i} /> {snap.label}
                  </div>
                  {hs.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {hs.map((x, j) => (
                        <Badge key={j} tone={x.tone}>
                          {x.text}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted">{running ? t.common.running : t.common.noData}</div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              {running ? <span className="inline-block h-2 w-2 rounded-full bg-accent pulse-soft" /> : null}
              {t.caps.matrix}
            </CardTitle>
            <CardDescription>
              {fmtDate(session.createdAt, locale === "zh" ? "zh-CN" : "en")} · {suiteNames.join(" · ")} · {t.caps.matrixHint}
              {session.status === "aborted" ? ` · ${t.common.aborted}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <Button size="sm" variant="danger" onClick={stop}>
                {t.caps.stop}
              </Button>
            ) : null}
            {showActions ? <SessionActions session={session} /> : null}
          </div>
        </CardHeader>
        <CapMatrix session={session} />
      </Card>
    </div>
  );
}

export function probeCount(suites: Record<CapSuiteId, boolean>) {
  return testsForSuites(suites).length;
}
void ALL_TESTS;
void REASONING_DIALECTS;
