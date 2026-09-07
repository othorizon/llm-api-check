import { LlmError, toLlmError, mentionsParam } from "@/lib/llm/errors";
import type { ChatMessage, CompletionResult, ToolDefinition } from "@/lib/llm/types";
import { msg, type CapTestDef, type Msg } from "../types";
import { SIMPLE_SYSTEM, fromError, ok, parseToolArgs, pick, randInt, responseEvidence, shortNonce } from "../helpers";

const CITIES = ["Tokyo", "Paris", "Lima", "Nairobi", "Oslo", "Denver", "Seoul", "Lisbon", "Cairo", "Perth"];
const CITIES_ZH = ["东京", "巴黎", "利马", "内罗毕", "奥斯陆", "丹佛", "首尔", "里斯本", "开罗", "珀斯"];

export const weatherTool = (strict = false): ToolDefinition => ({
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a city.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature unit" },
      },
      required: strict ? ["location", "unit"] : ["location"],
      additionalProperties: false,
    },
    ...(strict ? { strict: true } : {}),
  },
});

const timeTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_local_time",
    description: "Get the current local time in a city.",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
  },
};

function cityPair(lang: "en" | "zh") {
  const i = randInt(0, CITIES.length - 1);
  return { en: CITIES[i], zh: CITIES_ZH[i], display: lang === "zh" ? CITIES_ZH[i] : CITIES[i] };
}

function weatherPrompt(lang: "en" | "zh") {
  const c = cityPair(lang);
  const nonce = shortNonce();
  const messages: ChatMessage[] = [
    { role: "system", content: SIMPLE_SYSTEM(lang, nonce) },
    { role: "user", content: lang === "zh" ? `${c.display}现在天气怎么样？（标记 ${nonce}）` : `What's the weather like in ${c.display} right now? (tag ${nonce})` },
  ];
  return { messages, city: c };
}

function hasCity(args: Record<string, unknown> | null, city: { en: string; zh: string }) {
  const loc = String(args?.location ?? args?.city ?? "").toLowerCase();
  return loc.includes(city.en.toLowerCase()) || loc.includes(city.zh);
}

function evaluateWeatherCall(res: CompletionResult, city: { en: string; zh: string }, req: unknown, extraNotes: Msg[] = []) {
  const ev = { request: req, response: responseEvidence(res), notes: [...extraNotes] as Msg[] };
  if (res.toolCalls.length === 0) return ok("fail", msg("cap.tools.no_call"), ev);
  const tc = res.toolCalls[0];
  const args = parseToolArgs(tc);
  const facts = { toolName: tc.function.name, arguments: tc.function.arguments.slice(0, 300), finishReason: res.finishReason, toolCallId: tc.id ?? null };
  if (tc.function.name !== "get_weather") return ok("partial", msg("cap.tools.wrong_name", { name: tc.function.name }), { ...ev, facts });
  if (!args) return ok("partial", msg("cap.tools.bad_args"), { ...ev, facts });
  if (!hasCity(args, city)) {
    ev.notes.push(msg("cap.tools.city_missing", { city: city.en }));
    return ok("partial", msg("cap.tools.called_wrong_args"), { ...ev, facts });
  }
  if (res.finishReason && res.finishReason !== "tool_calls") ev.notes.push(msg("cap.tools.finish_reason", { reason: res.finishReason }));
  if (!tc.id) ev.notes.push(msg("cap.tools.no_id"));
  return ok("pass", msg("cap.tools.called", { name: tc.function.name }), { ...ev, facts });
}

function toolRejected(e: unknown, req: unknown, paramHint: string) {
  const err = toLlmError(e);
  if (err.kind === "aborted") throw err;
  const out = fromError(err, { request: req });
  if (err.kind === "bad_request" && mentionsParam(err, paramHint)) out.evidence.notes.push(msg("cap.tools.param_rejected", { param: paramHint }));
  return out;
}

