import { normalizeUsage } from "@/lib/llm/types";
import type { CompletionResult, ChatMessage } from "@/lib/llm/types";
import { estimateTokens } from "@/lib/llm/tokens";
import { toLlmError } from "@/lib/llm/errors";
import { sendBound, type BoundModel } from "@/lib/llm/model-client";
import { uid } from "@/lib/utils/id";
import { buildCachePrefix, buildPerfPrompt, cacheQuestion, makeRng, randomSeed } from "./prompts";
import { computeScores } from "./scoring";
import { median, summarize } from "./stats";
import type { CacheStats, ModeStats, PerfConfig, PerfModelResult, RunMode, RunSample } from "./types";

export interface PerfProgress {
  total: number;
  done: number;
  phase: "warmup" | "stream" | "non_stream" | "cache" | "done";
  currentModelId: string | null;
  currentMode: RunMode | null;
  currentIndex: number | null;
  /** Milliseconds the runner is deliberately sleeping (interval / cache warm delay). */
  waitingMs: number | null;
}

export interface LiveState {
  modelId: string;
  mode: RunMode;
  index: number;
  elapsedMs: number;
  firstTokenMs: number | null;
  firstContentMs: number | null;
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

interface Job {
  bm: BoundModel;
  mode: RunMode;
  index: number;
  warmup?: boolean;
  phase: PerfProgress["phase"];
  /** Sleep before starting this job (ms). */
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

export function sampleFromResult(res: CompletionResult, base: Pick<RunSample, "id" | "modelId" | "mode" | "index" | "startedAt" | "warmup">): RunSample {
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
    estimated: ok.some((s) => s.tokensEstimated),
    reasoningDelayMs: median(delays),
  };
}

export function cacheStats(samples: RunSample[]): CacheStats | null {
  const cold = samples.filter((s) => s.mode === "cache_cold");
  const warm = samples.filter((s) => s.mode === "cache_warm");
  if (cold.length === 0 && warm.length === 0) return null;
  const cs = modeStats(cold);
  const ws = modeStats(warm);
  const warmOk = warm.filter((s) => s.ok);
  const coldOk = cold.filter((s) => s.ok);
  const promptTokens = median(warmOk.map((s) => s.promptTokens)) ?? median(coldOk.map((s) => s.promptTokens));
  const reported = warmOk.some((s) => s.cachedTokens != null);
  const cachedTokensWarm = reported ? median(warmOk.map((s) => s.cachedTokens ?? 0)) : null;
  const cachedTokensCold = coldOk.some((s) => s.cachedTokens != null) ? median(coldOk.map((s) => s.cachedTokens ?? 0)) : null;
  const hitRatio = cachedTokensWarm != null && promptTokens ? Math.min(1, cachedTokensWarm / promptTokens) : null;
  const ttftImprovement = cs.ttft && ws.ttft && cs.ttft.p50 > 0 ? 1 - ws.ttft.p50 / cs.ttft.p50 : null;
  const totalImprovement = cs.total && ws.total && cs.total.p50 > 0 ? 1 - ws.total.p50 / cs.total.p50 : null;
  return { cold: cs, warm: ws, promptTokens, cachedTokensWarm, cachedTokensCold, cachedSource: warmOk.find((s) => s.cachedSource)?.cachedSource ?? null, hitRatio, reported, ttftImprovement, totalImprovement };
}

export function aggregate(modelId: string, samples: RunSample[]): PerfModelResult {
  const measured = samples.filter((s) => !s.warmup);
  const streamS = measured.filter((s) => s.mode === "stream");
  const nonS = measured.filter((s) => s.mode === "non_stream");
  const stream = streamS.length ? modeStats(streamS) : null;
  const nonStream = nonS.length ? modeStats(nonS) : null;
  const cache = cacheStats(measured);
  return { modelId, samples, stream, nonStream, cache, scores: computeScores(stream, nonStream, cache) };
}

export function buildJobs(config: PerfConfig, models: BoundModel[]): Job[] {
  const jobs: Job[] = [];
  if (config.warmup) for (const bm of models) jobs.push({ bm, mode: "stream", index: -1, warmup: true, phase: "warmup" });
  for (let i = 0; i < config.runs; i++) {
    if (config.modes.stream) for (const bm of models) jobs.push({ bm, mode: "stream", index: i, phase: "stream" });
    if (config.modes.nonStream) for (const bm of models) jobs.push({ bm, mode: "non_stream", index: i, phase: "non_stream" });
  }
  if (config.modes.cache) {
    for (const bm of models) jobs.push({ bm, mode: "cache_cold", index: 0, phase: "cache" });
    for (let r = 1; r <= Math.max(1, config.cacheRepeats); r++) {
      models.forEach((bm, mi) => jobs.push({ bm, mode: "cache_warm", index: r, phase: "cache", delayBefore: r === 1 && mi === 0 ? config.cacheWarmDelayMs : undefined }));
    }
  }
  return jobs;
}

export async function runPerformance(input: PerfRunInput): Promise<Record<string, PerfModelResult>> {
  const { config, models, signal, onSample, onProgress, onLive } = input;
  const seed = input.seed ?? randomSeed();
  const rng = makeRng(seed);
  const jobs = buildJobs(config, models);
  const samples: Record<string, RunSample[]> = Object.fromEntries(models.map((m) => [m.model.id, []]));
  const cachePrefix = new Map<string, ReturnType<typeof buildCachePrefix>>();
  const targetWords = Math.round(config.maxTokens * (config.promptLang === "zh" ? 1.2 : 0.9));
  let done = 0;
  const progress = (extra: Partial<PerfProgress>) => onProgress({ total: jobs.length, done, phase: "stream", currentModelId: null, currentMode: null, currentIndex: null, waitingMs: null, ...extra });

  for (let j = 0; j < jobs.length; j++) {
    const job = jobs[j];
    if (signal.aborted) break;
    const wait = job.delayBefore ?? (j > 0 ? config.intervalMs : 0);
    if (wait > 0) {
      progress({ phase: job.phase, waitingMs: wait, currentModelId: job.bm.model.id, currentMode: job.mode, currentIndex: job.index });
      try {
        await sleep(wait, signal);
      } catch {
        break;
      }
    }
    progress({ phase: job.phase, currentModelId: job.bm.model.id, currentMode: job.mode, currentIndex: job.index });
    const modelId = job.bm.model.id;
    const base = { id: uid("run"), modelId, mode: job.mode, index: job.index, startedAt: Date.now(), warmup: job.warmup };
    let messages: ChatMessage[];
    const isCache = job.mode === "cache_cold" || job.mode === "cache_warm";
    if (isCache) {
      let prefix = cachePrefix.get(modelId);
      if (!prefix) {
        prefix = buildCachePrefix(rng, config.promptLang, config.cachePrefixTokens);
        cachePrefix.set(modelId, prefix);
      }
      messages = [
        { role: "system", content: prefix.system },
        { role: "user", content: cacheQuestion(rng, config.promptLang, job.index) },
      ];
    } else {
      messages = buildPerfPrompt(rng, config.promptLang, config.promptSize, targetWords).messages;
    }
    const stream = job.mode !== "non_stream";
    let lastLive = 0;
    try {
      const res = await sendBound(job.bm, { messages, stream }, {
        signal,
        maxTokens: isCache ? Math.min(config.maxTokens, 128) : config.maxTokens,
        retryOnRateLimit: true,
        onChunk: ({ acc, elapsedMs }) => {
          if (!onLive) return;
          const now = performance.now();
          if (now - lastLive < 80) return;
          lastLive = now;
          onLive({
            modelId,
            mode: job.mode,
            index: job.index,
            elapsedMs,
            firstTokenMs: null,
            firstContentMs: null,
            approxTokens: estimateTokens(acc.rawContent) + estimateTokens(acc.reasoning),
            preview: acc.rawContent.slice(-240),
            reasoningPreview: acc.reasoning.slice(-160),
          });
        },
      });
      const sample = sampleFromResult(res, base);
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
    progress({ phase: job.phase, currentModelId: job.bm.model.id, currentMode: job.mode, currentIndex: job.index });
  }
  progress({ phase: "done" });
  const out: Record<string, PerfModelResult> = {};
  for (const m of models) out[m.model.id] = aggregate(m.model.id, samples[m.model.id]);
  return out;
}
