import type { Msg } from "@/lib/caps/types";
import type { ModelSnapshot } from "@/lib/store/types";

export type RunMode = "stream" | "non_stream";
/** miss = every request starts with fresh random content; hit = identical prompt after a warm-up request. */
export type CacheCondition = "miss" | "hit";
export type CacheMode = "miss" | "hit" | "compare";
export type PromptSize = "short" | "medium" | "long";
export type PromptLang = "en" | "zh";

export type PromptSource = "generated" | "custom";

export interface PerfConfig {
  /** Measured runs per (mode × cache condition). */
  runs: number;
  modes: { stream: boolean; nonStream: boolean };
  cacheMode: CacheMode;
  /** generated = random topic/filler of the chosen size; custom = the user's own text, sent as the user message. */
  promptSource: PromptSource;
  customPrompt: string;
  promptSize: PromptSize;
  promptLang: PromptLang;
  /** true = follow the page language until the user picks one explicitly. */
  promptLangAuto: boolean;
  maxTokens: number;
  /** Pause between consecutive requests (ms). */
  intervalMs: number;
  /** Pause after the warm-up request so the provider can build the cache (ms). */
  cacheWarmDelayMs: number;
  /** Reasoning dialect id (see reasoning-dialects.ts) whose "disable" parameters are sent with every request; null sends nothing. */
  disableReasoning: string | null;
}

export const PERF_CONFIG_VERSION = 4;

export const DEFAULT_PERF_CONFIG: PerfConfig = {
  runs: 3,
  modes: { stream: true, nonStream: false },
  cacheMode: "miss",
  promptSource: "generated",
  customPrompt: "",
  promptSize: "long",
  promptLang: "en",
  promptLangAuto: true,
  maxTokens: 256,
  intervalMs: 500,
  cacheWarmDelayMs: 3000,
  disableReasoning: "thinking_type",
};

export interface RunSample {
  id: string;
  modelId: string;
  mode: RunMode;
  cache: CacheCondition;
  index: number;
  startedAt: number;
  /** Warm-up requests populate the cache and are excluded from statistics. */
  warmup?: boolean;
  /** The provider rejected the disable-reasoning parameters; the request was re-sent without them. */
  reasoningParamDropped?: boolean;
  ok: boolean;
  error?: { kind: string; message: string; status?: number | null };
  /** Time to first token of any kind (reasoning, content or tool call). */
  ttftMs: number | null;
  /** Time to first visible content token. */
  ttfcMs: number | null;
  firstReasoningMs: number | null;
  totalMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  cachedSource: string | null;
  reasoningTokens: number | null;
  tokensEstimated: boolean;
  /** completion tokens / (total - first token) — generation speed once streaming starts. */
  decodeTps: number | null;
  /** completion tokens / total time. */
  e2eTps: number | null;
  chunkCount: number;
  contentChars: number;
  reasoningChars: number;
  finishReason: string | null;
}

export interface Stats {
  n: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  stdev: number;
}

export interface ModeStats {
  n: number;
  ok: number;
  ttft: Stats | null;
  ttfc: Stats | null;
  total: Stats | null;
  decodeTps: Stats | null;
  e2eTps: Stats | null;
  completionTokens: Stats | null;
  reasoningTokens: Stats | null;
  promptTokens: number | null;
  /** Median cached prompt tokens reported by the provider (null when never reported). */
  cachedTokens: number | null;
  cachedSource: string | null;
  estimated: boolean;
  /** Median gap between the first reasoning token and the first content token (ms). */
  reasoningDelayMs: number | null;
}

/** Statistics for one cache condition. */
export interface ConditionStats {
  stream: ModeStats | null;
  nonStream: ModeStats | null;
}

/** Miss-vs-hit comparison, available in "compare" mode. */
export interface CacheComparison {
  promptTokens: number | null;
  cachedTokens: number | null;
  cachedSource: string | null;
  hitRatio: number | null;
  reported: boolean;
  /** 1 − hit/miss of the median streaming TTFT (positive = faster when cached). */
  ttftImprovement: number | null;
  /** Same for the median non-streaming latency (falls back to streaming total). */
  totalImprovement: number | null;
}

export type ScenarioId = "voice" | "chat" | "agent" | "batch";
export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ScenarioScore {
  id: ScenarioId;
  score: number | null;
  grade: Grade | null;
  reasons: Msg[];
}

export interface PerfModelResult {
  modelId: string;
  samples: RunSample[];
  miss: ConditionStats | null;
  hit: ConditionStats | null;
  comparison: CacheComparison | null;
  /** Which condition the scenario scores were derived from. */
  scoredFrom: CacheCondition | null;
  scores: ScenarioScore[];
}

export interface PerfSession {
  id: string;
  kind: "performance";
  version: number;
  createdAt: number;
  finishedAt: number | null;
  status: "running" | "done" | "aborted" | "error";
  config: PerfConfig;
  models: ModelSnapshot[];
  results: Record<string, PerfModelResult>;
}
