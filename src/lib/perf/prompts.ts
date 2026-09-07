import { estimateTokens } from "@/lib/llm/tokens";
import type { ChatMessage } from "@/lib/llm/types";
import type { PromptLang, PromptSize } from "./types";

/** Deterministic PRNG (mulberry32) so a run can be reproduced from its seed. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

export function nonce(rng: () => number, len = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
  return s;
}

const TOPICS_EN = [
  "why cities should plant more trees", "how a bicycle stays upright", "the history of the postage stamp", "what makes bread rise", "how tides work",
  "why sleep matters for memory", "the design of a good public library", "how coral reefs form", "why maps are never perfectly accurate", "how vaccines train the immune system",
  "the origins of the metric system", "how airplanes generate lift", "why glass is transparent", "how honeybees communicate", "the life cycle of a star",
  "why some languages have grammatical gender", "how a compost heap works", "the economics of a farmers market", "how lighthouses guided ships", "why the sky is blue",
  "how paper is recycled", "the invention of the elevator", "why rivers meander", "how a thermostat keeps a room comfortable", "the role of salt in cooking",
  "how a suspension bridge carries load", "why cats purr", "how tea is processed", "the history of the umbrella", "how wind turbines make electricity",
  "why deserts get cold at night", "how a camera captures an image", "the origins of chess", "how earthquakes are measured", "why leaves change colour in autumn",
  "how a refrigerator stays cold", "the design of a good street sign", "how migrating birds navigate", "the story of the pencil", "how noise-cancelling headphones work",
];
const TOPICS_ZH = [
  "为什么城市应该多种树", "自行车为什么不会倒", "邮票的历史", "面包为什么会发起来", "潮汐是如何形成的",
  "睡眠为什么对记忆很重要", "一座好的公共图书馆应该如何设计", "珊瑚礁是如何形成的", "地图为什么永远不完全准确", "疫苗如何训练免疫系统",
  "公制单位的起源", "飞机如何产生升力", "玻璃为什么是透明的", "蜜蜂如何交流", "恒星的一生",
  "为什么有些语言有语法性别", "堆肥是如何工作的", "农夫市集的经济学", "灯塔如何为船只导航", "天空为什么是蓝色的",
  "纸是如何回收的", "电梯的发明", "河流为什么会弯曲", "恒温器如何保持房间舒适", "盐在烹饪中的作用",
  "悬索桥如何承受荷载", "猫为什么会打呼噜", "茶叶是如何加工的", "雨伞的历史", "风力发电机如何发电",
  "沙漠夜晚为什么会很冷", "相机如何捕捉影像", "国际象棋的起源", "地震是如何测量的", "秋天树叶为什么会变色",
  "冰箱如何保持低温", "一块好的路牌应该如何设计", "候鸟如何导航", "铅笔的故事", "降噪耳机的工作原理",
];

const WORDS_EN = (
  "the river carries silt toward the delta while farmers watch the sky for rain and traders count sacks of grain in the warehouse " +
  "a small workshop repairs clocks bicycles radios and kettles for the whole valley and the apprentice keeps a careful ledger of every part " +
  "archives hold maps letters receipts and photographs that describe how the harbour grew from a fishing village into a busy port " +
  "engineers measured the bridge each spring noting rust expansion joints cable tension and the slow settling of the eastern pier " +
  "the library lends tools seeds and instruments alongside books so neighbours can build gardens fix furniture and learn music together " +
  "weather stations record temperature humidity pressure wind and rainfall every hour and publish the totals in a quarterly bulletin " +
  "bakers wake before dawn to shape loaves score the crust and load the oven while the market square is still quiet and cold " +
  "a committee reviewed the proposal debated the budget requested revisions and finally approved a smaller plan with clearer milestones"
).split(/\s+/);

const WORDS_ZH = (
  "河流 泥沙 三角洲 农民 天空 降雨 商人 粮食 仓库 作坊 修理 钟表 自行车 收音机 水壶 山谷 学徒 账本 零件 档案 地图 信件 收据 照片 港口 渔村 " +
  "工程师 测量 桥梁 春天 锈迹 伸缩缝 缆索 张力 桥墩 沉降 图书馆 工具 种子 乐器 书籍 邻居 花园 家具 音乐 气象站 温度 湿度 气压 风速 降水 " +
  "季度 公报 面包师 黎明 面团 烤箱 广场 安静 寒冷 委员会 提案 预算 修订 批准 计划 里程碑 记录 每天 每年 缓慢 仔细 逐渐 通常 因此 然而 " +
  "例如 首先 其次 最后 城市 村庄 学校 医院 工厂 车站 码头 市场 公园 街道 桥梁 隧道 道路 河岸 山坡 森林 田野 湖泊 海岸 岛屿 平原"
).split(/\s+/);

/** Generate readable filler text of roughly `tokens` tokens. */
export function filler(rng: () => number, lang: PromptLang, tokens: number): string {
  const out: string[] = [];
  let est = 0;
  let guard = 0;
  while (est < tokens && guard++ < 5000) {
    if (lang === "zh") {
      const n = 6 + Math.floor(rng() * 8);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) parts.push(WORDS_ZH[Math.floor(rng() * WORDS_ZH.length)]);
      const mid = Math.floor(n / 2);
      const sentence = parts.slice(0, mid).join("") + "，" + parts.slice(mid).join("") + (rng() < 0.15 ? `（编号 ${Math.floor(rng() * 9000 + 1000)}）` : "") + "。";
      out.push(sentence);
      est += estimateTokens(sentence);
    } else {
      const n = 8 + Math.floor(rng() * 9);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) parts.push(WORDS_EN[Math.floor(rng() * WORDS_EN.length)]);
      if (rng() < 0.2) parts.splice(Math.floor(rng() * n), 0, String(Math.floor(rng() * 9000 + 1000)));
      const sentence = parts[0][0].toUpperCase() + parts[0].slice(1) + " " + parts.slice(1).join(" ") + ".";
      out.push(sentence);
      est += estimateTokens(sentence);
    }
  }
  const text = out.join(lang === "zh" ? "" : " ");
  // Break into paragraphs for readability.
  const sentences = lang === "zh" ? text.split(/(?<=。)/) : text.split(/(?<=\.)\s+/);
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 6) paras.push(sentences.slice(i, i + 6).join(lang === "zh" ? "" : " "));
  return paras.join("\n\n");
}

