import type { Msg } from "@/lib/caps/types";
import type { ModelSnapshot } from "@/lib/store/types";

export type RunMode = "stream" | "non_stream" | "cache_cold" | "cache_warm";
export type PromptSize = "short" | "medium" | "long";
export type PromptLang = "en" | "zh";

export interface PerfConfig {
  runs: number;
  modes: { stream: boolean; nonStream: boolean; cache: boolean };
  promptSize: PromptSize;
  promptLang: PromptLang;
  maxTokens: number;
  warmup: boolean;
  /** Pause between consecutive requests (ms). */
  intervalMs: number;
  /** Pause between the cold and the first warm cache request (ms). */
  cacheWarmDelayMs: number;
  /** Number of warm (repeat) cache requests. */
  cacheRepeats: number;
  /** Approximate size of the shared cache prefix in tokens. */
  cachePrefixTokens: number;
}

export const DEFAULT_PERF_CONFIG: PerfConfig = {
  runs: 3,
  modes: { stream: true, nonStream: true, cache: true },
  promptSize: "short",
  promptLang: "en",
  maxTokens: 256,
  warmup: true,
  intervalMs: 500,
  cacheWarmDelayMs: 3000,
  cacheRepeats: 2,
  cachePrefixTokens: 2500,
};

export interface RunSample {
  id: string;
  modelId: string;
  mode: RunMode;
  index: number;
  startedAt: number;
  warmup?: boolean;
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
  estimated: boolean;
  /** Median gap between the first reasoning token and the first content token (ms). */
  reasoningDelayMs: number | null;
}

export interface CacheStats {
  cold: ModeStats;
  warm: ModeStats;
  promptTokens: number | null;
  cachedTokensWarm: number | null;
  cachedTokensCold: number | null;
  cachedSource: string | null;
  hitRatio: number | null;
  reported: boolean;
  ttftImprovement: number | null;
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
  stream: ModeStats | null;
  nonStream: ModeStats | null;
  cache: CacheStats | null;
  scores: ScenarioScore[];
}

export interface PerfSession {
  id: string;
  kind: "performance";
  createdAt: number;
  finishedAt: number | null;
  status: "running" | "done" | "aborted" | "error";
  config: PerfConfig;
  models: ModelSnapshot[];
  results: Record<string, PerfModelResult>;
}
