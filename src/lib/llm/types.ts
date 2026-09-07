/** OpenAI Chat Completions-compatible wire types (only what we need). */

export type Role = "system" | "developer" | "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
export interface ImagePart {
  type: "image_url";
  image_url: { url: string; detail?: "low" | "high" | "auto" };
}
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string;
  [extra: string]: unknown;
}

export interface ToolCall {
  id?: string;
  type?: "function";
  index?: number;
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

export type ToolChoice =
  | "none"
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: { name: string; description?: string; schema: Record<string, unknown>; strict?: boolean };
    };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  seed?: number;
  n?: number;
  logprobs?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  parallel_tool_calls?: boolean;
  response_format?: ResponseFormat;
  reasoning_effort?: string;
  [extra: string]: unknown;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; audio_tokens?: number; [k: string]: unknown };
  completion_tokens_details?: { reasoning_tokens?: number; [k: string]: unknown };
  // DeepSeek dialect
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  // Anthropic-ish dialects surfaced by some gateways
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  [k: string]: unknown;
}

/** Normalised, provider-agnostic view of a completed response. */
export interface CompletionResult {
  /** Visible assistant text (reasoning / <think> stripped). */
  content: string;
  /** Reasoning text if the provider exposes it (reasoning_content / reasoning / <think>). */
  reasoning: string;
  /** Where the reasoning came from. */
  reasoningSource: "reasoning_content" | "reasoning" | "think_tag" | "hidden_tokens" | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  refusal: string | null;
  usage: Usage | null;
  /** The raw JSON of the non-stream response or the last chunk (for evidence). */
  raw: unknown;
  /** Stream chunks received (0 for non-stream). */
  chunkCount: number;
  timing: Timing;
  /** True if the response came via streaming. */
  streamed: boolean;
  model?: string;
  id?: string;
  /** Automatic request adjustments made by the client (e.g. parameter swaps, stream fallback). */
  adjustments?: string[];
}

export interface Timing {
  /** performance.now() based, all in ms relative to request start */
  startAt: number; // epoch ms (Date.now) for display
  headersMs: number | null;
  /** First streamed chunk that carried any delta (content, reasoning or tool call). */
  firstTokenMs: number | null;
  /** First chunk with visible content. */
  firstContentMs: number | null;
  firstReasoningMs: number | null;
  firstToolCallMs: number | null;
  totalMs: number;
}

export interface NormalizedUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  /** Which field the cached tokens came from (for evidence). */
  cachedSource: string | null;
}

export function normalizeUsage(u: Usage | null | undefined): NormalizedUsage {
  if (!u) return { promptTokens: null, completionTokens: null, cachedTokens: null, reasoningTokens: null, cachedSource: null };
  let cached: number | null = null;
  let cachedSource: string | null = null;
  const ptd = u.prompt_tokens_details;
  if (ptd && typeof ptd.cached_tokens === "number") {
    cached = ptd.cached_tokens;
    cachedSource = "prompt_tokens_details.cached_tokens";
  } else if (typeof u.prompt_cache_hit_tokens === "number") {
    cached = u.prompt_cache_hit_tokens;
    cachedSource = "prompt_cache_hit_tokens";
  } else if (typeof u.cache_read_input_tokens === "number") {
    cached = u.cache_read_input_tokens;
    cachedSource = "cache_read_input_tokens";
  } else if (typeof (u as Record<string, unknown>).cached_tokens === "number") {
    cached = (u as Record<string, number>).cached_tokens;
    cachedSource = "cached_tokens";
  }
  const ctd = u.completion_tokens_details;
  const reasoning = ctd && typeof ctd.reasoning_tokens === "number" ? ctd.reasoning_tokens : null;
  return {
    promptTokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
    completionTokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
    cachedTokens: cached,
    reasoningTokens: reasoning,
    cachedSource,
  };
}
