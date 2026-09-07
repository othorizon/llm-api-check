import { describe, expect, it } from "vitest";
import { interp, percentile, summarize } from "@/lib/perf/stats";
import { computeScores, gradeOf } from "@/lib/perf/scoring";
import { aggregate, buildJobs, isReasoningParamRejection, reasoningParams, requestsPerModel, sampleFromResult } from "@/lib/perf/runner";
import { LlmError } from "@/lib/llm/errors";
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
  return { id: "x", modelId: "m", mode: "stream", cache: "miss", index: 0, startedAt: 0, ok: true, ttftMs: 300, ttfcMs: 300, firstReasoningMs: null, totalMs: 2300, promptTokens: 50, completionTokens: 200, cachedTokens: null, cachedSource: null, reasoningTokens: null, tokensEstimated: false, decodeTps: 100, e2eTps: 87, chunkCount: 200, contentChars: 800, reasoningChars: 0, finishReason: "stop", ...over };
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
  it("aggregates miss vs hit conditions and compares them", () => {
    const r = aggregate("m", [sample({ cache: "miss", ttftMs: 1000, cachedTokens: 0, promptTokens: 2600 }), sample({ cache: "hit", index: -1, warmup: true }), sample({ cache: "hit", ttftMs: 400, cachedTokens: 2560, promptTokens: 2600 })]);
    expect(r.miss?.stream?.n).toBe(1);
    expect(r.hit?.stream?.n).toBe(1); // warm-up excluded
    expect(r.hit?.stream?.cachedTokens).toBe(2560);
    expect(r.comparison?.reported).toBe(true);
    expect(r.comparison?.hitRatio).toBeCloseTo(2560 / 2600, 3);
    expect(r.comparison?.ttftImprovement).toBeCloseTo(0.6, 3);
    expect(r.scoredFrom).toBe("miss");
    const hitOnly = aggregate("m", [sample({ cache: "hit" })]);
    expect(hitOnly.scoredFrom).toBe("hit");
    expect(hitOnly.scores[0].reasons.some((x) => x.code === "score.from_hit")).toBe(true);
  });
});

describe("reasoning parameters", () => {
  it("defaults to thinking:{type:disabled} and can be switched off", () => {
    expect(reasoningParams(DEFAULT_PERF_CONFIG)).toEqual({ thinking: { type: "disabled" } });
    expect(reasoningParams({ disableReasoning: "enable_thinking" })).toEqual({ enable_thinking: false });
    expect(reasoningParams({ disableReasoning: null })).toEqual({});
  });
  it("recognises a rejection of the dialect's own key", () => {
    const params = reasoningParams(DEFAULT_PERF_CONFIG);
    expect(isReasoningParamRejection(new LlmError("bad_request", "x", { status: 400, providerMessage: "Unrecognized request argument supplied: thinking" }), params)).toBe(true);
    expect(isReasoningParamRejection(new LlmError("bad_request", "x", { status: 400, providerMessage: "Invalid model" }), params)).toBe(false);
    expect(isReasoningParamRejection(new LlmError("auth", "x", { status: 401, providerMessage: "thinking" }), params)).toBe(false);
  });
});

describe("runner helpers", () => {
  it("builds round-robin jobs per cache mode", () => {
    const models = [{ model: { id: "a" } }, { model: { id: "b" } }] as any;
    const both = { ...DEFAULT_PERF_CONFIG, modes: { stream: true, nonStream: true } };
    const miss = buildJobs({ ...both, runs: 2, cacheMode: "miss" }, models);
    expect(miss.map((j) => `${j.bm.model.id}:${j.mode}:${j.cache}`)).toEqual(["a:stream:miss", "b:stream:miss", "a:non_stream:miss", "b:non_stream:miss", "a:stream:miss", "b:stream:miss", "a:non_stream:miss", "b:non_stream:miss"]);
    expect(miss.some((j) => j.warmup)).toBe(false);
    const hit = buildJobs({ ...both, runs: 1, cacheMode: "hit" }, models);
    expect(hit.map((j) => `${j.bm.model.id}:${j.cache}:${j.warmup ? "warm" : j.mode}`)).toEqual(["a:hit:warm", "b:hit:warm", "a:hit:stream", "b:hit:stream", "a:hit:non_stream", "b:hit:non_stream"]);
    expect(hit[2].delayBefore).toBe(DEFAULT_PERF_CONFIG.cacheWarmDelayMs);
    const compare = buildJobs({ ...both, runs: 1, cacheMode: "compare" }, models);
    expect(compare.filter((j) => j.cache === "miss").length).toBe(4);
    expect(compare.filter((j) => j.warmup).length).toBe(2);
    expect(requestsPerModel({ ...DEFAULT_PERF_CONFIG, runs: 3, cacheMode: "compare" })).toBe(7); // streaming only by default: 3 miss + 1 warm-up + 3 hit
    expect(DEFAULT_PERF_CONFIG).toMatchObject({ modes: { stream: true, nonStream: false }, cacheMode: "miss", promptSize: "long", disableReasoning: "thinking_type", promptLangAuto: true });
  });
  it("derives a sample from a streamed result", () => {
    const res: CompletionResult = { content: "hello world", reasoning: "", reasoningSource: null, toolCalls: [], finishReason: "stop", refusal: null, usage: { completion_tokens: 101, prompt_tokens: 20 }, raw: null, chunkCount: 101, streamed: true, timing: { startAt: 0, headersMs: 100, firstTokenMs: 200, firstContentMs: 200, firstReasoningMs: null, firstToolCallMs: null, totalMs: 1200 } };
    const s = sampleFromResult(res, { id: "s", modelId: "m", mode: "stream", cache: "miss", index: 0, startedAt: 0 });
    expect(s.decodeTps).toBeCloseTo(100, 5);
    expect(s.e2eTps).toBeCloseTo(101 / 1.2, 5);
    expect(s.tokensEstimated).toBe(false);
  });
});
