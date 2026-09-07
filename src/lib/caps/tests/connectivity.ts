import { normalizeUsage } from "@/lib/llm/types";
import { msg, type CapTestDef } from "../types";
import { SIMPLE_SYSTEM, fromError, ok, responseEvidence, shortNonce } from "../helpers";

export const connectivityTests: CapTestDef[] = [
  {
    id: "connectivity.basic",
    suite: "connectivity",
    async run(ctx) {
      const nonce = shortNonce();
      const req = {
        messages: [
          { role: "system" as const, content: SIMPLE_SYSTEM(ctx.lang, nonce) },
          { role: "user" as const, content: ctx.lang === "zh" ? `请只回复一个词：OK（标记 ${nonce}）` : `Reply with exactly one word: OK (tag ${nonce})` },
        ],
      };
      try {
        const res = await ctx.send(req, { maxTokens: 512 });
        const u = normalizeUsage(res.usage);
        const notes = [];
        if (!res.usage) notes.push(msg("cap.conn.no_usage"));
        if (res.reasoning || (u.reasoningTokens ?? 0) > 0) notes.push(msg("cap.conn.reasoning_seen"));
        for (const a of res.adjustments ?? []) notes.push(msg("cap.conn.adjusted", { change: a }));
        if (res.streamed && !(res.adjustments ?? []).some((a) => a.includes("stream"))) notes.push(msg("cap.conn.stream_fallback"));
        if (res.model && res.model !== ctx.model.model) notes.push(msg("cap.conn.model_mismatch", { requested: ctx.model.model, got: res.model }));
        const facts = { latencyMs: Math.round(res.timing.totalMs), promptTokens: u.promptTokens, completionTokens: u.completionTokens, responseModel: res.model ?? null };
        const swapped = (res.adjustments ?? []).find((a) => a.includes("max_"));
        const suggestion = swapped ? { label: swapped.split(" → ")[1], extraBody: {} as Record<string, unknown>, maxTokensParam: swapped.split(" → ")[1] as "max_tokens" | "max_completion_tokens" } : undefined;
        if (!res.content.trim() && !res.toolCalls.length) return ok("partial", msg("cap.conn.empty"), { request: req, response: responseEvidence(res), notes, facts }, suggestion ? { suggestions: [suggestion] } : {});
        return ok("pass", msg("cap.conn.ok", { ms: Math.round(res.timing.totalMs) }), { request: req, response: responseEvidence(res), notes, facts }, suggestion ? { suggestions: [suggestion] } : {});
      } catch (e) {
        return fromError(e, { request: req });
      }
    },
  },
];
