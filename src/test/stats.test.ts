import { describe, expect, it } from "vitest";
import { interp, percentile, summarize } from "@/lib/perf/stats";
import { computeScores, gradeOf } from "@/lib/perf/scoring";
import { aggregate, buildJobs, sampleFromResult } from "@/lib/perf/runner";
import { DEFAULT_PERF_CONFIG, type RunSample } from "@/lib/perf/types";
import type { CompletionResult } from "@/lib/llm/types";

describe("stats", () => {
  it("computes percentiles with interpolation", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10], 0.95)).toBe(10);
    const s = summarize([3, 1, 2, null, undefined])!;
    expect(s.n).toBe(3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(3);
    expect(s.p50).toBe(2);
  });
  it("interpolates piecewise", () => {
    const pts: [number, number][] = [
      [0, 100],
      [100, 0],
    ];
    expect(interp(50, pts)).toBe(50);
    expect(interp(-5, pts)).toBe(100);
    expect(interp(500, pts)).toBe(0);
  });
});

function sample(over: Partial<RunSample>): RunSample {
  return { id: "x", modelId: "m", mode: "stream", index: 0, startedAt: 0, ok: true, ttftMs: 300, ttfcMs: 300, firstReasoningMs: null, totalMs: 2300, promptTokens: 50, completionTokens: 200, cachedTokens: null, cachedSource: null, reasoningTokens: null, tokensEstimated: false, decodeTps: 100, e2eTps: 87, chunkCount: 200, contentChars: 800, reasoningChars: 0, finishReason: "stop", ...over };
}

describe("scoring", () => {
  it("grades a fast model A for voice and a slow one F", () => {
    const fast = aggregate("m", [sample({}), sample({ index: 1, ttfcMs: 280 }), sample({ index: 2, ttfcMs: 320 })]);
    const voice = fast.scores.find((s) => s.id === "voice")!;
    expect(voice.grade).toBe("A");
    const slow = aggregate("m", [sample({ ttftMs: 3500, ttfcMs: 3500, decodeTps: 12 })]);
    expect(slow.scores.find((s) => s.id === "voice")!.grade).toBe("F");
    expect(gradeOf(70)).toBe("B");
  });
  it("returns null scores without streaming data", () => {
    const scores = computeScores(null, null, null);
    expect(scores.every((s) => s.score === null)).toBe(true);
  });
  it("aggregates cache stats", () => {
    const r = aggregate("m", [sample({ mode: "cache_cold", ttftMs: 1000, cachedTokens: 0, promptTokens: 2600 }), sample({ mode: "cache_warm", index: 1, ttftMs: 400, cachedTokens: 2560, promptTokens: 2600 })]);
    expect(r.cache?.reported).toBe(true);
    expect(r.cache?.hitRatio).toBeCloseTo(2560 / 2600, 3);
    expect(r.cache?.ttftImprovement).toBeCloseTo(0.6, 3);
  });
});

describe("runner helpers", () => {
  it("builds round-robin jobs", () => {
    const models = [{ model: { id: "a" } }, { model: { id: "b" } }] as any;
    const jobs = buildJobs({ ...DEFAULT_PERF_CONFIG, runs: 2, warmup: false, cacheRepeats: 1 }, models);
    expect(jobs.map((j) => `${j.bm.model.id}:${j.mode}`)).toEqual(["a:stream", "b:stream", "a:non_stream", "b:non_stream", "a:stream", "b:stream", "a:non_stream", "b:non_stream", "a:cache_cold", "b:cache_cold", "a:cache_warm", "b:cache_warm"]);
    expect(jobs[10].delayBefore).toBe(DEFAULT_PERF_CONFIG.cacheWarmDelayMs);
  });
  it("derives a sample from a streamed result", () => {
    const res: CompletionResult = { content: "hello world", reasoning: "", reasoningSource: null, toolCalls: [], finishReason: "stop", refusal: null, usage: { completion_tokens: 101, prompt_tokens: 20 }, raw: null, chunkCount: 101, streamed: true, timing: { startAt: 0, headersMs: 100, firstTokenMs: 200, firstContentMs: 200, firstReasoningMs: null, firstToolCallMs: null, totalMs: 1200 } };
    const s = sampleFromResult(res, { id: "s", modelId: "m", mode: "stream", index: 0, startedAt: 0 });
    expect(s.decodeTps).toBeCloseTo(100, 5);
    expect(s.e2eTps).toBeCloseTo(101 / 1.2, 5);
    expect(s.tokensEstimated).toBe(false);
  });
});
