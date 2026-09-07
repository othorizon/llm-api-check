import { StreamAccumulator, parseNonStreamResponse } from "./accumulate";
import { LlmError, classifyStatus, extractProviderMessage, toLlmError, mentionsParam } from "./errors";
import { iterateSse } from "./sse";
import { fetchWithHints } from "./network";
import type { ChatRequest, CompletionResult, Timing } from "./types";

export interface ClientTarget {
  baseUrl: string;
  apiKey: string;
  /** Header used for the API key. Default "Authorization" with "Bearer " prefix. */
  authHeader?: string;
  authPrefix?: string;
  extraHeaders?: Record<string, string>;
  /** Milliseconds before we give up on a request. */
  timeoutMs?: number;
}

export interface SendOptions {
  signal?: AbortSignal;
  /** Called for every streamed chunk (after parsing). */
  onChunk?: (info: { flags: { content: boolean; reasoning: boolean; toolCall: boolean }; acc: StreamAccumulator; elapsedMs: number }) => void;
  /** If the provider rejects stream_options we retry once without it (default true). */
  retryWithoutStreamOptions?: boolean;
  /** Retry once on 429/5xx (default false). */
  retryOnRateLimit?: boolean;
}

export function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  return `${b}/${path.replace(/^\/+/, "")}`;
}

export function buildHeaders(target: ClientTarget, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (target.apiKey) {
    const name = target.authHeader?.trim() || "Authorization";
    const prefix = target.authPrefix ?? (name.toLowerCase() === "authorization" ? "Bearer " : "");
    headers[name] = `${prefix}${target.apiKey}`;
  }
  for (const [k, v] of Object.entries(target.extraHeaders ?? {})) if (k.trim()) headers[k.trim()] = v;
  for (const [k, v] of Object.entries(extra ?? {})) headers[k] = v;
  return headers;
}

async function readErrorBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function retryAfterMs(res: Response): number | null {
  const ra = res.headers.get("retry-after");
  if (!ra) return null;
  const n = Number(ra);
  if (Number.isFinite(n)) return n * 1000;
  const t = Date.parse(ra);
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null;
}

/**
 * Send a chat completion request. Returns a normalised result with precise timing.
 * Throws LlmError on failure.
 */
