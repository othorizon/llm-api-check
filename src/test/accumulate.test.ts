import { describe, expect, it } from "vitest";
import { StreamAccumulator, parseNonStreamResponse, splitThinkTags } from "@/lib/llm/accumulate";
import { normalizeUsage } from "@/lib/llm/types";

describe("splitThinkTags", () => {
  it("separates think blocks", () => {
    expect(splitThinkTags("<think>hmm</think>Hello")).toEqual({ content: "Hello", reasoning: "hmm", open: false });
    expect(splitThinkTags("<think>partial")).toEqual({ content: "", reasoning: "partial", open: true });
    expect(splitThinkTags("plain")).toEqual({ content: "plain", reasoning: "", open: false });
  });
});

describe("StreamAccumulator", () => {
  it("assembles content, reasoning and tool calls from deltas", () => {
    const acc = new StreamAccumulator();
    let f = acc.push({ choices: [{ delta: { reasoning_content: "think " } }] });
    expect(f.reasoning).toBe(true);
    f = acc.push({ choices: [{ delta: { content: "Hel" } }] });
    expect(f.content).toBe(true);
    acc.push({ choices: [{ delta: { content: "lo" } }] });
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "get_weather", arguments: '{"loc' } }] } }] });
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ation":"Tokyo"}' } }] } }] });
    acc.push({ choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { completion_tokens: 9 } });
    const r = acc.finalize();
    expect(r.content).toBe("Hello");
    expect(r.reasoning).toBe("think");
    expect(r.reasoningSource).toBe("reasoning_content");
    expect(r.toolCalls).toHaveLength(1);
    expect(JSON.parse(r.toolCalls[0].function.arguments)).toEqual({ location: "Tokyo" });
    expect(r.finishReason).toBe("tool_calls");
    expect(r.usage?.completion_tokens).toBe(9);
  });
  it("treats <think> streamed inside content as reasoning", () => {
    const acc = new StreamAccumulator();
    const f1 = acc.push({ choices: [{ delta: { content: "<think>rea" } }] });
    expect(f1.reasoning).toBe(true);
    expect(f1.content).toBe(false);
    acc.push({ choices: [{ delta: { content: "soning</think>" } }] });
    const f3 = acc.push({ choices: [{ delta: { content: "Answer" } }] });
    expect(f3.content).toBe(true);
    const r = acc.finalize();
    expect(r.content).toBe("Answer");
    expect(r.reasoning).toBe("reasoning");
    expect(r.reasoningSource).toBe("think_tag");
  });
});

describe("parseNonStreamResponse / normalizeUsage", () => {
  it("detects hidden reasoning tokens and DeepSeek cache fields", () => {
    const r = parseNonStreamResponse({ choices: [{ message: { role: "assistant", content: "42" }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 40 }, prompt_cache_hit_tokens: 64 } });
    expect(r.reasoningSource).toBe("hidden_tokens");
    const u = normalizeUsage(r.usage);
    expect(u.reasoningTokens).toBe(40);
    expect(u.cachedTokens).toBe(64);
    expect(u.cachedSource).toBe("prompt_cache_hit_tokens");
  });
});
