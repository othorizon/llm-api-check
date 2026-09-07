// A small OpenAI-compatible mock server for local development and end-to-end tests.
//   node scripts/mock-server.mjs [port]
// Models:
//   mock-fast        plain model, streams at ~150 tok/s, TTFT ~120 ms, reports usage + cached_tokens
//   mock-thinker     reasoning model: reasoning_content first (~600 ms), honours thinking:{type:"disabled"} and reasoning_effort
//   mock-strict      rejects unknown params (400) like OpenAI, requires max_completion_tokens, hidden reasoning tokens
//   mock-slow        TTFT ~1.8 s, ~20 tok/s, no usage in stream
//   mock-flaky       every 3rd request fails with 429
import http from "node:http";

const port = Number(process.argv[2] || process.env.PORT || 8787);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KNOWN_PARAMS = new Set(["model", "messages", "stream", "stream_options", "max_tokens", "max_completion_tokens", "temperature", "top_p", "n", "stop", "seed", "logprobs", "top_logprobs", "tools", "tool_choice", "parallel_tool_calls", "response_format", "reasoning_effort", "presence_penalty", "frequency_penalty", "user", "metadata", "store"]);
let counter = 0;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
function err(res, status, message, param) {
  json(res, status, { error: { message, type: "invalid_request_error", param: param ?? null, code: null } });
}
const tok = (s) => Math.max(1, Math.round(s.length / 4));
function textOf(m) {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) return m.content.map((p) => p.text ?? "").join(" ");
  return "";
}
function words(text, n) {
  const pool = "the quick brown fox jumps over the lazy dog while engineers measure latency and throughput with careful patience".split(" ");
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[(i * 7 + text.length) % pool.length]);
  return out;
}

function answerFor(body, model) {
  const msgs = body.messages ?? [];
  const last = msgs[msgs.length - 1] ?? {};
  const lastText = textOf(last);
  const all = msgs.map(textOf).join("\n");
  const sysTexts = msgs.filter((m) => m.role === "system").map(textOf);
  // Vision
  const hasImage = msgs.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
  if (hasImage) {
    if (model.name === "mock-strict") return { content: "I cannot see the image." };
    return { content: "color=blue, shape=circle, number=42" };
  }
  // Tools
  if (Array.isArray(body.tools) && body.tools.length) {
    const forced = body.tool_choice === "required" || (body.tool_choice && typeof body.tool_choice === "object");
    const toolMsg = msgs.find((m) => m.role === "tool");
    if (toolMsg && !forced) {
      try {
        const r = JSON.parse(toolMsg.content);
        return { content: `It is ${r.temperature}° and ${r.condition ?? "fine"} in ${r.location ?? "there"}.` };
      } catch {
        return { content: "Thanks." };
      }
    }
    if (model.name === "mock-slow" && forced) return { content: "Hello! (ignoring tool_choice)" };
    const wantsWeather = (/weather|天气|温度|temperature/i.test(lastText) && !/never mind|先不管/i.test(lastText)) || forced;
    if (wantsWeather) {
      const cities = ["Tokyo", "Paris", "Lima", "Nairobi", "Oslo", "Denver", "Seoul", "Lisbon", "Cairo", "Perth", "东京", "巴黎", "利马", "内罗毕", "奥斯陆", "丹佛", "首尔", "里斯本", "开罗", "珀斯"];
      const found = cities.filter((c) => lastText.includes(c));
      const name = body.tool_choice && typeof body.tool_choice === "object" ? body.tool_choice.function.name : "get_weather";
      const calls = (found.length ? found : ["Tokyo"]).slice(0, model.name === "mock-slow" ? 1 : 2).map((c, i) => ({ id: `call_${++counter}_${i}`, type: "function", function: { name, arguments: JSON.stringify(name === "get_weather" ? { location: c, unit: body.tools[0]?.function?.strict ? "celsius" : undefined } : { city: c }) } }));
      return { tool_calls: calls, content: null };
    }
  }
  // Structured output
  const rf = body.response_format;
  if (rf?.type === "json_schema") {
    const name = rf.json_schema?.name;
    if (name === "order") {
      const id = (all.match(/ORD-\d+/) || ["ORD-0"])[0];
      const status = (all.match(/status (\w+)|状态 (\w+)/) || [])[1] || (all.match(/状态 (\w+)/) || [])[1] || "paid";
      const q = [...all.matchAll(/quantity (\d+)|数量 (\d+)/g)].map((m) => Number(m[1] ?? m[2]));
      return { content: JSON.stringify({ order_id: id, status, customer: { name: "Alice Zhang", address: { city: "Berlin", country: "Germany", postal_code: null } }, items: [{ sku: "A-100", quantity: q[0] ?? 1, unit_price: 9.5 }, { sku: "B-200", quantity: q[1] ?? 1, unit_price: 7 }], notes: null }) };
    }
    const age = Number((all.match(/is (\d+)|，(\d+) 岁/) || [])[1] ?? (all.match(/(\d+) 岁/) || [])[1] ?? 30);
    const obj = { name: "Alice Zhang", age, email: "alice@example.com", is_active: true, tags: ["engineer", "cyclist"] };
    if (model.name === "mock-slow") return { content: "```json\n" + JSON.stringify(obj) + "\n```" };
    return { content: JSON.stringify(rf.json_schema?.strict ? obj : { ...obj, extra: "field" }) };
  }
  if (rf?.type === "json_object") return { content: JSON.stringify({ name: "Alice Zhang", age: 34, email: "alice@example.com", is_active: true, tags: ["engineer"] }) };
  // Message-format behaviours
  if (sysTexts.length >= 2 && /DONE/.test(sysTexts[1])) return { content: model.name === "mock-slow" ? "hello there" : "HELLO THERE DONE" };
  if (msgs.some((m, i) => m.role === "system" && i > 0 && /\[R2\]/.test(textOf(m)))) {
    const m = lastText.match(/(\d+)\+(\d+)/);
    const v = m ? Number(m[1]) + Number(m[2]) : 0;
    return { content: model.name === "mock-slow" ? String(v) : `[R2] ${v}` };
  }
  if (/secret word|暗号/.test(all)) {
    const w = (all.match(/secret word is (\w+)|暗号是 (\w+)/) || []);
    return { content: w[1] ?? w[2] ?? "unknown" };
  }
  if (/How many facts|几条事实/.test(lastText)) return { content: "2" };
  if (last.role === "assistant") return { content: " Paris." };
  if (/temperature did the tool report|工具返回的温度/.test(lastText)) {
    const tm = msgs.find((m) => m.role === "tool");
    try {
      return { content: String(JSON.parse(tm.content).temperature) };
    } catch {
      return { content: "unknown" };
    }
  }
  // Arithmetic puzzle
  const m = lastText.match(/(\d+)\s*[×x*]\s*(\d+)\s*[−-]\s*(\d+)/);
  if (m) return { content: String(Number(m[1]) * Number(m[2]) - Number(m[3])), reasoning: `Let me compute ${m[1]} times ${m[2]}. ${Number(m[1]) * Number(m[2])}. Then subtract ${m[3]}.` };
  if (/OK/.test(lastText)) return { content: "OK" };
  if (/hello|greeting|问候|你好/i.test(lastText)) return { content: "Hello! How can I help you today?" };
  // Essay / long answer
  const max = body.max_tokens ?? body.max_completion_tokens ?? 256;
  return { content: words(lastText, max).join(" ") + ".", reasoning: "The user wants an essay. I will write clearly." };
}