const SIZE_TOKENS: Record<PromptSize, number> = { short: 0, medium: 500, long: 2000 };
/** Approximate total input size of each generated preset (for hints in the UI). */
export const APPROX_INPUT_TOKENS: Record<PromptSize, number> = { short: 60, medium: 600, long: 2100 };

export interface PerfPrompt {
  messages: ChatMessage[];
  topic: string;
  nonce: string;
  approxInputTokens: number;
}

export interface PerfPromptOptions {
  /**
   * true  → the prompt starts with the current timestamp plus a random token, so no
   *         prefix cache can match (cache-miss measurements);
   * false → the prompt still carries a session token (fresh for this test session)
   *         but no per-request randomness, so repeated requests are byte-identical
   *         and can hit the provider's prompt cache.
   */
  randomizeEveryRequest: boolean;
}

/**
 * Builds a prompt for a performance run. The random part sits at the very
 * start of the system message because prefix caches match from the beginning.
 */
export function buildPerfPrompt(rng: () => number, lang: PromptLang, size: PromptSize, targetWords: number, opts: PerfPromptOptions = { randomizeEveryRequest: true }): PerfPrompt {
  const n = nonce(rng);
  const stamp = opts.randomizeEveryRequest ? `${new Date().toISOString()} ${n}` : n;
  const topics = lang === "zh" ? TOPICS_ZH : TOPICS_EN;
  const topic = topics[Math.floor(rng() * topics.length)];
  const ctx = SIZE_TOKENS[size] > 0 ? filler(rng, lang, SIZE_TOKENS[size]) : "";
  // Filler context lives in the system message: that is the part real applications
  // share between requests, and therefore the part prompt caches are built on.
  const system =
    lang === "zh"
      ? `会话 ${stamp}。你是一位写作助手，用自然流畅的中文写作，直接输出正文，不要使用列表、标题或 Markdown。${ctx ? `\n\n参考资料（编号 ${n}）：\n\n${ctx}` : ""}`
      : `Session ${stamp}. You are a writing assistant. Write natural, flowing prose. Output only the text, without lists, headings or Markdown.${ctx ? `\n\nReference notes (ref ${n}):\n\n${ctx}` : ""}`;
  const user = lang === "zh" ? `请写一篇约 ${targetWords} 字的短文，主题：${topic}。` : `Write a short essay of about ${targetWords} words on ${topic}.`;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  return { messages, topic, nonce: n, approxInputTokens: estimateTokens(system) + estimateTokens(user) + 8 };
}

/**
 * Wraps a user-supplied prompt for a performance run. The text is sent verbatim as the
 * user message; a one-line system message carries the per-request random stamp
 * (cache-miss) or the fixed session token (cache-hit).
 */
export function buildCustomPrompt(rng: () => number, text: string, opts: PerfPromptOptions): PerfPrompt {
  const n = nonce(rng);
  const stamp = opts.randomizeEveryRequest ? `${new Date().toISOString()} ${n}` : n;
  const system = `Session ${stamp}.`;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: text },
  ];
  return { messages, topic: "custom", nonce: n, approxInputTokens: estimateTokens(system) + estimateTokens(text) + 8 };
}

/**
 * Builds the shared prefix for the prompt-cache test. The prefix is fixed for
 * one test session (so cold vs warm is measured), but starts with a nonce so
 * that the *first* request of a session is guaranteed to be a cache miss.
 */
export function buildCachePrefix(rng: () => number, lang: PromptLang, tokens: number): { system: string; nonce: string; approxTokens: number } {
  const n = nonce(rng);
  const body = filler(rng, lang, tokens);
  const system =
    lang === "zh"
      ? `知识库版本 ${n}。你是一位客服助手，请根据下面的资料简短回答用户问题。\n\n资料：\n\n${body}`
      : `Knowledge base version ${n}. You are a support assistant. Answer the user's question briefly using the material below.\n\nMaterial:\n\n${body}`;
  return { system, nonce: n, approxTokens: estimateTokens(system) + 4 };
}

export function cacheQuestion(rng: () => number, lang: PromptLang, index: number): string {
  const qsEn = ["Summarise the material in one sentence.", "What kinds of records are mentioned in the material?", "Name three activities described in the material.", "Which numbers appear in the material? List up to three.", "What is the general theme of the material?"];
  const qsZh = ["请用一句话概括这些资料。", "资料中提到了哪些类型的记录？", "请列举资料中描述的三项活动。", "资料中出现了哪些数字？最多列出三个。", "这些资料的总体主题是什么？"];
  const qs = lang === "zh" ? qsZh : qsEn;
  const q = qs[index % qs.length];
  const tag = nonce(rng, 6);
  return lang === "zh" ? `（问题 ${index + 1}，标记 ${tag}）${q}` : `(Question ${index + 1}, tag ${tag}) ${q}`;
}
