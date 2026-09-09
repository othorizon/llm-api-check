import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { zh } from "@/i18n/zh";
import { sessionImageDoc, type ImageCell, type ImageSection } from "@/lib/results/image-model";
import { DEFAULT_PERF_CONFIG, type ModeStats, type PerfSession, type RunSample, type Stats } from "@/lib/perf/types";
import { DEFAULT_CAP_CONFIG, DEFAULT_MESSAGES_CONFIG, type CapOutcome, type CapSession } from "@/lib/caps/types";
import type { ModelSnapshot } from "@/lib/store/types";
import { PRODUCTION_URL } from "@/seo";

const snap = (id: string, label: string): ModelSnapshot => ({ id, label, model: id, providerName: "Mock", presetId: "custom", baseUrl: "http://localhost:8787/v1", extraBody: {} });
const stats = (p50: number): Stats => ({ n: 3, min: p50 * 0.8, max: p50 * 1.3, mean: p50, p50, p90: p50 * 1.2, p95: p50 * 1.25, stdev: 1 });
const mode = (ttfc: number, tps: number, cached: number | null): ModeStats => ({ n: 3, ok: 3, ttft: stats(ttfc - 40), ttfc: stats(ttfc), total: stats(2000), decodeTps: stats(tps), e2eTps: stats(tps * 0.8), completionTokens: stats(200), reasoningTokens: null, promptTokens: 2000, cachedTokens: cached, cachedSource: cached == null ? null : "usage", estimated: false, reasoningDelayMs: null });
const sample = (modelId: string, cache: "miss" | "hit", index: number, ok = true): RunSample => ({ id: `${modelId}-${cache}-${index}`, modelId, mode: "stream", cache, index, startedAt: 0, ok, ttftMs: 100, ttfcMs: 120, firstReasoningMs: null, totalMs: 900, promptTokens: 2000, completionTokens: 200, cachedTokens: 0, cachedSource: null, reasoningTokens: null, tokensEstimated: false, decodeTps: 100, e2eTps: 80, chunkCount: 10, contentChars: 800, reasoningChars: 0, finishReason: "stop" });

function perfSession(): PerfSession {
  const models = [snap("m1", "Fast"), snap("m2", "Slow")];
  return {
    id: "p1",
    kind: "performance",
    version: 2,
    createdAt: Date.UTC(2026, 8, 9, 12, 0, 0),
    finishedAt: null,
    status: "done",
    config: { ...DEFAULT_PERF_CONFIG, cacheMode: "compare", runs: 3 },
    models,
    results: {
      m1: { modelId: "m1", samples: [sample("m1", "miss", 0), sample("m1", "miss", 1), sample("m1", "hit", 0)], miss: { stream: mode(300, 120, 0), nonStream: null }, hit: { stream: mode(150, 120, 1800), nonStream: null }, comparison: null, scoredFrom: "miss", scores: [{ id: "voice", score: 92, grade: "A", reasons: [] }, { id: "chat", score: 80, grade: "B", reasons: [] }, { id: "agent", score: 60, grade: "C", reasons: [] }, { id: "batch", score: 30, grade: "F", reasons: [] }] },
      m2: { modelId: "m2", samples: [sample("m2", "miss", 0), sample("m2", "miss", 1, false), sample("m2", "hit", 0)], miss: { stream: mode(1800, 20, null), nonStream: null }, hit: { stream: mode(1700, 20, null), nonStream: null }, comparison: null, scoredFrom: "miss", scores: [{ id: "voice", score: null, grade: null, reasons: [] }, { id: "chat", score: 40, grade: "D", reasons: [] }, { id: "agent", score: 35, grade: "F", reasons: [] }, { id: "batch", score: 45, grade: "D", reasons: [] }] },
    },
  };
}

const outcome = (testId: string, status: CapOutcome["status"], code = "cap.ok"): CapOutcome => ({ testId, status, summary: { code }, evidence: { notes: [] }, durationMs: 10, startedAt: 0 });

function capSession(kind: "capability" | "messages", modelCount = 2): CapSession {
  const models = Array.from({ length: modelCount }, (_, i) => snap(`c${i}`, `Model ${i}`));
  const results: CapSession["results"] = {};
  for (const m of models) {
    const outcomes: Record<string, CapOutcome> = {
      "connectivity.basic": outcome("connectivity.basic", "pass"),
      ...(kind === "capability" ? { "reasoning.default": outcome("reasoning.default", "fail"), "tools.auto": outcome("tools.auto", "pass"), "tools.required": outcome("tools.required", "unsupported") } : { "messages.system_mid": outcome("messages.system_mid", "partial") }),
    };
    results[m.id] = { modelId: m.id, outcomes, order: Object.keys(outcomes) };
  }
  return { id: `c-${kind}`, kind, createdAt: Date.UTC(2026, 8, 9, 12, 0, 0), finishedAt: null, status: "done", config: kind === "capability" ? DEFAULT_CAP_CONFIG : DEFAULT_MESSAGES_CONFIG, models, results };
}

const table = (s: ImageSection) => (s.type === "table" ? s : null);
const dataRows = (s: ImageSection) => table(s)!.rows.filter((r) => r.kind === "row");
const cellText = (c: ImageCell) => (c.kind === "text" ? c.text : c.kind);

