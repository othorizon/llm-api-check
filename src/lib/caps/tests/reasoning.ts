import { normalizeUsage, type CompletionResult } from "@/lib/llm/types";
import { LlmError, toLlmError } from "@/lib/llm/errors";
import { REASONING_DIALECTS } from "../reasoning-dialects";
import { msg, type CapTestDef, type Msg } from "../types";
import { SIMPLE_SYSTEM, fromError, hasReasoning, ok, randInt, reasoningAmount, responseEvidence, shortNonce } from "../helpers";

const REASONING_MAX_TOKENS = 4096;

function puzzle(lang: "en" | "zh") {
  const a = randInt(12, 97);
  const b = randInt(12, 97);
  const c = randInt(100, 999);
  const answer = a * b - c;
  const nonce = shortNonce();
  const text = lang === "zh" ? `计算 ${a} × ${b} − ${c}，只回复最终数字。（标记 ${nonce}）` : `Compute ${a} × ${b} − ${c}. Reply with only the final number. (tag ${nonce})`;
  return { text, answer, nonce };
}

function baseMessages(lang: "en" | "zh") {
  const p = puzzle(lang);
  return { messages: [{ role: "system" as const, content: SIMPLE_SYSTEM(lang, p.nonce) }, { role: "user" as const, content: p.text }], answer: p.answer };
}

function amountFacts(res: CompletionResult) {
  const u = normalizeUsage(res.usage);
  const amt = reasoningAmount(res);
  return { reasoningTokens: u.reasoningTokens, reasoningChars: res.reasoning.length, reasoningSource: res.reasoningSource, amount: amt.value, unit: amt.unit, latencyMs: Math.round(res.timing.totalMs), completionTokens: u.completionTokens };
}

