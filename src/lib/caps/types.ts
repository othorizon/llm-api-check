import type { ClientTarget, SendOptions } from "@/lib/llm/client";
import type { ChatRequest, CompletionResult } from "@/lib/llm/types";
import type { ModelConfig, ModelSnapshot } from "@/lib/store/types";

/** Localisable message: a code looked up in the i18n catalogue plus params. */
export interface Msg {
  code: string;
  params?: Record<string, string | number | boolean | null>;
}
export const msg = (code: string, params?: Msg["params"]): Msg => (params ? { code, params } : { code });

export type CapStatus = "pass" | "partial" | "fail" | "unsupported" | "error" | "skipped" | "na";

export type CapSuiteId = "connectivity" | "reasoning" | "tools" | "structured" | "vision" | "cache" | "compat" | "messages";

/** Which top-level workbench a probe session belongs to. */
export type ProbeKind = "capability" | "messages";

export interface Evidence {
  /** Request body (or bodies) that produced the verdict. */
  request?: unknown;
  /** Response(s), truncated for storage. */
  response?: unknown;
  error?: unknown;
  notes: Msg[];
  /** Free-form structured facts for the detail view (token counts, latencies…). */
  facts?: Record<string, string | number | boolean | null>;
  /** Tabular evidence (e.g. one row per reasoning dialect). */
  table?: { columns: string[]; rows: (string | number | boolean | null)[][] };
}

export interface Suggestion {
  label: string;
  extraBody: Record<string, unknown>;
  maxTokensParam?: "max_tokens" | "max_completion_tokens";
}

export interface CapOutcome {
  testId: string;
  status: CapStatus;
  /** Short verdict. */
  summary: Msg;
  evidence: Evidence;
  durationMs: number;
  startedAt: number;
  /** A model-setting change the user can apply with one click (e.g. the working "disable reasoning" dialect). */
  /** Working parameters the user can copy or apply to the model (e.g. every dialect that disables reasoning). */
  suggestions?: Suggestion[];
}

export interface CapContext {
  model: ModelConfig;
  target: ClientTarget;
  signal: AbortSignal;
  /** Prior outcomes of this model in this session (for dependencies). */
  outcomes: Map<string, CapOutcome>;
  /** Sends a request with model id, extra body and max-tokens param applied. */
  send: (req: Partial<ChatRequest> & { messages: ChatRequest["messages"] }, opts?: SendOptions & { maxTokens?: number; noExtraBody?: boolean; forceStream?: boolean }) => Promise<CompletionResult>;
  /** Language for prompts sent to the model (affects vision/structured prompts). */
  lang: "en" | "zh";
  /** Public origin of this site for URL-based tests (null when not public). */
  publicOrigin: string | null;
}

export interface CapTestDef {
  id: string;
  suite: CapSuiteId;
  /** Test ids that must have run first (same model). */
  dependsOn?: string[];
  run: (ctx: CapContext) => Promise<CapOutcome | Omit<CapOutcome, "testId" | "durationMs" | "startedAt">>;
}

export interface CapConfig {
  suites: Record<CapSuiteId, boolean>;
  lang: "en" | "zh";
  /** Max models tested concurrently. */
  concurrency: number;
}

export const DEFAULT_CAP_CONFIG: CapConfig = {
  suites: { connectivity: true, reasoning: true, tools: true, structured: true, vision: true, cache: true, compat: true, messages: false },
  lang: "en",
  concurrency: 2,
};

export interface CapModelResult {
  modelId: string;
  outcomes: Record<string, CapOutcome>;
  /** Test ids in execution order. */
  order: string[];
}

export const DEFAULT_MESSAGES_CONFIG: CapConfig = {
  suites: { connectivity: true, reasoning: false, tools: false, structured: false, vision: false, cache: false, compat: false, messages: true },
  lang: "en",
  concurrency: 2,
};

export interface CapSession {
  id: string;
  kind: ProbeKind;
  createdAt: number;
  finishedAt: number | null;
  status: "running" | "done" | "aborted" | "error";
  config: CapConfig;
  models: ModelSnapshot[];
  results: Record<string, CapModelResult>;
}

/** Trim big strings so sessions stay small in localStorage. */
export function trimForStorage<T>(value: T, maxString = 1500, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === "string") return (value.length > maxString ? value.slice(0, maxString) + `… [${value.length - maxString} more chars]` : value) as unknown as T;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => trimForStorage(v, maxString, depth + 1)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Never store image payloads.
      if (k === "url" && typeof v === "string" && v.startsWith("data:")) out[k] = `data:… (${v.length} chars)`;
      else out[k] = trimForStorage(v, maxString, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}
