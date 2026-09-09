// Turns a session into the declarative content of the exported share image. Pure data, no DOM:
// the painter in image.ts draws it, and the unit tests check it without a canvas.
import type { Dict } from "@/i18n/en";
import { formatMsg, testInfo } from "@/i18n";
import { interpolate, type Locale } from "@/i18n/core";
import type { CapSession, CapStatus } from "@/lib/caps/types";
import type { CacheCondition, Grade, ModeStats, PerfSession, Stats } from "@/lib/perf/types";
import { SCENARIOS } from "@/lib/perf/scoring";
import { REASONING_DIALECTS } from "@/lib/caps/reasoning-dialects";
import { estimateTokens } from "@/lib/llm/tokens";
import { highlightsFor, matrixGroups, suitesInSession } from "@/lib/caps/present";
import type { Session } from "@/lib/store/results";
import { fmtDate, fmtInt, fmtMs, fmtNum, fmtPct } from "@/lib/utils/format";
import { siteUrl } from "@/seo";

export type Tone = "good" | "warning" | "serious" | "critical" | "accent" | "neutral" | "muted";

export interface ImageModel {
  /** Position in the session (drives the series colour). */
  index: number;
  label: string;
  provider: string;
}

export type ImageCell =
  | { kind: "text"; text: string; sub?: string; tone?: Tone; strong?: boolean; mono?: boolean; subMono?: boolean; /** Wrap instead of truncating (a few lines at most). */ wrap?: boolean }
  | { kind: "model"; model: ImageModel }
  | { kind: "pill"; status: CapStatus; label: string; sub?: string }
  | { kind: "badge"; text: string; tone: Tone }
  | { kind: "grade"; grade: Grade | null; score: number | null };

export interface ImageColumn {
  label: string;
  /** Fixed width in px; columns without one share the remaining width by `grow`. */
  width?: number;
  grow?: number;
  /** Header shows the model's colour dot and label instead of an uppercase caption. */
  model?: ImageModel;
}

export type ImageRow = { kind: "group"; label: string } | { kind: "row"; cells: ImageCell[]; /** Continues the previous row (same model, another cache condition). */ continues?: boolean };

export interface ImageBadge {
  text: string;
  tone: Tone;
  mono?: boolean;
}

export interface ImageBar {
  model: ImageModel;
  label: string;
  value: number | null;
  display: string;
}

export type ImageSection =
  | { type: "table"; title?: string; hint?: string; columns: ImageColumn[]; rows: ImageRow[]; notes?: string[] }
  | { type: "highlights"; title: string; items: { model: ImageModel; badges: ImageBadge[] }[]; empty: string }
  | { type: "bars"; groups: { title: string; items: ImageBar[] }[] };

export interface ImageDoc {
  /** Logical width in px (the painter renders at 2× where the canvas budget allows). */
  width: number;
  /** Kind badge next to the date, e.g. "Performance". */
  kind: string;
  title: string;
  date: string;
  models: ImageModel[];
  /** Lines under the model list: configuration, suites, stopped-early notice. */
  summary: string[];
  sections: ImageSection[];
  brand: { name: string; tagline: string; url: string; host: string; scan: string; generated: string };
}

/** Outer margin and panel padding, shared with the painter so the model can size the canvas. */
export const IMAGE_LAYOUT = { pad: 56, panelPad: 24, minWidth: 1200 };

function imageModels(s: Session): ImageModel[] {
  return s.models.map((m, i) => ({ index: i, label: m.label, provider: m.providerName }));
}

