import { normalizeUsage } from "@/lib/llm/types";
import type { CompletionResult, ChatMessage } from "@/lib/llm/types";
import { estimateTokens } from "@/lib/llm/tokens";
import { LlmError, mentionsParam, toLlmError } from "@/lib/llm/errors";
import { REASONING_DIALECTS } from "@/lib/caps/reasoning-dialects";
import { sendBound, type BoundModel } from "@/lib/llm/model-client";
import { uid } from "@/lib/utils/id";
import { buildCustomPrompt, buildPerfPrompt, makeRng, randomSeed } from "./prompts";
import { computeScores } from "./scoring";
import { median, summarize } from "./stats";
import type { CacheComparison, CacheCondition, ConditionStats, ModeStats, PerfConfig, PerfModelResult, RunMode, RunSample } from "./types";

export type PerfPhase = "warmup" | "miss" | "hit" | "done";

export interface PerfProgress {
  total: number;
  done: number;
  phase: PerfPhase;
  currentModelId: string | null;
  currentMode: RunMode | null;
  currentCache: CacheCondition | null;
  currentIndex: number | null;
  /** Milliseconds the runner is deliberately sleeping (interval / warm-up delay). */
  waitingMs: number | null;
}

export interface LiveState {
  modelId: string;
  mode: RunMode;
  cache: CacheCondition;
  index: number;
  elapsedMs: number;
  approxTokens: number;
  preview: string;
  reasoningPreview: string;
}

export interface PerfRunInput {
  config: PerfConfig;
  models: BoundModel[];
  signal: AbortSignal;
  onSample: (s: RunSample) => void;
  onProgress: (p: PerfProgress) => void;
  onLive?: (l: LiveState | null) => void;
  seed?: number;
}

