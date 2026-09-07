import type { ChatMessage, CompletionResult } from "@/lib/llm/types";
import { msg, type CapTestDef, type Msg } from "../types";
import { SIMPLE_SYSTEM, fromError, ok, pick, randInt, responseEvidence, shortNonce } from "../helpers";
import { weatherTool } from "./tools";

const SECRET_WORDS = ["papaya", "lantern", "violin", "glacier", "compass", "saffron", "meadow", "quartz"];

function ev(res: CompletionResult, req: unknown, notes: Msg[] = []) {
  return { request: req, response: responseEvidence(res), notes };
}

/** Accepted-or-rejected probe with an optional behavioural check. */
function seqTest(id: string, build: (lang: "en" | "zh") => { messages: ChatMessage[]; tools?: ChatMessage["tool_calls"] extends unknown ? any : never; check: (res: CompletionResult) => { status: "pass" | "partial"; summary: Msg; notes?: Msg[] } }): CapTestDef {
  return {
    id,
    suite: "messages",
    async run(ctx) {
      const built = build(ctx.lang);
      const req = { messages: built.messages, ...(built.tools ? { tools: built.tools } : {}) };
      try {
        const res = await ctx.send(req, { maxTokens: 256 });
        const verdict = built.check(res);
        return ok(verdict.status, verdict.summary, ev(res, req, verdict.notes));
      } catch (e) {
        return fromError(e, { request: req });
      }
    },
  };
}

