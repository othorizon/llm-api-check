import { addressSpaceOf, isMixedContent } from "./network";

/** Classified errors so the UI can give actionable guidance. */
export type LlmErrorKind =
  | "network" // fetch threw: CORS, DNS, offline, mixed content
  | "auth" // 401/403
  | "not_found" // 404 (wrong base URL / unknown model)
  | "bad_request" // 400/422 – usually an unsupported parameter
  | "rate_limit" // 429
  | "server" // 5xx
  | "timeout"
  | "aborted"
  | "parse" // could not parse the response
  | "unknown";

export class LlmError extends Error {
  kind: LlmErrorKind;
  status: number | null;
  /** Provider error body (parsed if JSON). */
  body: unknown;
  /** Best-effort provider message. */
  providerMessage: string | null;
  /** Provider error code / type if present. */
  code: string | null;
  retryAfterMs: number | null;

  constructor(kind: LlmErrorKind, message: string, opts: { status?: number | null; body?: unknown; providerMessage?: string | null; code?: string | null; retryAfterMs?: number | null; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "LlmError";
    this.kind = kind;
    this.status = opts.status ?? null;
    this.body = opts.body;
    this.providerMessage = opts.providerMessage ?? null;
    this.code = opts.code ?? null;
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }

  /** True if the provider explicitly rejected the request (4xx that is not auth/rate-limit). */
  get isRejection() {
    return this.kind === "bad_request" || this.kind === "not_found";
  }

  toJSON() {
    return { kind: this.kind, status: this.status, message: this.message, providerMessage: this.providerMessage, code: this.code, body: this.body };
  }
}

export function extractProviderMessage(body: unknown): { message: string | null; code: string | null } {
  if (!body || typeof body !== "object") return { message: typeof body === "string" ? body.slice(0, 500) : null, code: null };
  const b = body as any;
  const err = b.error ?? b;
  if (typeof err === "string") return { message: err.slice(0, 500), code: null };
  const message = typeof err?.message === "string" ? err.message : typeof b.message === "string" ? b.message : typeof b.msg === "string" ? b.msg : typeof b.detail === "string" ? b.detail : null;
  const code = err?.code != null ? String(err.code) : err?.type != null ? String(err.type) : b.code != null ? String(b.code) : null;
  return { message: message ? message.slice(0, 500) : null, code };
}

export function classifyStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 422 || status === 415 || status === 405) return "bad_request";
  if (status >= 500) return "server";
  return "unknown";
}

export function toLlmError(e: unknown, context: { url?: string } = {}): LlmError {
  if (e instanceof LlmError) return e;
  if (e && typeof e === "object" && (e as any).name === "AbortError") return new LlmError("aborted", "Request aborted", { cause: e });
  if (e instanceof TypeError) {
    // fetch() rejects with TypeError for CORS, DNS, offline, mixed content, blocked requests.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (!offline && context.url && isMixedContent(context.url)) {
      const local = addressSpaceOf(new URL(context.url).hostname) === "local";
      return new LlmError("network", local ? "Blocked by the browser: plain http:// local-network API called from an HTTPS page (mixed content / local network access)." : "Blocked by the browser: plain http:// API called from an HTTPS page (mixed content).", { cause: e, code: local ? "mixed_content_local" : "mixed_content" });
    }
    return new LlmError("network", offline ? "You appear to be offline." : "Network error: the browser could not reach the API (likely CORS, DNS, or a blocked/mixed-content request).", { cause: e });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new LlmError("unknown", msg, { cause: e });
}

/** Heuristic: does this rejection look like "unknown/unsupported parameter <name>"? */
export function mentionsParam(err: LlmError, param: string): boolean {
  const hay = `${err.providerMessage ?? ""} ${JSON.stringify(err.body ?? "")}`.toLowerCase();
  return hay.includes(param.toLowerCase());
}