const MODELS = {
  "mock-fast": { ttft: 120, tps: 150, reasoning: false, usage: true, cache: true },
  "mock-thinker": { ttft: 200, tps: 90, reasoning: true, reasoningMs: 600, usage: true, cache: true },
  "mock-strict": { ttft: 350, tps: 60, reasoning: "hidden", strict: true, usage: true, cache: true },
  "mock-slow": { ttft: 1800, tps: 20, reasoning: false, usage: false, cache: false },
  "mock-flaky": { ttft: 300, tps: 80, reasoning: false, usage: true, cache: true },
};

const cachePrefixes = new Map();
function cachedTokens(body) {
  const sys = body.messages?.find((m) => m.role === "system");
  if (!sys) return 0;
  const key = textOf(sys).slice(0, 4000);
  if (key.length < 3000) return 0;
  const seen = cachePrefixes.get(key);
  cachePrefixes.set(key, Date.now());
  return seen ? Math.floor(tok(key) / 64) * 64 : 0;
}

let flaky = 0;
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname.endsWith("/models")) return json(res, 200, { object: "list", data: Object.keys(MODELS).map((id) => ({ id, object: "model" })) });
  if (req.method !== "POST" || !url.pathname.endsWith("/chat/completions")) return err(res, 404, "Not found");
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 12) return err(res, 401, "Invalid API key");
  let body = "";
  for await (const chunk of req) body += chunk;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return err(res, 400, "Invalid JSON");
  }
  const model = MODELS[parsed.model];
  if (!model) return err(res, 404, `The model '${parsed.model}' does not exist`, "model");
  model.name = parsed.model;
  if (parsed.model === "mock-flaky" && ++flaky % 3 === 0) {
    res.setHeader("Retry-After", "1");
    return err(res, 429, "Rate limit exceeded");
  }
  if (model.strict) {
    for (const k of Object.keys(parsed)) if (!KNOWN_PARAMS.has(k)) return err(res, 400, `Unrecognized request argument supplied: ${k}`, k);
    if ("max_tokens" in parsed) return err(res, 400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", "max_tokens");
    if ("temperature" in parsed && parsed.temperature !== 1) return err(res, 400, "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.", "temperature");
    if (parsed.reasoning_effort && !["minimal", "low", "medium", "high", "none"].includes(parsed.reasoning_effort)) return err(res, 400, "Invalid value for reasoning_effort", "reasoning_effort");
    // OpenAI-style message validation
    const msgs = parsed.messages ?? [];
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role === "assistant" && msgs[i].tool_calls?.length) {
        const next = msgs[i + 1];
        if (!next || next.role !== "tool") return err(res, 400, `An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. The following tool_call_ids did not have response messages: ${msgs[i].tool_calls[0].id}`, "messages.[" + (i + 1) + "].role");
      }
      if (msgs[i].role === "tool" && !(msgs[i - 1]?.role === "tool" || msgs[i - 1]?.tool_calls?.length)) return err(res, 400, `Invalid parameter: messages with role 'tool' must be a response to a preceeding message with 'tool_calls'.`, "messages.[" + i + "].role");
    }
    if (msgs.some((m) => m.role === "system" && Array.isArray(m.content) && m.content.some((p) => p.cache_control))) return err(res, 400, "Unrecognized request argument supplied: cache_control", "messages");
  } else if (parsed.model === "mock-thinker") {
    if (parsed.messages?.some((m, i) => m.role === "system" && i > 0)) return err(res, 400, "system message must be the first message", "messages");
    if (parsed.tool_choice === "required") return err(res, 400, "tool_choice 'required' is not supported", "tool_choice");
  }
  if (parsed.model === "mock-slow" && parsed.messages?.some((m) => m.role === "developer")) return err(res, 400, "Invalid role: developer", "messages");
  if (parsed.model === "mock-slow" && parsed.n && parsed.n > 1) return err(res, 400, "n > 1 is not supported", "n");

  // Reasoning behaviour
  let reasoningOn = !!model.reasoning;
  if (parsed.model === "mock-thinker") {
    if (parsed.thinking?.type === "disabled") reasoningOn = false;
    if (parsed.enable_thinking === false) reasoningOn = false;
  }
  if (parsed.model === "mock-strict") {
    if (parsed.reasoning_effort === "none") reasoningOn = false;
  }
  const effortScale = parsed.reasoning_effort === "high" ? 3 : parsed.reasoning_effort === "low" ? 0.5 : parsed.reasoning_effort === "minimal" ? 0.1 : 1;
  const ans = answerFor(parsed, model);
  const contentText = ans.content ?? "";
  const reasoningText = reasoningOn ? (ans.reasoning ?? "Thinking about the request carefully. ").repeat(Math.max(1, Math.round(3 * effortScale))) : "";
  const promptTokens = parsed.messages.reduce((n, m) => n + tok(textOf(m)) + 4, 0);
  const cached = model.cache ? cachedTokens(parsed) : 0;
  const compTokens = tok(contentText) + tok(reasoningText) + (ans.tool_calls ? 12 : 0);
  const usage = { prompt_tokens: promptTokens, completion_tokens: compTokens, total_tokens: promptTokens + compTokens, prompt_tokens_details: { cached_tokens: cached }, ...(model.reasoning === "hidden" && reasoningOn ? { completion_tokens_details: { reasoning_tokens: Math.round(40 * effortScale) } } : {}) };
  const id = `chatcmpl-${++counter}`;
  const finish = ans.tool_calls ? "tool_calls" : "stop";
  const n = parsed.n && parsed.model !== "mock-slow" ? parsed.n : 1;
  const ttft = model.ttft * (cached ? 0.35 : 1);

  if (!parsed.stream) {
    await sleep(ttft + (reasoningOn && model.reasoning === true ? model.reasoningMs * effortScale : 0) + (compTokens / model.tps) * 1000);
    const message = { role: "assistant", content: ans.tool_calls ? null : contentText, ...(ans.tool_calls ? { tool_calls: ans.tool_calls } : {}), ...(reasoningOn && model.reasoning === true ? { reasoning_content: reasoningText } : {}) };
    const choices = Array.from({ length: n }, (_, i) => ({ index: i, message, finish_reason: finish, ...(parsed.logprobs && parsed.model !== "mock-slow" ? { logprobs: { content: [{ token: "OK", logprob: -0.01 }] } } : {}) }));
    return json(res, 200, { id, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: parsed.model, choices, usage });
  }
  cors(res);
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (delta, extra = {}) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: parsed.model, choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`);
  await sleep(ttft);
  if (reasoningOn && model.reasoning === true) {
    const parts = reasoningText.split(" ");
    for (const p of parts) {
      send({ reasoning_content: p + " " });
      await sleep((model.reasoningMs * effortScale) / parts.length);
    }
  }
  if (ans.tool_calls) {
    for (let i = 0; i < ans.tool_calls.length; i++) {
      const tc = ans.tool_calls[i];
      send({ tool_calls: [{ index: i, id: tc.id, type: "function", function: { name: tc.function.name, arguments: "" } }] });
      const args = tc.function.arguments;
      for (let j = 0; j < args.length; j += 6) {
        send({ tool_calls: [{ index: i, function: { arguments: args.slice(j, j + 6) } }] });
        await sleep(1000 / model.tps);
      }
    }
  } else {
    const pieces = contentText.match(/\S+\s*/g) ?? [];
    for (const p of pieces) {
      send({ content: p });
      await sleep(1000 / model.tps);
    }
  }
  res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: parsed.model, choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\n`);
  if (model.usage && parsed.stream_options?.include_usage) res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: parsed.model, choices: [], usage })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
});
server.listen(port, () => console.log(`mock OpenAI-compatible server on http://localhost:${port}/v1  (models: ${Object.keys(MODELS).join(", ")})`));