export const toolTests: CapTestDef[] = [
  {
    id: "tools.auto",
    suite: "tools",
    async run(ctx) {
      const { messages, city } = weatherPrompt(ctx.lang);
      const req = { messages, tools: [weatherTool()], tool_choice: "auto" as const };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        return evaluateWeatherCall(res, city, req);
      } catch (e) {
        return toolRejected(e, req, "tools");
      }
    },
  },
  {
    id: "tools.streaming",
    suite: "tools",
    dependsOn: ["tools.auto"],
    async run(ctx) {
      const { messages, city } = weatherPrompt(ctx.lang);
      const req = { messages, tools: [weatherTool()], tool_choice: "auto" as const, stream: true };
      try {
        const res = await ctx.send(req, { maxTokens: 1024, forceStream: true });
        const notes: Msg[] = [msg("cap.tools.stream_chunks", { n: res.chunkCount })];
        return evaluateWeatherCall(res, city, req, notes);
      } catch (e) {
        return toolRejected(e, req, "tools");
      }
    },
  },
  {
    id: "tools.required",
    suite: "tools",
    dependsOn: ["tools.auto"],
    async run(ctx) {
      const nonce = shortNonce();
      const req = {
        messages: [
          { role: "system" as const, content: SIMPLE_SYSTEM(ctx.lang, nonce) },
          { role: "user" as const, content: ctx.lang === "zh" ? `你好！（标记 ${nonce}）` : `Hello there! (tag ${nonce})` },
        ],
        tools: [weatherTool(), timeTool],
        tool_choice: "required" as const,
      };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        const ev = { request: req, response: responseEvidence(res), notes: [] as Msg[] };
        if (res.toolCalls.length === 0) return ok("fail", msg("cap.tools.required_ignored"), ev);
        const tc = res.toolCalls[0];
        const args = parseToolArgs(tc);
        if (!args) return ok("partial", msg("cap.tools.bad_args"), ev);
        return ok("pass", msg("cap.tools.forced_ok", { name: tc.function.name }), { ...ev, facts: { toolName: tc.function.name, arguments: tc.function.arguments.slice(0, 200) } });
      } catch (e) {
        return toolRejected(e, req, "tool_choice");
      }
    },
  },
  {
    id: "tools.named",
    suite: "tools",
    dependsOn: ["tools.auto"],
    async run(ctx) {
      const nonce = shortNonce();
      const req = {
        messages: [
          { role: "system" as const, content: SIMPLE_SYSTEM(ctx.lang, nonce) },
          { role: "user" as const, content: ctx.lang === "zh" ? `你好！（标记 ${nonce}）` : `Hello there! (tag ${nonce})` },
        ],
        tools: [weatherTool(), timeTool],
        tool_choice: { type: "function" as const, function: { name: "get_weather" } },
      };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        const ev = { request: req, response: responseEvidence(res), notes: [] as Msg[] };
        if (res.toolCalls.length === 0) return ok("fail", msg("cap.tools.required_ignored"), ev);
        const tc = res.toolCalls[0];
        if (tc.function.name !== "get_weather") return ok("partial", msg("cap.tools.wrong_name", { name: tc.function.name }), ev);
        const args = parseToolArgs(tc);
        if (!args) return ok("partial", msg("cap.tools.bad_args"), ev);
        return ok("pass", msg("cap.tools.forced_ok", { name: tc.function.name }), { ...ev, facts: { arguments: tc.function.arguments.slice(0, 200) } });
      } catch (e) {
        return toolRejected(e, req, "tool_choice");
      }
    },
  },
  {
    id: "tools.parallel",
    suite: "tools",
    dependsOn: ["tools.auto"],
    async run(ctx) {
      const a = cityPair(ctx.lang);
      let b = cityPair(ctx.lang);
      while (b.en === a.en) b = cityPair(ctx.lang);
      const nonce = shortNonce();
      const req = {
        messages: [
          { role: "system" as const, content: SIMPLE_SYSTEM(ctx.lang, nonce) },
          { role: "user" as const, content: ctx.lang === "zh" ? `请同时查询${a.display}和${b.display}的天气。（标记 ${nonce}）` : `Check the weather in both ${a.display} and ${b.display}. (tag ${nonce})` },
        ],
        tools: [weatherTool()],
        tool_choice: "auto" as const,
        parallel_tool_calls: true,
      };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        const ev = { request: req, response: responseEvidence(res), notes: [] as Msg[], facts: { calls: res.toolCalls.length } };
        if (res.toolCalls.length >= 2) return ok("pass", msg("cap.tools.parallel_ok", { n: res.toolCalls.length }), ev);
        if (res.toolCalls.length === 1) return ok("partial", msg("cap.tools.parallel_single"), ev);
        return ok("fail", msg("cap.tools.no_call"), ev);
      } catch (e) {
        return toolRejected(e, req, "parallel_tool_calls");
      }
    },
  },
  {
    id: "tools.roundtrip",
    suite: "tools",
    dependsOn: ["tools.auto"],
    async run(ctx) {
      const { messages, city } = weatherPrompt(ctx.lang);
      const req1 = { messages, tools: [weatherTool()], tool_choice: "auto" as const };
      let first: CompletionResult;
      try {
        first = await ctx.send(req1, { maxTokens: 1024 });
      } catch (e) {
        return toolRejected(e, req1, "tools");
      }
      if (first.toolCalls.length === 0) return ok("skipped", msg("cap.tools.roundtrip_no_call"), { request: req1, response: responseEvidence(first) });
      const tc = first.toolCalls[0];
      const temp = randInt(-5, 35);
      const assistantMsg: ChatMessage = { role: "assistant", content: first.content || null, tool_calls: [{ id: tc.id ?? "call_0", type: "function", function: { name: tc.function.name, arguments: tc.function.arguments || "{}" } }] };
      if (first.reasoning && first.reasoningSource === "reasoning_content") assistantMsg.reasoning_content = first.reasoning;
      const req2 = {
        messages: [...messages, assistantMsg, { role: "tool" as const, tool_call_id: tc.id ?? "call_0", name: tc.function.name, content: JSON.stringify({ location: city.en, temperature: temp, unit: "celsius", condition: pick(["sunny", "cloudy", "light rain"]) }) }],
        tools: [weatherTool()],
        tool_choice: "auto" as const,
      };
      try {
        const res = await ctx.send(req2, { maxTokens: 1024 });
        const ev = { request: { step1: req1, step2: req2 }, response: { step1: responseEvidence(first), step2: responseEvidence(res) }, notes: [] as Msg[], facts: { expectedTemperature: temp } };
        const normalized = res.content.replace(/[−–]/g, "-");
        if (normalized.includes(String(temp))) return ok("pass", msg("cap.tools.roundtrip_ok", { temp }), ev);
        if (res.toolCalls.length) return ok("partial", msg("cap.tools.roundtrip_recalled"), ev);
        if (!res.content.trim()) return ok("fail", msg("cap.tools.roundtrip_empty"), ev);
        return ok("partial", msg("cap.tools.roundtrip_unverified", { temp }), ev);
      } catch (e) {
        const err = toLlmError(e);
        if (err.kind === "aborted") throw err;
        const out = fromError(err, { request: { step1: req1, step2: req2 }, response: { step1: responseEvidence(first) } });
        out.summary = msg("cap.tools.roundtrip_rejected", { message: (err.providerMessage ?? err.message).slice(0, 160) });
        return out;
      }
    },
  },
  {
    id: "tools.strict",
    suite: "tools",
    dependsOn: ["tools.auto"],
    async run(ctx) {
      const { messages, city } = weatherPrompt(ctx.lang);
      const req = { messages, tools: [weatherTool(true)], tool_choice: "auto" as const };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        const out = evaluateWeatherCall(res, city, req);
        if (out.status === "pass") {
          const args = parseToolArgs(res.toolCalls[0]);
          if (!args || !("unit" in args) || !["celsius", "fahrenheit"].includes(String(args.unit))) {
            out.status = "partial";
            out.summary = msg("cap.tools.strict_not_enforced");
          } else out.summary = msg("cap.tools.strict_ok");
        }
        return out;
      } catch (e) {
        const err = toLlmError(e);
        if (err.kind === "aborted") throw err;
        const out = fromError(err, { request: req });
        if (err.kind === "bad_request" && mentionsParam(err, "strict")) out.summary = msg("cap.tools.strict_rejected");
        return out;
      }
    },
  },
];
void LlmError;
