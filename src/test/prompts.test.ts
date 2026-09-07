import { describe, expect, it } from "vitest";
import { buildCachePrefix, buildPerfPrompt, cacheQuestion, filler, makeRng } from "@/lib/perf/prompts";
import { estimateTokens } from "@/lib/llm/tokens";

describe("prompts", () => {
  it("randomises every request in miss mode and stays identical in hit mode", () => {
    const a = buildPerfPrompt(makeRng(1), "en", "short", 200, { randomizeEveryRequest: true });
    const b = buildPerfPrompt(makeRng(2), "en", "short", 200, { randomizeEveryRequest: true });
    expect(a.nonce).not.toBe(b.nonce);
    // timestamp + nonce at the very start of the system prompt
    expect(String(a.messages[0].content)).toMatch(/^Session \d{4}-\d{2}-\d{2}T[^ ]+ [a-z0-9]{10}\./);
    const h1 = buildPerfPrompt(makeRng(1), "en", "short", 200, { randomizeEveryRequest: false });
    const h2 = buildPerfPrompt(makeRng(1), "en", "short", 200, { randomizeEveryRequest: false });
    expect(h1.messages).toEqual(h2.messages);
    expect(String(h1.messages[0].content).startsWith(`Session ${h1.nonce}.`)).toBe(true);
  });
  it("generates filler near the requested token budget in both languages", () => {
    const en = filler(makeRng(3), "en", 2000);
    const zh = filler(makeRng(3), "zh", 2000);
    expect(estimateTokens(en)).toBeGreaterThan(1800);
    expect(estimateTokens(en)).toBeLessThan(2400);
    expect(estimateTokens(zh)).toBeGreaterThan(1800);
    expect(estimateTokens(zh)).toBeLessThan(2400);
  });
  it("cache prefix is fixed per session while questions vary", () => {
    const rng = makeRng(9);
    const p = buildCachePrefix(rng, "en", 2500);
    expect(p.approxTokens).toBeGreaterThan(2000);
    expect(cacheQuestion(rng, "en", 0)).not.toBe(cacheQuestion(rng, "en", 1));
  });
});
