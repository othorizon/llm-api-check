import { chatCompletion, type ClientTarget, type SendOptions } from "./client";
import { LlmError } from "./errors";
import type { ChatRequest, CompletionResult } from "./types";
import type { ModelConfig, ProviderConfig } from "@/lib/store/types";

export interface BoundModel {
  model: ModelConfig;
  provider: ProviderConfig;
  apiKey: string;
}

export function targetFor(bm: BoundModel): ClientTarget {
  return {
    baseUrl: bm.provider.baseUrl,
    apiKey: bm.apiKey,
    authHeader: bm.provider.authHeader,
    authPrefix: bm.provider.authPrefix,
    extraHeaders: bm.provider.extraHeaders,
    timeoutMs: bm.model.timeoutMs ?? 180_000,
  };
}

export interface BuildOptions {
  maxTokens?: number;
  /** Skip the model's configured extra body (used to probe defaults). */
  noExtraBody?: boolean;
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

export function buildRequest(bm: BoundModel, partial: Partial<ChatRequest> & { messages: ChatRequest["messages"] }, opts: BuildOptions = {}): ChatRequest {
  const base: Record<string, unknown> = { model: bm.model.model };
  if (opts.maxTokens != null) base[bm.model.maxTokensParam ?? "max_tokens"] = opts.maxTokens;
  const extra = opts.noExtraBody ? {} : (bm.model.extraBody ?? {});
  // Precedence: test-specific params > model extra body > defaults.
  const merged = deepMerge(deepMerge(base, extra), partial as Record<string, unknown>);
  if (merged.stream) merged.stream_options = merged.stream_options ?? { include_usage: true };
  else delete merged.stream_options;
  return merged as ChatRequest;
}

const STREAM_ONLY_RE = /stream/i;

/** Max-tokens parameter names learned at runtime (model id -> param), so one 400 fixes the whole session. */
const learnedMaxTokensParam = new Map<string, ModelConfig["maxTokensParam"]>();

function otherMaxTokensParam(p: ModelConfig["maxTokensParam"]): ModelConfig["maxTokensParam"] {
  return p === "max_tokens" ? "max_completion_tokens" : "max_tokens";
}

/**
 * Send a request for a bound model, with two automatic repairs:
 *  - if the endpoint rejects `max_tokens` in favour of `max_completion_tokens` (or vice versa), the
 *    other name is used and remembered for this model;
 *  - if the endpoint refuses non-streaming calls (some thinking models do), retry once in streaming mode.
 * Repairs are listed in `result.adjustments` so probes can surface them.
 */
export async function sendBound(bm: BoundModel, partial: Partial<ChatRequest> & { messages: ChatRequest["messages"] }, opts: SendOptions & BuildOptions & { forceStream?: boolean } = {}): Promise<CompletionResult> {
  const target = targetFor(bm);
  const learned = learnedMaxTokensParam.get(bm.model.id);
  const effective: BoundModel = learned && learned !== bm.model.maxTokensParam ? { ...bm, model: { ...bm.model, maxTokensParam: learned } } : bm;
  const adjustments: string[] = learned && learned !== bm.model.maxTokensParam ? [`${bm.model.maxTokensParam} → ${learned}`] : [];
  let req = buildRequest(effective, { ...partial, ...(opts.forceStream ? { stream: true } : {}) }, opts);
  const send = async (r: ChatRequest) => {
    const res = await chatCompletion(target, r, opts);
    if (adjustments.length) res.adjustments = [...(res.adjustments ?? []), ...adjustments];
    return res;
  };
  try {
    return await send(req);
  } catch (e) {
    if (!(e instanceof LlmError) || e.kind !== "bad_request") throw e;
    const message = e.providerMessage ?? "";
    // Wrong max-tokens parameter name for this model.
    const current = effective.model.maxTokensParam;
    if (opts.maxTokens != null && current in req && /max_tokens|max_completion_tokens/i.test(message)) {
      const other = otherMaxTokensParam(current);
      learnedMaxTokensParam.set(bm.model.id, other);
      adjustments.push(`${current} → ${other}`);
      const { [current]: _drop, ...rest } = req as Record<string, unknown>;
      void _drop;
      req = { ...(rest as ChatRequest), [other]: opts.maxTokens };
      try {
        return await send(req);
      } catch (e2) {
        if (!(e2 instanceof LlmError) || e2.kind !== "bad_request") throw e2;
        if (!(!req.stream && STREAM_ONLY_RE.test(e2.providerMessage ?? ""))) throw e2;
      }
    }
    if (!req.stream && STREAM_ONLY_RE.test(message)) {
      adjustments.push("non-stream → stream");
      return send({ ...req, stream: true, stream_options: { include_usage: true } });
    }
    throw e;
  }
}

/** The max-tokens parameter that actually worked for a model during this session (if learned). */
export function learnedMaxTokens(modelId: string) {
  return learnedMaxTokensParam.get(modelId) ?? null;
}