export const messageTests: CapTestDef[] = [
  seqTest("messages.multi_system_start", (lang) => {
    const n = shortNonce();
    const messages: ChatMessage[] = [
      { role: "system", content: lang === "zh" ? `会话 ${n}。规则 A：全部使用英文大写字母回复。` : `Session ${n}. Rule A: reply entirely in UPPERCASE letters.` },
      { role: "system", content: lang === "zh" ? "规则 B：回复的最后一个词必须是 DONE。" : "Rule B: the last word of your reply must be DONE." },
      { role: "user", content: lang === "zh" ? "用几个英文单词打个招呼。" : "Say hello in a few words." },
    ];
    return {
      messages,
      check: (res) => {
        const letters = res.content.replace(/[^A-Za-z]/g, "");
        const upper = letters.length >= 3 && letters === letters.toUpperCase();
        const done = /DONE\W*$/i.test(res.content.trim());
        const n = (upper ? 1 : 0) + (done ? 1 : 0);
        if (n === 2) return { status: "pass", summary: msg("cap.msgs.rules_ok") };
        return { status: "partial", summary: msg("cap.msgs.rules_partial", { n, total: 2 }), notes: [msg("cap.msgs.rule_status", { rule: "A (uppercase)", ok: upper }), msg("cap.msgs.rule_status", { rule: "B (ends with DONE)", ok: done })] };
      },
    };
  }),
  seqTest("messages.system_mid", (lang) => {
    const n = shortNonce();
    const a = randInt(2, 9);
    const b = randInt(2, 9);
    const messages: ChatMessage[] = [
      { role: "system", content: SIMPLE_SYSTEM(lang, n) },
      { role: "user", content: lang === "zh" ? `${a}+${a} 等于多少？只回复数字。` : `What is ${a}+${a}? Reply with just the number.` },
      { role: "assistant", content: String(a + a) },
      { role: "system", content: lang === "zh" ? "新规则：从现在起，每次回复都以标签 [R2] 开头。" : "New rule from now on: start every reply with the tag [R2]." },
      { role: "user", content: lang === "zh" ? `${b}+${b} 等于多少？只回复数字。` : `What is ${b}+${b}? Reply with just the number.` },
    ];
    return {
      messages,
      check: (res) => {
        const prefixed = /^\s*\[R2\]/.test(res.content);
        const correct = res.content.includes(String(b + b));
        if (prefixed) return { status: "pass", summary: msg("cap.msgs.mid_rule_ok") };
        return { status: "partial", summary: msg("cap.msgs.mid_rule_ignored"), notes: correct ? [] : [msg("cap.msgs.answer_wrong")] };
      },
    };
  }),
  seqTest("messages.consecutive_user", (lang) => {
    const n = shortNonce();
    const word = pick(SECRET_WORDS);
    const messages: ChatMessage[] = [
      { role: "system", content: SIMPLE_SYSTEM(lang, n) },
      { role: "user", content: lang === "zh" ? `我的暗号是 ${word}。` : `My secret word is ${word}.` },
      { role: "user", content: lang === "zh" ? "我的暗号是什么？只回复那个词。" : "What is my secret word? Reply with just the word." },
    ];
    return {
      messages,
      check: (res) => (res.content.toLowerCase().includes(word) ? { status: "pass", summary: msg("cap.msgs.recalled") } : { status: "partial", summary: msg("cap.msgs.not_recalled") }),
    };
  }),
  seqTest("messages.consecutive_assistant", (lang) => {
    const n = shortNonce();
    const messages: ChatMessage[] = [
      { role: "system", content: SIMPLE_SYSTEM(lang, n) },
      { role: "user", content: lang === "zh" ? "给我两条关于月球的简短事实。" : "Give me two short facts about the Moon." },
      { role: "assistant", content: lang === "zh" ? "事实 1：月球绕地球一周约需 27 天。" : "Fact 1: The Moon orbits Earth roughly every 27 days." },
      { role: "assistant", content: lang === "zh" ? "事实 2：月球始终以同一面朝向地球。" : "Fact 2: The same side of the Moon always faces Earth." },
      { role: "user", content: lang === "zh" ? "你刚才给了我几条事实？只回复数字。" : "How many facts did you give me? Reply with just the number." },
    ];
    return {
      messages,
      check: (res) => (/\b2\b|two|两|二/i.test(res.content) ? { status: "pass", summary: msg("cap.msgs.count_ok") } : { status: "partial", summary: msg("cap.msgs.count_wrong") }),
    };
  }),
  seqTest("messages.tool_call_no_result", (lang) => {
    const n = shortNonce();
    const messages: ChatMessage[] = [
      { role: "system", content: SIMPLE_SYSTEM(lang, n) },
      { role: "user", content: lang === "zh" ? "东京现在天气怎么样？" : "What's the weather in Tokyo right now?" },
      { role: "assistant", content: null, tool_calls: [{ id: `call_${n}`, type: "function", function: { name: "get_weather", arguments: JSON.stringify({ location: "Tokyo" }) } }] },
      { role: "user", content: lang === "zh" ? "先不管天气了——只回复一句问候。" : "Never mind the weather — just reply with a short greeting." },
    ];
    return {
      messages,
      tools: [weatherTool()],
      check: (res) => {
        if (res.toolCalls.length) return { status: "partial", summary: msg("cap.msgs.tool_reissued") };
        if (!res.content.trim()) return { status: "partial", summary: msg("cap.msgs.empty_reply") };
        return { status: "pass", summary: msg("cap.msgs.tool_no_result_ok") };
      },
    };
  }),
  seqTest("messages.orphan_tool_result", (lang) => {
    const n = shortNonce();
    const temp = randInt(-5, 35);
    const messages: ChatMessage[] = [
      { role: "system", content: SIMPLE_SYSTEM(lang, n) },
      { role: "user", content: lang === "zh" ? "东京现在多少度？" : "What's the temperature in Tokyo?" },
      { role: "tool", tool_call_id: `call_${n}`, content: JSON.stringify({ location: "Tokyo", temperature: temp, unit: "celsius" }) },
      { role: "user", content: lang === "zh" ? "工具返回的温度是多少？只回复数字。" : "What temperature did the tool report? Reply with just the number." },
    ];
    return {
      messages,
      tools: [weatherTool()],
      check: (res) => (res.content.replace(/[−–]/g, "-").includes(String(temp)) ? { status: "pass", summary: msg("cap.msgs.orphan_used") } : { status: "partial", summary: msg("cap.msgs.orphan_ignored") }),
    };
  }),
  seqTest("messages.assistant_last", (lang) => {
    const n = shortNonce();
    const messages: ChatMessage[] = [
      { role: "system", content: SIMPLE_SYSTEM(lang, n) },
      { role: "user", content: lang === "zh" ? "把这句话补充完整。" : "Complete the sentence." },
      { role: "assistant", content: lang === "zh" ? "法国的首都是" : "The capital of France is" },
    ];
    return {
      messages,
      check: (res) => (/paris|巴黎/i.test(res.content) ? { status: "pass", summary: msg("cap.msgs.prefill_ok") } : { status: "partial", summary: msg("cap.msgs.prefill_not_continued") }),
    };
  }),
  seqTest("messages.content_parts", (lang) => {
    const n = shortNonce();
    const messages: ChatMessage[] = [
      { role: "system", content: [{ type: "text", text: SIMPLE_SYSTEM(lang, n) }] },
      { role: "user", content: [{ type: "text", text: lang === "zh" ? "只回复：OK" : "Reply with just: OK" }] },
    ];
    return { messages, check: (res) => (res.content.trim() ? { status: "pass", summary: msg("cap.msgs.parts_ok") } : { status: "partial", summary: msg("cap.msgs.empty_reply") }) };
  }),
];
