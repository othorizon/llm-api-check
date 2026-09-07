import { LlmError, toLlmError } from "@/lib/llm/errors";
import { normalizeUsage, type CompletionResult, type ToolCall } from "@/lib/llm/types";
import { msg, type CapOutcome, type CapStatus, type Evidence, type Msg } from "./types";

export type Partial0 = Omit<CapOutcome, "testId" | "durationMs" | "startedAt">;

export function ok(status: CapStatus, summary: Msg, evidence: Partial<Evidence> = {}, extra: Partial<Partial0> = {}): Partial0 {
  return { status, summary, evidence: { notes: [], ...evidence }, ...extra };
}

/** Turn a thrown error into an outcome. Aborts propagate. */
export function fromError(e: unknown, evidence: Partial<Evidence> = {}): Partial0 {
  const err = toLlmError(e);
  if (err.kind === "aborted") throw err;
  const status: CapStatus = err.kind === "bad_request" ? "unsupported" : "error";
  return {
    status,
    summary: status === "unsupported" ? msg("cap.rejected", { status: err.status, message: err.providerMessage ?? err.message }) : msg("cap.error", { kind: err.kind, message: err.providerMessage ?? err.message }),
    evidence: { notes: [], ...evidence, error: err.toJSON() },
  };
}

export function isAbort(e: unknown) {
  return e instanceof LlmError ? e.kind === "aborted" : (e as any)?.name === "AbortError";
}

/** Compact, storage-friendly view of a response. */
export function responseEvidence(res: CompletionResult) {
  const u = normalizeUsage(res.usage);
  return {
    content: res.content,
    reasoning: res.reasoning ? res.reasoning.slice(0, 600) + (res.reasoning.length > 600 ? "…" : "") : "",
    reasoningSource: res.reasoningSource,
    toolCalls: res.toolCalls,
    finishReason: res.finishReason,
    refusal: res.refusal,
    usage: res.usage,
    streamed: res.streamed,
    chunkCount: res.chunkCount,
    timing: { totalMs: Math.round(res.timing.totalMs), firstTokenMs: res.timing.firstTokenMs == null ? null : Math.round(res.timing.firstTokenMs), firstContentMs: res.timing.firstContentMs == null ? null : Math.round(res.timing.firstContentMs) },
    normalizedUsage: u,
    model: res.model,
  };
}

export function hasReasoning(res: CompletionResult): boolean {
  const u = normalizeUsage(res.usage);
  return res.reasoning.trim().length > 0 || (u.reasoningTokens ?? 0) > 0;
}

/** Size of the reasoning effort: tokens if reported, else characters. */
export function reasoningAmount(res: CompletionResult): { value: number; unit: "tokens" | "chars" } {
  const u = normalizeUsage(res.usage);
  if (u.reasoningTokens != null && u.reasoningTokens > 0) return { value: u.reasoningTokens, unit: "tokens" };
  return { value: res.reasoning.trim().length, unit: "chars" };
}

/** Parse JSON from model output; tolerates ```json fences and surrounding prose. */
export function parseJsonLenient(text: string): { value: unknown; fenced: boolean; exact: boolean } | null {
  const t = text.trim();
  try {
    return { value: JSON.parse(t), fenced: false, exact: true };
  } catch {
    /* continue */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return { value: JSON.parse(fence[1].trim()), fenced: true, exact: false };
    } catch {
      /* continue */
    }
  }
  const start = t.search(/[{[]/);
  if (start !== -1) {
    const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (last > start) {
      try {
        return { value: JSON.parse(t.slice(start, last + 1)), fenced: false, exact: false };
      } catch {
        /* give up */
      }
    }
  }
  return null;
}

export function parseToolArgs(tc: ToolCall): Record<string, unknown> | null {
  try {
    const v = JSON.parse(tc.function.arguments || "{}");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function shortNonce(): string {
  return Math.random().toString(36).slice(2, 8);
}

export const SIMPLE_SYSTEM = (lang: "en" | "zh", nonce: string) => (lang === "zh" ? `会话 ${nonce}。你是一个简洁的助手。` : `Session ${nonce}. You are a concise assistant.`);
