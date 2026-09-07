import { normalizeUsage, type ChatMessage, type CompletionResult } from "@/lib/llm/types";
import { toLlmError } from "@/lib/llm/errors";
import { buildCachePrefix, cacheQuestion, makeRng, randomSeed } from "@/lib/perf/prompts";
import { msg, type CapTestDef, type Msg } from "../types";
import { fromError, ok, responseEvidence } from "../helpers";

const PREFIX_TOKENS = 2500;
const WARM_DELAY_MS = 3000;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

function timingFacts(res: CompletionResult) {
  const u = normalizeUsage(res.usage);
  return { ttftMs: res.timing.firstTokenMs == null ? null : Math.round(res.timing.firstTokenMs), totalMs: Math.round(res.timing.totalMs), promptTokens: u.promptTokens, cachedTokens: u.cachedTokens, cachedSource: u.cachedSource };
}

export const cacheTests: CapTestDef[] = [
  {
    id: "cache.auto",
    suite: "cache",
    async run(ctx) {
      const rng = makeRng(randomSeed());
      const prefix = buildCachePrefix(rng, ctx.lang, PREFIX_TOKENS);
      const mk = (i: number): ChatMessage[] => [
        { role: "system", content: prefix.system },
        { role: "user", content: cacheQuestion(rng, ctx.lang, i) },
      ];
      const reqCold = { messages: mk(0), stream: true };
      let cold: CompletionResult;
      try {
        cold = await ctx.send(reqCold, { maxTokens: 128, forceStream: true });
      } catch (e) {
        return fromError(e, { request: reqCold });
      }
      await sleep(WARM_DELAY_MS, ctx.signal);
      const reqWarm = { messages: mk(1), stream: true };
      let warm: CompletionResult;
      try {
        warm = await ctx.send(reqWarm, { maxTokens: 128, forceStream: true });
      } catch (e) {
        return fromError(e, { request: reqWarm, response: { cold: responseEvidence(cold) } });
      }
      const c = timingFacts(cold);
      const w = timingFacts(warm);
      const notes: Msg[] = [];
      const facts = { prefixTokensApprox: prefix.approxTokens, coldTtftMs: c.ttftMs, warmTtftMs: w.ttftMs, coldTotalMs: c.totalMs, warmTotalMs: w.totalMs, coldCachedTokens: c.cachedTokens, warmCachedTokens: w.cachedTokens, promptTokens: w.promptTokens, cachedSource: w.cachedSource };
      const ev = { request: { cold: { ...reqCold, messages: [{ role: "system", content: prefix.system.slice(0, 400) + "…" }, reqCold.messages[1]] }, warm: { ...reqWarm, messages: [{ role: "system", content: "(same prefix)" }, reqWarm.messages[1]] } }, response: { cold: responseEvidence(cold), warm: responseEvidence(warm) }, notes, facts };
      const ttftImprove = c.ttftMs && w.ttftMs ? 1 - w.ttftMs / c.ttftMs : null;
      if ((c.cachedTokens ?? 0) > 0) notes.push(msg("cap.cache.cold_hit", { n: c.cachedTokens! }));
      if (w.cachedTokens != null) {
        if (w.cachedTokens > 0) {
          const ratio = w.promptTokens ? Math.min(1, w.cachedTokens / w.promptTokens) : null;
          if (ttftImprove != null) notes.push(msg("cap.cache.ttft_delta", { cold: c.ttftMs!, warm: w.ttftMs!, pct: Math.round(ttftImprove * 100) }));
          return ok("pass", msg("cap.cache.hit", { cached: w.cachedTokens, prompt: w.promptTokens ?? "?", pct: ratio == null ? "?" : Math.round(ratio * 100), source: w.cachedSource ?? "usage" }), ev);
        }
        if (ttftImprove != null && ttftImprove > 0.3) return ok("partial", msg("cap.cache.zero_but_faster", { pct: Math.round(ttftImprove * 100) }), ev);
        return ok("fail", msg("cap.cache.zero", { source: w.cachedSource ?? "usage" }), ev);
      }
      if (ttftImprove != null && ttftImprove > 0.3) return ok("partial", msg("cap.cache.unreported_faster", { pct: Math.round(ttftImprove * 100) }), ev);
      return ok("fail", msg("cap.cache.unreported"), ev);
    },
  },
  {
    id: "cache.explicit",
    suite: "cache",
    dependsOn: ["cache.auto"],
    async run(ctx) {
      const rng = makeRng(randomSeed());
      const prefix = buildCachePrefix(rng, ctx.lang, PREFIX_TOKENS);
      const mk = (i: number): ChatMessage[] => [
        { role: "system", content: [{ type: "text", text: prefix.system, cache_control: { type: "ephemeral" } }] },
        { role: "user", content: cacheQuestion(rng, ctx.lang, i) },
      ];
      const req1 = { messages: mk(0), stream: true };
      let first: CompletionResult;
      try {
        first = await ctx.send(req1, { maxTokens: 128, forceStream: true });
      } catch (e) {
        const err = toLlmError(e);
        if (err.kind === "aborted") throw err;
        const out = fromError(err, { request: { ...req1, messages: [{ role: "system", content: "[text part with cache_control, ~2.5k tokens]" }, req1.messages[1]] } });
        if (err.kind === "bad_request") out.summary = msg("cap.cache.explicit_rejected", { message: (err.providerMessage ?? err.message).slice(0, 160) });
        return out;
      }
      await sleep(WARM_DELAY_MS, ctx.signal);
      const req2 = { messages: mk(1), stream: true };
      let second: CompletionResult;
      try {
        second = await ctx.send(req2, { maxTokens: 128, forceStream: true });
      } catch (e) {
        return fromError(e, { request: req2 });
      }
      const f = timingFacts(first);
      const s = timingFacts(second);
      const u1 = first.usage ?? {};
      const creation = typeof (u1 as any).cache_creation_input_tokens === "number" ? (u1 as any).cache_creation_input_tokens : null;
      const facts = { firstTtftMs: f.ttftMs, secondTtftMs: s.ttftMs, firstCachedTokens: f.cachedTokens, secondCachedTokens: s.cachedTokens, cacheCreationTokens: creation, cachedSource: s.cachedSource };
      const ev = { request: { first: { ...req1, messages: [{ role: "system", content: "[text part with cache_control: ephemeral, ~2.5k tokens]" }, req1.messages[1]] } }, response: { first: responseEvidence(first), second: responseEvidence(second) }, notes: [] as Msg[], facts };
      if ((s.cachedTokens ?? 0) > 0 || creation != null) return ok("pass", msg("cap.cache.explicit_ok", { cached: s.cachedTokens ?? 0 }), ev);
      return ok("partial", msg("cap.cache.explicit_accepted"), ev);
    },
  },
];