function brand(dict: Dict): ImageDoc["brand"] {
  const url = siteUrl();
  return {
    name: dict.meta.siteName,
    tagline: dict.meta.tagline,
    url,
    host: url.replace(/^https?:\/\//, ""),
    scan: dict.results.imageScan,
    generated: dict.results.generatedBy.replace("{site}", dict.meta.siteName),
  };
}

function common(s: Session, dict: Dict, locale: Locale) {
  return {
    kind: dict.results.kind[s.kind],
    title: dict.results.imageTitle[s.kind],
    date: fmtDate(s.createdAt, locale === "zh" ? "zh-CN" : "en"),
    models: imageModels(s),
    brand: brand(dict),
  };
}

function statusLine(s: Session, dict: Dict): string | null {
  if (s.status === "aborted") return dict.common.aborted;
  if (s.status === "running") return dict.common.running;
  return null;
}

const DASH: ImageCell = { kind: "text", text: "—", tone: "muted" };

function dialectLabel(id: string | null, none: string) {
  if (!id) return none;
  return REASONING_DIALECTS.find((d) => d.id === id)?.label ?? id;
}

function perfSummary(s: PerfSession, dict: Dict): string {
  const cfg = s.config;
  const promptDesc = cfg.promptSource === "custom" ? `${dict.perf.promptCustom} (≈ ${estimateTokens(cfg.customPrompt)} ${dict.common.tokens})` : `${dict.perf.promptSizes[cfg.promptSize]} · ${dict.perf.promptLangs[cfg.promptLang]}`;
  return `${dict.perf.cacheModes[cfg.cacheMode].name} · ${promptDesc} · ${cfg.runs} ${dict.common.runs} · max ${cfg.maxTokens} ${dict.common.tokens} · ${dict.perf.reasoningOff}: ${dialectLabel(cfg.disableReasoning, dict.perf.reasoningOffNone)}`;
}

function statCell(st: Stats | null | undefined, kind: "ms" | "tps", estimated?: boolean): ImageCell {
  if (!st) return DASH;
  const f = kind === "ms" ? (v: number) => fmtMs(v) : (v: number) => fmtNum(v, 1);
  return { kind: "text", text: `${estimated ? "≈" : ""}${f(st.p50)}`, strong: true, sub: st.n > 1 ? `p95 ${f(st.p95)}` : undefined };
}

function cachedCell(stats: ModeStats | null, cond: CacheCondition): ImageCell {
  if (!stats || stats.ok === 0 || stats.cachedTokens == null) return DASH;
  const ratio = stats.promptTokens ? Math.min(1, stats.cachedTokens / stats.promptTokens) : null;
  const tone: Tone = stats.cachedTokens > 0 ? (cond === "hit" ? "good" : "warning") : "muted";
  return { kind: "text", text: ratio == null ? fmtInt(stats.cachedTokens) : fmtPct(ratio), tone, strong: true, sub: `${fmtInt(stats.cachedTokens)} / ${fmtInt(stats.promptTokens)}` };
}

/** Widths of the fixed summary-table columns and the minimum for each metric column. */
const PERF_COLS = { model: 230, cache: 118, metric: 134 };

export function perfImageDoc(s: PerfSession, dict: Dict, locale: Locale): ImageDoc {
  const base = common(s, dict, locale);
  const m = dict.perf.metrics;
  const conditions: CacheCondition[] = s.config.cacheMode === "compare" ? ["miss", "hit"] : [s.config.cacheMode];
  const multi = conditions.length > 1;
  const anyStream = s.config.modes.stream;
  const anyNon = s.config.modes.nonStream;

  // Summary table — the same columns as the on-page summary.
  const columns: ImageColumn[] = [{ label: dict.common.model, width: PERF_COLS.model }];
  if (multi) columns.push({ label: dict.perf.columns.cache, width: PERF_COLS.cache });
  if (anyStream) columns.push({ label: m.ttfc }, { label: m.ttft }, { label: m.decodeTps });
  if (anyNon) columns.push({ label: `${m.latency}\n${dict.perf.modeLabels.non_stream}` }, { label: m.e2eTps });
  columns.push({ label: m.cachedTokens }, { label: m.success });
  const rows: ImageRow[] = [];
  const notes: string[] = [];
  let estimated = false;
  const ttfcBars: ImageBar[] = [];
  const tpsBars: ImageBar[] = [];
  for (const model of base.models) {
    const snap = s.models[model.index];
    const r = s.results[snap.id];
    const dropped = (r?.samples ?? []).filter((x) => x.reasoningParamDropped).length;
    if (dropped) notes.push(interpolate(dict.perf.reasoningDropped, { model: snap.label, dialect: dialectLabel(s.config.disableReasoning, dict.perf.reasoningOffNone), n: dropped }));
    for (const cond of conditions) {
      const cs = cond === "miss" ? r?.miss : r?.hit;
      const measured = (r?.samples ?? []).filter((x) => x.cache === cond && !x.warmup);
      const success = measured.length ? measured.filter((x) => x.ok).length / measured.length : null;
      const primary = cs?.stream ?? cs?.nonStream ?? null;
      if (cs?.stream?.estimated || cs?.nonStream?.estimated) estimated = true;
      const first = cond === conditions[0];
      const cells: ImageCell[] = [first ? { kind: "model", model } : { kind: "text", text: "" }];
      if (multi) cells.push({ kind: "badge", text: dict.perf.conditionShort[cond], tone: cond === "hit" ? "accent" : "neutral" });
      if (anyStream) cells.push(statCell(cs?.stream?.ttfc, "ms"), statCell(cs?.stream?.ttft, "ms"), statCell(cs?.stream?.decodeTps, "tps", cs?.stream?.estimated));
      if (anyNon) cells.push(statCell(cs?.nonStream?.total, "ms"), statCell(cs?.nonStream?.e2eTps, "tps", cs?.nonStream?.estimated));
      cells.push(cachedCell(primary, cond), success == null ? DASH : { kind: "text", text: fmtPct(success), strong: true, tone: success < 1 ? "critical" : undefined });
      rows.push({ kind: "row", cells, continues: !first });
      const label = multi ? `${model.label} · ${dict.perf.conditionShort[cond]}` : model.label;
      const ttfc = cs?.stream?.ttfc?.p50 ?? null;
      ttfcBars.push({ model, label, value: ttfc, display: fmtMs(ttfc) });
      const tps = cs?.stream?.decodeTps?.p50 ?? cs?.nonStream?.e2eTps?.p50 ?? null;
      tpsBars.push({ model, label, value: tps, display: tps == null ? "—" : `${fmtNum(tps, 1)} tok/s` });
    }
  }
  if (estimated) notes.push(m.estimatedNote);
  const sections: ImageSection[] = [{ type: "table", title: dict.perf.summary, columns, rows, notes: notes.length ? notes : undefined }];

  // Scenario grades.
  const scenarioRows: ImageRow[] = SCENARIOS.map((sc) => ({
    kind: "row",
    cells: [
      { kind: "text", text: dict.perf.scenarios[sc].name, strong: true, sub: dict.perf.scenarios[sc].desc, wrap: true },
      ...base.models.map((model): ImageCell => {
        const sco = s.results[s.models[model.index].id]?.scores.find((x) => x.id === sc);
        return { kind: "grade", grade: sco?.grade ?? null, score: sco?.score ?? null };
      }),
    ],
  }));
  const basis = s.config.cacheMode === "compare" ? ` ${interpolate(dict.perf.scoreBasis, { condition: dict.perf.conditionShort.miss })}` : "";
  sections.push({ type: "table", title: dict.perf.scenarioTitle, hint: dict.perf.scenarioHint + basis, columns: [{ label: dict.perf.scenarioTitle, width: 360 }, ...base.models.map((model) => ({ label: model.label, model }))], rows: scenarioRows });

  // Bars: one glance at who is fastest.
  const groups = [
    { title: `${m.ttfc} · ${m.p50}`, items: ttfcBars },
    { title: `${m.decodeTps} · ${m.p50}`, items: tpsBars },
  ].filter((g) => g.items.some((i) => i.value != null));
  if (groups.length) sections.push({ type: "bars", groups });

  const status = statusLine(s, dict);
  // Every metric column keeps room for "1.23 s" plus its p95 line; compare mode with both request modes needs the extra width.
  const metricCols = columns.length - (multi ? 2 : 1);
  const width = Math.max(IMAGE_LAYOUT.minWidth, IMAGE_LAYOUT.pad * 2 + IMAGE_LAYOUT.panelPad * 2 + PERF_COLS.model + (multi ? PERF_COLS.cache : 0) + metricCols * PERF_COLS.metric);
  return { ...base, width, summary: [perfSummary(s, dict), ...(status ? [status] : [])], sections };
}

export function capImageDoc(s: CapSession, dict: Dict, locale: Locale): ImageDoc {
  const base = common(s, dict, locale);
  const sections: ImageSection[] = [];
  if (s.kind === "capability") {
    sections.push({
      type: "highlights",
      title: dict.caps.summaryTitle,
      empty: dict.common.noData,
      items: base.models.map((model) => ({
        model,
        badges: highlightsFor(s, s.models[model.index].id, dict).flatMap((h): ImageBadge[] => [{ text: h.text, tone: h.tone }, ...(h.items ?? []).map((it): ImageBadge => ({ text: it, tone: h.tone, mono: true }))]),
      })),
    });
  }
  const rows: ImageRow[] = [];
  for (const g of matrixGroups(s, dict)) {
    rows.push({ kind: "group", label: g.title });
    for (const id of g.ids) {
      const info = testInfo(dict, id);
      rows.push({
        kind: "row",
        cells: [
          { kind: "text", text: info.name, strong: true, sub: id, subMono: true, wrap: true },
          ...base.models.map((model): ImageCell => {
            const o = s.results[s.models[model.index].id]?.outcomes[id];
            return o ? { kind: "pill", status: o.status, label: dict.status[o.status], sub: formatMsg(dict, o.summary) } : DASH;
          }),
        ],
      });
    }
  }
  const testColumn = 300;
  sections.push({ type: "table", title: dict.caps.matrix, columns: [{ label: dict.common.test, width: testColumn }, ...base.models.map((model) => ({ label: model.label, model }))], rows });
  // The suite list only says something for capability sessions; a message-format session would just repeat its title.
  const suiteNames = s.kind === "capability" ? suitesInSession(s).filter((x) => x !== "connectivity").map((x) => dict.caps.suiteInfo[x].name) : [];
  const status = statusLine(s, dict);
  // Give every model column room for a verdict and a one-line summary.
  const width = Math.max(IMAGE_LAYOUT.minWidth, IMAGE_LAYOUT.pad * 2 + IMAGE_LAYOUT.panelPad * 2 + testColumn + base.models.length * 240);
  return { ...base, width, summary: [...(suiteNames.length ? [suiteNames.join(" · ")] : []), ...(status ? [status] : [])], sections };
}

export function sessionImageDoc(s: Session, dict: Dict, locale: Locale): ImageDoc {
  return s.kind === "performance" ? perfImageDoc(s, dict, locale) : capImageDoc(s, dict, locale);
}