export interface Job {
  bm: BoundModel;
  mode: RunMode;
  cache: CacheCondition;
  index: number;
  warmup?: boolean;
  phase: PerfPhase;
  /** Sleep before starting this job (ms), instead of the regular interval. */
  delayBefore?: number;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Extra body parameters implied by the config's disable-reasoning choice. */
export function reasoningParams(config: Pick<PerfConfig, "disableReasoning">): Record<string, unknown> {
  const d = config.disableReasoning ? REASONING_DIALECTS.find((x) => x.id === config.disableReasoning) : null;
  return d ? { ...d.disable } : {};
}

/** True when a 4xx complains about one of the top-level keys we added for the reasoning dialect. */
export function isReasoningParamRejection(err: LlmError, params: Record<string, unknown>): boolean {
  if (err.kind !== "bad_request") return false;
  return Object.keys(params).some((k) => mentionsParam(err, k));
}

export function sampleFromResult(res: CompletionResult, base: Pick<RunSample, "id" | "modelId" | "mode" | "cache" | "index" | "startedAt" | "warmup">): RunSample {
  const u = normalizeUsage(res.usage);
  let completionTokens = u.completionTokens;
  let estimated = false;
  if (completionTokens == null) {
    completionTokens = estimateTokens(res.content) + estimateTokens(res.reasoning);
    estimated = true;
  }
  const ttft = res.streamed ? res.timing.firstTokenMs : null;
  const ttfc = res.streamed ? res.timing.firstContentMs : null;
  const total = res.timing.totalMs;
  const decodeTps = res.streamed && ttft != null && total > ttft + 1 && completionTokens > 1 ? (completionTokens - 1) / ((total - ttft) / 1000) : null;
  const e2eTps = total > 0 && completionTokens > 0 ? completionTokens / (total / 1000) : null;
  return {
    ...base,
    ok: true,
    ttftMs: ttft,
    ttfcMs: ttfc,
    firstReasoningMs: res.streamed ? res.timing.firstReasoningMs : null,
    totalMs: total,
    promptTokens: u.promptTokens,
    completionTokens,
    cachedTokens: u.cachedTokens,
    cachedSource: u.cachedSource,
    reasoningTokens: u.reasoningTokens,
    tokensEstimated: estimated,
    decodeTps,
    e2eTps,
    chunkCount: res.chunkCount,
    contentChars: res.content.length,
    reasoningChars: res.reasoning.length,
    finishReason: res.finishReason,
  };
}

export function modeStats(samples: RunSample[]): ModeStats {
  const ok = samples.filter((s) => s.ok);
  const delays = ok.map((s) => (s.ttfcMs != null && s.firstReasoningMs != null && s.firstReasoningMs < s.ttfcMs ? s.ttfcMs - s.firstReasoningMs : null));
  const reported = ok.some((s) => s.cachedTokens != null);
  return {
    n: samples.length,
    ok: ok.length,
    ttft: summarize(ok.map((s) => s.ttftMs)),
    ttfc: summarize(ok.map((s) => s.ttfcMs)),
    total: summarize(ok.map((s) => s.totalMs)),
    decodeTps: summarize(ok.map((s) => s.decodeTps)),
    e2eTps: summarize(ok.map((s) => s.e2eTps)),
    completionTokens: summarize(ok.map((s) => s.completionTokens)),
    reasoningTokens: summarize(ok.map((s) => s.reasoningTokens)),
    promptTokens: median(ok.map((s) => s.promptTokens)),
    cachedTokens: reported ? median(ok.map((s) => s.cachedTokens ?? 0)) : null,
    cachedSource: ok.find((s) => s.cachedSource)?.cachedSource ?? null,
    estimated: ok.some((s) => s.tokensEstimated),
    reasoningDelayMs: median(delays),
  };
}

function conditionStats(samples: RunSample[], cache: CacheCondition): ConditionStats | null {
  const mine = samples.filter((s) => s.cache === cache && !s.warmup);
  if (mine.length === 0) return null;
  const st = mine.filter((s) => s.mode === "stream");
  const ns = mine.filter((s) => s.mode === "non_stream");
  return { stream: st.length ? modeStats(st) : null, nonStream: ns.length ? modeStats(ns) : null };
}

export function compareConditions(miss: ConditionStats | null, hit: ConditionStats | null, hitSamples: RunSample[]): CacheComparison | null {
  if (!miss || !hit) return null;
  const hitOk = hitSamples.filter((s) => s.ok && !s.warmup);
  const reported = hitOk.some((s) => s.cachedTokens != null);
  const cachedTokens = reported ? median(hitOk.map((s) => s.cachedTokens ?? 0)) : null;
  const promptTokens = median(hitOk.map((s) => s.promptTokens));
  const hitRatio = cachedTokens != null && promptTokens ? Math.min(1, cachedTokens / promptTokens) : null;
  const ratio = (a: number | null | undefined, b: number | null | undefined) => (a && b && a > 0 ? 1 - b / a : null);
  const ttftImprovement = ratio(miss.stream?.ttft?.p50, hit.stream?.ttft?.p50);
  const totalImprovement = ratio(miss.nonStream?.total?.p50, hit.nonStream?.total?.p50) ?? ratio(miss.stream?.total?.p50, hit.stream?.total?.p50);
  return { promptTokens, cachedTokens, cachedSource: hitOk.find((s) => s.cachedSource)?.cachedSource ?? null, hitRatio, reported, ttftImprovement, totalImprovement };
}

export function aggregate(modelId: string, samples: RunSample[]): PerfModelResult {
  const miss = conditionStats(samples, "miss");
  const hit = conditionStats(samples, "hit");
  const comparison = compareConditions(miss, hit, samples.filter((s) => s.cache === "hit"));
  const scoredFrom: CacheCondition | null = miss ? "miss" : hit ? "hit" : null;
  const basis = scoredFrom === "miss" ? miss : hit;
  return { modelId, samples, miss, hit, comparison, scoredFrom, scores: computeScores(basis?.stream ?? null, basis?.nonStream ?? null, scoredFrom) };
}

/** Build the request schedule: round-robin across models; the hit block starts with one warm-up per model. */
export function buildJobs(config: PerfConfig, models: BoundModel[]): Job[] {
  const jobs: Job[] = [];
  const modes: RunMode[] = [...(config.modes.stream ? (["stream"] as RunMode[]) : []), ...(config.modes.nonStream ? (["non_stream"] as RunMode[]) : [])];
  const block = (cache: CacheCondition) => {
    for (let i = 0; i < config.runs; i++) for (const mode of modes) for (const bm of models) jobs.push({ bm, mode, cache, index: i, phase: cache });
  };
  if (config.cacheMode === "miss" || config.cacheMode === "compare") block("miss");
  if (config.cacheMode === "hit" || config.cacheMode === "compare") {
    const warmMode: RunMode = modes[0] ?? "stream";
    for (const bm of models) jobs.push({ bm, mode: warmMode, cache: "hit", index: -1, warmup: true, phase: "warmup" });
    const firstMeasured = jobs.length;
    block("hit");
    if (jobs[firstMeasured]) jobs[firstMeasured].delayBefore = config.cacheWarmDelayMs;
  }
  return jobs;
}

/** Requests per model for the estimate shown in the UI. */
export function requestsPerModel(config: PerfConfig): number {
  const modes = (config.modes.stream ? 1 : 0) + (config.modes.nonStream ? 1 : 0);
  const blocks = config.cacheMode === "compare" ? 2 : 1;
  const warm = config.cacheMode === "miss" ? 0 : 1;
  return config.runs * modes * blocks + warm;
}

export async function runPerformance(input: PerfRunInput): Promise<Record<string, PerfModelResult>> {
  const { config, models, signal, onSample, onProgress, onLive } = input;
  const seed = input.seed ?? randomSeed();
  const rng = makeRng(seed);
  const jobs = buildJobs(config, models);
  const samples: Record<string, RunSample[]> = Object.fromEntries(models.map((m) => [m.model.id, []]));
  /** In "hit" mode every request of a model reuses exactly the same messages. */
  const fixedPrompt = new Map<string, ChatMessage[]>();
  const targetWords = Math.round(config.maxTokens * (config.promptLang === "zh" ? 1.2 : 0.9));
  const custom = config.promptSource === "custom" ? config.customPrompt.trim() : "";
  const makePrompt = (randomizeEveryRequest: boolean) => (custom ? buildCustomPrompt(rng, custom, { randomizeEveryRequest }) : buildPerfPrompt(rng, config.promptLang, config.promptSize, targetWords, { randomizeEveryRequest }));
  const extras = reasoningParams(config);
  /** Models whose provider rejected the reasoning parameters: send without them from then on. */
  const droppedFor = new Set<string>();
  let done = 0;
  const progress = (extra: Partial<PerfProgress>) => onProgress({ total: jobs.length, done, phase: "miss", currentModelId: null, currentMode: null, currentCache: null, currentIndex: null, waitingMs: null, ...extra });

  for (let j = 0; j < jobs.length; j++) {
    const job = jobs[j];
    if (signal.aborted) break;
    const wait = job.delayBefore ?? (j > 0 ? config.intervalMs : 0);
    const current = { phase: job.phase, currentModelId: job.bm.model.id, currentMode: job.mode, currentCache: job.cache, currentIndex: job.index };
    if (wait > 0) {
      progress({ ...current, waitingMs: wait });
      try {
        await sleep(wait, signal);
      } catch {
        break;
      }
    }
    progress(current);
    const modelId = job.bm.model.id;
    const base = { id: uid("run"), modelId, mode: job.mode, cache: job.cache, index: job.index, startedAt: Date.now(), warmup: job.warmup };
    let messages: ChatMessage[];
    if (job.cache === "hit") {
      let fixed = fixedPrompt.get(modelId);
      if (!fixed) {
        fixed = makePrompt(false).messages;
        fixedPrompt.set(modelId, fixed);
      }
      messages = fixed;
    } else {
      messages = makePrompt(true).messages;
    }
    const stream = job.mode === "stream";
    let lastLive = 0;
    const sendOpts = {
      signal,
      maxTokens: config.maxTokens,
      retryOnRateLimit: true,
      onChunk: ({ acc, elapsedMs }: { acc: { rawContent: string; reasoning: string }; elapsedMs: number }) => {
          if (!onLive) return;
          const now = performance.now();
          if (now - lastLive < 80) return;
          lastLive = now;
          onLive({ modelId, mode: job.mode, cache: job.cache, index: job.index, elapsedMs, approxTokens: estimateTokens(acc.rawContent) + estimateTokens(acc.reasoning), preview: acc.rawContent.slice(-240), reasoningPreview: acc.reasoning.slice(-160) });
      },
    };
    try {
      let res: CompletionResult;
      let dropped = droppedFor.has(modelId);
      const withExtras = dropped ? {} : extras;
      try {
        res = await sendBound(job.bm, { messages, stream, ...withExtras }, sendOpts);
      } catch (e) {
        const err = toLlmError(e);
        if (!dropped && Object.keys(extras).length && isReasoningParamRejection(err, extras)) {
          droppedFor.add(modelId);
          dropped = true;
          res = await sendBound(job.bm, { messages, stream }, sendOpts);
        } else throw e;
      }
      const sample = sampleFromResult(res, base);
      if (dropped && Object.keys(extras).length) sample.reasoningParamDropped = true;
      samples[modelId].push(sample);
      onSample(sample);
    } catch (e) {
      const err = toLlmError(e);
      if (err.kind === "aborted") break;
      const sample: RunSample = {
        ...base,
        ok: false,
        error: { kind: err.kind, message: err.providerMessage ?? err.message, status: err.status },
        ttftMs: null,
        ttfcMs: null,
        firstReasoningMs: null,
        totalMs: 0,
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        cachedSource: null,
        reasoningTokens: null,
        tokensEstimated: false,
        decodeTps: null,
        e2eTps: null,
        chunkCount: 0,
        contentChars: 0,
        reasoningChars: 0,
        finishReason: null,
      };
      samples[modelId].push(sample);
      onSample(sample);
    } finally {
      onLive?.(null);
    }
    done++;
    progress(current);
  }
  progress({ phase: "done" });
  const out: Record<string, PerfModelResult> = {};
  for (const m of models) out[m.model.id] = aggregate(m.model.id, samples[m.model.id]);
  return out;
}
