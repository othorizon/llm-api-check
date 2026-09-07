import { listModels } from "@/lib/llm/client";
import { toLlmError } from "@/lib/llm/errors";
import type { ChatRequest, CompletionResult } from "@/lib/llm/types";
import { msg, type CapTestDef, type Msg } from "../types";
import { SIMPLE_SYSTEM, fromError, ok, responseEvidence, shortNonce } from "../helpers";

function okMessages(lang: "en" | "zh") {
  const nonce = shortNonce();
  return [
    { role: "system" as const, content: SIMPLE_SYSTEM(lang, nonce) },
    { role: "user" as const, content: lang === "zh" ? `请只回复：OK（标记 ${nonce}）` : `Reply with just: OK (tag ${nonce})` },
  ];
}

/** A generic "does the endpoint accept this parameter" probe. */
function paramProbe(id: string, params: Partial<ChatRequest>, opts: { check?: (res: CompletionResult) => { status: "pass" | "partial" | "fail"; summary: Msg } | null; maxTokens?: number; forceStream?: boolean; system?: false } = {}): CapTestDef {
  return {
    id,
    suite: "compat",
    async run(ctx) {
      const req = { messages: okMessages(ctx.lang), ...params };
      try {
        const res = await ctx.send(req, { maxTokens: opts.maxTokens, forceStream: opts.forceStream });
        const ev = { request: req, response: responseEvidence(res), notes: [] as Msg[] };
        const verdict = opts.check?.(res);
        if (verdict) return ok(verdict.status, verdict.summary, ev);
        return ok("pass", msg("cap.compat.accepted"), ev);
      } catch (e) {
        return fromError(e, { request: req });
      }
    },
  };
}

export const compatTests: CapTestDef[] = [
  {
    id: "compat.max_tokens",
    suite: "compat",
    async run(ctx) {
      const req = { messages: okMessages(ctx.lang), max_tokens: 64 };
      try {
        // Explicitly bypass the configured param name so both variants are probed.
        const res = await ctx.send(req, { maxTokens: undefined });
        return ok("pass", msg("cap.compat.accepted"), { request: req, response: responseEvidence(res) });
      } catch (e) {
        return fromError(e, { request: req });
      }
    },
  },
  {
    id: "compat.max_completion_tokens",
    suite: "compat",
    async run(ctx) {
      const req = { messages: okMessages(ctx.lang), max_completion_tokens: 64 };
      try {
        const res = await ctx.send(req, { maxTokens: undefined });
        return ok("pass", msg("cap.compat.accepted"), { request: req, response: responseEvidence(res) });
      } catch (e) {
        return fromError(e, { request: req });
      }
    },
  },
  paramProbe("compat.temperature", { temperature: 0.2, top_p: 0.9 }, { maxTokens: 64 }),
  paramProbe("compat.penalties", { presence_penalty: 0.1, frequency_penalty: 0.1 }, { maxTokens: 64 }),
  paramProbe("compat.stop", { stop: ["STOPWORD"] }, { maxTokens: 64 }),
  paramProbe("compat.seed", { seed: 42 }, { maxTokens: 64 }),
  paramProbe("compat.n", { n: 2 }, {
    maxTokens: 64,
    check: (res) => {
      const choices = Array.isArray((res.raw as any)?.choices) ? (res.raw as any).choices.length : res.streamed ? null : 0;
      if (choices === 2) return { status: "pass", summary: msg("cap.compat.n_ok") };
      if (choices === null) return { status: "partial", summary: msg("cap.compat.n_unverified") };
      return { status: "partial", summary: msg("cap.compat.n_single", { n: choices }) };
    },
  }),
  paramProbe("compat.logprobs", { logprobs: true, top_logprobs: 2 }, {
    maxTokens: 64,
    check: (res) => {
      const lp = (res.raw as any)?.choices?.[0]?.logprobs;
      if (lp && (Array.isArray(lp.content) ? lp.content.length > 0 : true)) return { status: "pass", summary: msg("cap.compat.logprobs_ok") };
      return { status: "partial", summary: msg("cap.compat.logprobs_missing") };
    },
  }),
  paramProbe("compat.stream_usage", { stream: true }, {
    maxTokens: 64,
    forceStream: true,
    check: (res) => {
      if (res.usage && typeof res.usage.completion_tokens === "number") return { status: "pass", summary: msg("cap.compat.stream_usage_ok") };
      return { status: "fail", summary: msg("cap.compat.stream_usage_missing") };
    },
  }),
  {
    id: "compat.developer_role",
    suite: "compat",
    async run(ctx) {
      const nonce = shortNonce();
      const req = { messages: [{ role: "developer" as const, content: SIMPLE_SYSTEM(ctx.lang, nonce) }, { role: "user" as const, content: `OK? (tag ${nonce})` }] };
      try {
        const res = await ctx.send(req, { maxTokens: 64 });
        return ok("pass", msg("cap.compat.accepted"), { request: req, response: responseEvidence(res) });
      } catch (e) {
        return fromError(e, { request: req });
      }
    },
  },
  {
    id: "compat.models_endpoint",
    suite: "compat",
    async run(ctx) {
      try {
        const models = await listModels(ctx.target, ctx.signal);
        const listed = models.includes(ctx.model.model);
        const notes: Msg[] = listed ? [] : [msg("cap.compat.model_not_listed", { model: ctx.model.model })];
        return ok("pass", msg("cap.compat.models_ok", { n: models.length }), { response: { count: models.length, sample: models.slice(0, 40) }, notes, facts: { count: models.length, listed } });
      } catch (e) {
        const err = toLlmError(e);
        if (err.kind === "aborted") throw err;
        return fromError(err, { request: { method: "GET", path: "/models" } });
      }
    },
  },
];