export const reasoningTests: CapTestDef[] = [
  {
    id: "reasoning.default",
    suite: "reasoning",
    async run(ctx) {
      const { messages, answer } = baseMessages(ctx.lang);
      const req = { messages };
      try {
        const res = await ctx.send(req, { maxTokens: REASONING_MAX_TOKENS, noExtraBody: true });
        const facts = { ...amountFacts(res), correct: res.content.replace(/[,\s]/g, "").includes(String(answer)) };
        const notes: Msg[] = [];
        if (Object.keys(ctx.model.extraBody ?? {}).length) notes.push(msg("cap.reasoning.extra_body_ignored"));
        if (hasReasoning(res)) {
          const src = res.reasoningSource ?? "unknown";
          const summary = src === "hidden_tokens" ? msg("cap.reasoning.hidden", { tokens: facts.reasoningTokens ?? 0 }) : msg("cap.reasoning.visible", { field: src === "think_tag" ? "<think> tags" : src, amount: facts.amount, unit: facts.unit });
          return ok("pass", summary, { request: req, response: responseEvidence(res), notes, facts });
        }
        return ok("fail", msg("cap.reasoning.none"), { request: req, response: responseEvidence(res), notes, facts });
      } catch (e) {
        return fromError(e, { request: req });
      }
    },
  },
  {
    id: "reasoning.effort",
    suite: "reasoning",
    dependsOn: ["reasoning.default"],
    async run(ctx) {
      const rows: (string | number | boolean | null)[][] = [];
      const results: Record<string, { res?: CompletionResult; err?: LlmError }> = {};
      const requests: Record<string, unknown> = {};
      for (const level of ["low", "high"] as const) {
        const { messages } = baseMessages(ctx.lang);
        const req = { messages, reasoning_effort: level };
        requests[level] = req;
        try {
          const res = await ctx.send(req, { maxTokens: REASONING_MAX_TOKENS });
          results[level] = { res };
          const f = amountFacts(res);
          rows.push([level, true, hasReasoning(res), f.amount, f.unit, f.latencyMs]);
        } catch (e) {
          const err = toLlmError(e);
          if (err.kind === "aborted") throw err;
          results[level] = { err };
          rows.push([level, false, null, null, null, null]);
        }
      }
      const table = { columns: ["reasoning_effort", "accepted", "reasoning", "amount", "unit", "latency_ms"], rows };
      const low = results.low;
      const high = results.high;
      const errors = [low?.err, high?.err].filter(Boolean).map((e) => e!.toJSON());
      const evidence = { request: requests, response: { low: low?.res ? responseEvidence(low.res) : null, high: high?.res ? responseEvidence(high.res) : null }, table, error: errors.length ? errors : undefined, notes: [] as Msg[] };
      if (low?.err && high?.err) {
        const bad = low.err.kind === "bad_request" || high.err.kind === "bad_request";
        return ok(bad ? "unsupported" : "error", msg("cap.effort.rejected", { message: (low.err.providerMessage ?? low.err.message).slice(0, 160) }), evidence);
      }
      if (low?.res && high?.res) {
        const aLow = reasoningAmount(low.res).value;
        const aHigh = reasoningAmount(high.res).value;
        const anyReasoning = hasReasoning(low.res) || hasReasoning(high.res);
        if (!anyReasoning) return ok("partial", msg("cap.effort.accepted_no_reasoning"), evidence);
        if (aHigh >= Math.max(aLow * 1.3, aLow + 50)) return ok("pass", msg("cap.effort.effective", { low: aLow, high: aHigh }), evidence);
        if (aLow >= Math.max(aHigh * 1.3, aHigh + 50)) return ok("partial", msg("cap.effort.inverted", { low: aLow, high: aHigh }), evidence);
        return ok("partial", msg("cap.effort.no_effect", { low: aLow, high: aHigh }), evidence);
      }
      const rejected = low?.err ? "low" : "high";
      return ok("partial", msg("cap.effort.partial", { rejected }), evidence);
    },
  },
  {
    id: "reasoning.toggle",
    suite: "reasoning",
    dependsOn: ["reasoning.default"],
    async run(ctx) {
      const baseline = ctx.outcomes.get("reasoning.default");
      if (!baseline || baseline.status === "error" || baseline.status === "unsupported") return ok("skipped", msg("cap.skipped_dependency", { test: "reasoning.default" }));
      const reasonsByDefault = baseline.status === "pass";
      const baselineAmount = Number(baseline.evidence.facts?.amount ?? 0);
      const rows: (string | number | boolean | null)[][] = [];
      const responses: Record<string, unknown> = {};
      const requests: Record<string, unknown> = {};
      const errors: Record<string, unknown> = {};
      const effective: (typeof REASONING_DIALECTS)[number][] = [];
      let anyReduced = false;
      const accepted: string[] = [];
      for (const d of REASONING_DIALECTS) {
        if (ctx.signal.aborted) throw new LlmError("aborted", "aborted");
        const params = reasonsByDefault ? d.disable : d.enable;
        const { messages } = baseMessages(ctx.lang);
        const req = { messages, ...params };
        requests[d.id] = req;
        try {
          const res = await ctx.send(req, { maxTokens: REASONING_MAX_TOKENS, noExtraBody: true });
          responses[d.id] = responseEvidence(res);
          const present = hasReasoning(res);
          const amt = reasoningAmount(res).value;
          accepted.push(d.id);
          let verdict: string;
          if (reasonsByDefault) {
            const ratio = baselineAmount > 0 ? amt / baselineAmount : present ? 1 : 0;
            if (!present || ratio < 0.05) {
              verdict = "disabled";
              effective.push(d);
            } else if (ratio < 0.4) {
              verdict = "reduced";
              anyReduced = true;
            } else verdict = "no effect";
          } else {
            if (present) {
              verdict = "enabled";
              effective.push(d);
            } else verdict = "no effect";
          }
          rows.push([d.label, true, present, amt, Math.round(res.timing.totalMs), verdict]);
        } catch (e) {
          const err = toLlmError(e);
          if (err.kind === "aborted") throw err;
          errors[d.id] = err.toJSON();
          rows.push([d.label, false, null, null, null, err.kind === "bad_request" ? `rejected: ${(err.providerMessage ?? err.message).slice(0, 80)}` : `error: ${err.kind}`]);
        }
      }
      const table = { columns: ["dialect", "accepted", "reasoning", "amount", "latency_ms", "verdict"], rows };
      const evidence = { request: requests, response: responses, error: Object.keys(errors).length ? errors : undefined, table, notes: [] as Msg[], facts: { reasonsByDefault, baselineAmount } };
      if (effective.length) {
        const suggestions = effective.map((d) => ({ label: d.label, extraBody: reasonsByDefault ? d.disable : d.enable }));
        return ok("pass", msg(reasonsByDefault ? "cap.toggle.disable_ok" : "cap.toggle.enable_ok", { n: effective.length, dialects: effective.map((d) => d.label).join("; ") }), evidence, { suggestions });
      }
      if (reasonsByDefault && anyReduced) return ok("partial", msg("cap.toggle.reduced_only"), evidence);
      if (accepted.length === 0) return ok("unsupported", msg("cap.toggle.all_rejected"), evidence);
      return ok("fail", msg(reasonsByDefault ? "cap.toggle.disable_none" : "cap.toggle.enable_none", { n: accepted.length }), evidence);
    },
  },
];