export async function chatCompletion(target: ClientTarget, request: ChatRequest, opts: SendOptions = {}): Promise<CompletionResult> {
  const url = joinUrl(target.baseUrl, "chat/completions");
  const attempt = async (req: ChatRequest, retriesLeft: { streamOpts: boolean; rate: boolean }): Promise<CompletionResult> => {
    const controller = new AbortController();
    const timeout = target.timeoutMs ?? 120_000;
    const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeout);
    const onOuterAbort = () => controller.abort(opts.signal?.reason);
    if (opts.signal) {
      if (opts.signal.aborted) throw new LlmError("aborted", "Request aborted");
      opts.signal.addEventListener("abort", onOuterAbort, { once: true });
    }
    const t0 = performance.now();
    const startAt = Date.now();
    const timing: Timing = { startAt, headersMs: null, firstTokenMs: null, firstContentMs: null, firstReasoningMs: null, firstToolCallMs: null, totalMs: 0 };
    try {
      let res: Response;
      try {
        res = await fetchWithHints(url, { method: "POST", headers: buildHeaders(target), body: JSON.stringify(req), signal: controller.signal, mode: "cors", credentials: "omit", cache: "no-store" });
      } catch (e) {
        if (controller.signal.aborted && (controller.signal.reason as any)?.name === "TimeoutError") throw new LlmError("timeout", `Request timed out after ${timeout} ms`);
        throw toLlmError(e, { url });
      }
      timing.headersMs = performance.now() - t0;
      if (!res.ok) {
        const body = await readErrorBody(res);
        const { message, code } = extractProviderMessage(body);
        const err = new LlmError(classifyStatus(res.status), `HTTP ${res.status}${message ? `: ${message}` : ""}`, { status: res.status, body, providerMessage: message, code, retryAfterMs: retryAfterMs(res) });
        // Provider does not know stream_options -> retry without it.
        if (err.kind === "bad_request" && req.stream_options && retriesLeft.streamOpts && (mentionsParam(err, "stream_options") || mentionsParam(err, "include_usage"))) {
          const { stream_options: _drop, ...rest } = req;
          void _drop;
          return attempt(rest, { ...retriesLeft, streamOpts: false });
        }
        if ((err.kind === "rate_limit" || err.kind === "server") && retriesLeft.rate && opts.retryOnRateLimit) {
          const wait = Math.min(err.retryAfterMs ?? 2000, 15_000);
          await new Promise((r) => setTimeout(r, wait));
          return attempt(req, { ...retriesLeft, rate: false });
        }
        throw err;
      }
      const ctype = res.headers.get("content-type") ?? "";
      const isStream = !!req.stream && (ctype.includes("text/event-stream") || !ctype.includes("application/json"));
      if (isStream) {
        if (!res.body) throw new LlmError("parse", "Streaming response had no body");
        const acc = new StreamAccumulator();
        let sawDone = false;
        for await (const ev of iterateSse(res.body, controller.signal)) {
          const data = ev.data.trim();
          if (!data) continue;
          if (data === "[DONE]") {
            sawDone = true;
            continue;
          }
          let json: any;
          try {
            json = JSON.parse(data);
          } catch {
            continue; // ignore non-JSON keep-alives
          }
          if (json && json.error && !json.choices) {
            const { message, code } = extractProviderMessage(json);
            throw new LlmError("bad_request", `Stream error${message ? `: ${message}` : ""}`, { body: json, providerMessage: message, code, status: res.status });
          }
          const flags = acc.push(json);
          const now = performance.now() - t0;
          if ((flags.content || flags.reasoning || flags.toolCall) && timing.firstTokenMs === null) timing.firstTokenMs = now;
          if (flags.content && timing.firstContentMs === null) timing.firstContentMs = now;
          if (flags.reasoning && timing.firstReasoningMs === null) timing.firstReasoningMs = now;
          if (flags.toolCall && timing.firstToolCallMs === null) timing.firstToolCallMs = now;
          opts.onChunk?.({ flags, acc, elapsedMs: now });
        }
        void sawDone;
        timing.totalMs = performance.now() - t0;
        const fin = acc.finalize();
        return { ...fin, raw: acc.lastChunk, chunkCount: acc.chunkCount, timing, streamed: true };
      }
      // Non-stream (or provider ignored stream=true and answered with JSON)
      const text = await res.text();
      timing.totalMs = performance.now() - t0;
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new LlmError("parse", `Response was not JSON (content-type: ${ctype || "unknown"})`, { body: text.slice(0, 2000), status: res.status });
      }
      if (json && json.error && !json.choices) {
        const { message, code } = extractProviderMessage(json);
        throw new LlmError("bad_request", `Provider error${message ? `: ${message}` : ""}`, { body: json, providerMessage: message, code, status: res.status });
      }
      const fin = parseNonStreamResponse(json);
      // Non-stream: the whole answer arrives at once. First-token == total.
      timing.firstTokenMs = timing.totalMs;
      if (fin.content) timing.firstContentMs = timing.totalMs;
      if (fin.reasoning) timing.firstReasoningMs = timing.totalMs;
      if (fin.toolCalls.length) timing.firstToolCallMs = timing.totalMs;
      return { ...fin, raw: json, chunkCount: 0, timing, streamed: false };
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onOuterAbort);
    }
  };
  return attempt(request, { streamOpts: opts.retryWithoutStreamOptions ?? true, rate: true });
}

/** GET /models — optional convenience for the model picker. */
export async function listModels(target: ClientTarget, signal?: AbortSignal): Promise<string[]> {
  const url = joinUrl(target.baseUrl, "models");
  let res: Response;
  try {
    res = await fetchWithHints(url, { headers: buildHeaders(target), signal, mode: "cors", credentials: "omit" });
  } catch (e) {
    throw toLlmError(e, { url });
  }
  if (!res.ok) {
    const body = await readErrorBody(res);
    const { message, code } = extractProviderMessage(body);
    throw new LlmError(classifyStatus(res.status), `HTTP ${res.status}${message ? `: ${message}` : ""}`, { status: res.status, body, providerMessage: message, code });
  }
  const json: any = await res.json().catch(() => null);
  const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : Array.isArray(json) ? json : [];
  return arr.map((m: any) => (typeof m === "string" ? m : m?.id ?? m?.name ?? m?.model)).filter((x: unknown): x is string => typeof x === "string" && x.length > 0).sort();
}