describe("share image model", () => {
  it("builds a performance report with the summary table, scenario grades and bars", () => {
    const doc = sessionImageDoc(perfSession(), en, "en");
    expect(doc.title).toBe("Performance report");
    expect(doc.kind).toBe("Performance");
    expect(doc.models.map((m) => m.label)).toEqual(["Fast", "Slow"]);
    expect(doc.summary[0]).toContain("Compare both");
    expect(doc.summary[0]).toContain("3 runs");
    expect(doc.sections.map((s) => s.type)).toEqual(["table", "table", "bars"]);

    // Summary: model, cache condition, three streaming columns, cached, success (non-streaming is off by default).
    const summary = table(doc.sections[0])!;
    expect(summary.columns.map((c) => c.label)).toEqual(["Model", "Cache", "TTF content", "TTFT", "Decode tok/s", "Cached", "Success"]);
    const rows = dataRows(doc.sections[0]);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.kind === "row" && !!r.continues)).toEqual([false, true, false, true]);
    const fastMiss = rows[0].kind === "row" ? rows[0].cells : [];
    expect(fastMiss[0]).toMatchObject({ kind: "model", model: { label: "Fast", index: 0 } });
    expect(fastMiss[1]).toMatchObject({ kind: "badge", text: "Cache miss", tone: "neutral" });
    expect(fastMiss[2]).toMatchObject({ kind: "text", text: "300 ms", sub: "p95 375 ms" });
    const fastHit = rows[1].kind === "row" ? rows[1].cells : [];
    expect(fastHit[1]).toMatchObject({ kind: "badge", text: "Cache hit", tone: "accent" });
    expect(fastHit[5]).toMatchObject({ kind: "text", text: "90%", tone: "good" });
    // Slow had one failed miss run out of two.
    const slowMiss = rows[2].kind === "row" ? rows[2].cells : [];
    expect(slowMiss[6]).toMatchObject({ kind: "text", text: "50%", tone: "critical" });

    const grades = table(doc.sections[1])!;
    expect(grades.columns.map((c) => c.model?.label ?? c.label)).toEqual(["Scenario fit", "Fast", "Slow"]);
    const gradeRows = dataRows(doc.sections[1]);
    expect(gradeRows).toHaveLength(4);
    expect(gradeRows[0].kind === "row" && gradeRows[0].cells.map(cellText)).toEqual(["Real-time voice", "grade", "grade"]);
    expect(gradeRows[0].kind === "row" && gradeRows[0].cells[1]).toMatchObject({ kind: "grade", grade: "A", score: 92 });
    expect(gradeRows[0].kind === "row" && gradeRows[0].cells[2]).toMatchObject({ kind: "grade", grade: null, score: null });

    const bars = doc.sections[2];
    expect(bars.type === "bars" && bars.groups.map((g) => g.items.length)).toEqual([4, 4]);
    expect(bars.type === "bars" && bars.groups[0].items[0]).toMatchObject({ label: "Fast · Cache miss", value: 300, display: "300 ms" });
  });

  it("localises the report and carries the brand link", () => {
    const doc = sessionImageDoc(perfSession(), zh, "zh");
    expect(doc.title).toBe("性能测试报告");
    expect(doc.kind).toBe("性能");
    expect(doc.brand.url).toBe(PRODUCTION_URL);
    expect(doc.brand.host).toBe("llmapicheck.dev");
    expect(doc.brand.name).toBe("LLM API Check");
    expect(doc.brand.scan).toBe(zh.results.imageScan);
    expect(doc.brand.generated).toContain("LLM API Check");
  });

  it("builds a capability report with highlights and a grouped matrix", () => {
    const doc = sessionImageDoc(capSession("capability"), en, "en");
    expect(doc.title).toBe("Capability report");
    expect(doc.sections.map((s) => s.type)).toEqual(["highlights", "table"]);
    const highlights = doc.sections[0];
    expect(highlights.type === "highlights" && highlights.items[0].badges.map((b) => b.text)).toEqual(["No reasoning by default", "Tool calling works (auto)"]);
    const matrix = table(doc.sections[1])!;
    expect(matrix.columns.map((c) => c.model?.label ?? c.label)).toEqual(["Test", "Model 0", "Model 1"]);
    const groups = matrix.rows.filter((r) => r.kind === "group").map((r) => r.kind === "group" && r.label);
    expect(groups).toEqual(["Connectivity", "Reasoning (chain-of-thought)", "Tool calling", "Structured output", "Vision", "Prompt caching", "Parameter compatibility"]);
    const toolsRow = matrix.rows.find((r) => r.kind === "row" && r.cells[0].kind === "text" && r.cells[0].sub === "tools.required");
    expect(toolsRow?.kind === "row" && toolsRow.cells[1]).toMatchObject({ kind: "pill", status: "unsupported", label: "Rejected" });
    // Probes that never ran show a dash.
    const visionRow = matrix.rows.find((r) => r.kind === "row" && r.cells[0].kind === "text" && r.cells[0].sub === "vision.base64");
    expect(visionRow?.kind === "row" && visionRow.cells[1]).toMatchObject({ kind: "text", text: "—" });
    expect(doc.summary[0]).toContain("Tool calling");
  });

  it("groups message-format probes by placement and skips highlights", () => {
    const doc = sessionImageDoc(capSession("messages"), zh, "zh");
    expect(doc.title).toBe("消息格式兼容性报告");
    expect(doc.sections.map((s) => s.type)).toEqual(["table"]);
    const groups = table(doc.sections[0])!.rows.filter((r) => r.kind === "group").map((r) => r.kind === "group" && r.label);
    expect(groups).toEqual([zh.caps.suiteInfo.connectivity.name, zh.msgs.groups.system, zh.msgs.groups.turns, zh.msgs.groups.tools, zh.msgs.groups.other]);
  });

  it("widens the canvas so every model column keeps room for a verdict", () => {
    expect(sessionImageDoc(capSession("capability", 2), en, "en").width).toBe(1200);
    expect(sessionImageDoc(capSession("capability", 6), en, "en").width).toBeGreaterThan(1200);
  });
});
