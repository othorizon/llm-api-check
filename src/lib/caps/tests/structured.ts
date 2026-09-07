import { toLlmError, mentionsParam } from "@/lib/llm/errors";
import type { ChatMessage, CompletionResult, ResponseFormat } from "@/lib/llm/types";
import { validateSchema } from "../schema-validate";
import { msg, type CapTestDef, type Msg } from "../types";
import { SIMPLE_SYSTEM, fromError, ok, parseJsonLenient, pick, randInt, responseEvidence, shortNonce } from "../helpers";

const NAMES = ["Alice Zhang", "Bruno Costa", "Chloé Martin", "Dmitri Volkov", "Emeka Obi", "Fatima Noor", "Gao Wei", "Hana Sato"];

export const personSchema = (strict: boolean) => ({
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "integer" },
    email: { type: "string" },
    is_active: { type: "boolean" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["name", "age", "email", "is_active", "tags"],
  additionalProperties: false,
  ...(strict ? {} : {}),
});

export const orderSchema = {
  type: "object",
  properties: {
    order_id: { type: "string" },
    status: { type: "string", enum: ["pending", "paid", "shipped", "cancelled"] },
    customer: {
      type: "object",
      properties: {
        name: { type: "string" },
        address: {
          type: "object",
          properties: { city: { type: "string" }, country: { type: "string" }, postal_code: { anyOf: [{ type: "string" }, { type: "null" }] } },
          required: ["city", "country", "postal_code"],
          additionalProperties: false,
        },
      },
      required: ["name", "address"],
      additionalProperties: false,
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { sku: { type: "string" }, quantity: { type: "integer" }, unit_price: { type: "number" } },
        required: ["sku", "quantity", "unit_price"],
        additionalProperties: false,
      },
    },
    notes: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["order_id", "status", "customer", "items", "notes"],
  additionalProperties: false,
};

function personCase(lang: "en" | "zh") {
  const name = pick(NAMES);
  const age = randInt(19, 71);
  const email = `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}${randInt(1, 99)}@example.com`;
  const active = Math.random() < 0.5;
  const tags = [pick(["engineer", "designer", "teacher", "nurse"]), pick(["cyclist", "gardener", "runner", "pianist"])];
  const nonce = shortNonce();
  const text =
    lang === "zh"
      ? `从下面的文字中提取人物信息（标记 ${nonce}）：“${name}，${age} 岁，邮箱 ${email}，${active ? "活跃会员" : "已停用会员"}，标签：${tags.join("、")}。”`
      : `Extract the person from this text (tag ${nonce}): "${name} is ${age}, email ${email}, ${active ? "an active member" : "an inactive member"}, tags: ${tags.join(", ")}."`;
  return { text, expected: { name, age, email, is_active: active, tags }, nonce };
}

function orderCase(lang: "en" | "zh") {
  const id = `ORD-${randInt(10000, 99999)}`;
  const name = pick(NAMES);
  const city = pick(["Berlin", "Toronto", "Osaka", "Madrid", "Austin"]);
  const country = { Berlin: "Germany", Toronto: "Canada", Osaka: "Japan", Madrid: "Spain", Austin: "USA" }[city]!;
  const q1 = randInt(1, 9);
  const q2 = randInt(1, 9);
  const p1 = randInt(5, 60) + 0.5;
  const p2 = randInt(5, 60);
  const status = pick(["pending", "paid", "shipped"]);
  const nonce = shortNonce();
  const text =
    lang === "zh"
      ? `将下面的订单描述提取为结构化数据（标记 ${nonce}）：订单 ${id}，状态 ${status}，客户 ${name}，地址 ${city}, ${country}（无邮编）。商品：SKU A-100 数量 ${q1} 单价 ${p1}；SKU B-200 数量 ${q2} 单价 ${p2}。无备注。`
      : `Extract this order (tag ${nonce}): order ${id}, status ${status}, customer ${name}, address ${city}, ${country} (no postal code). Items: SKU A-100 quantity ${q1} at ${p1} each; SKU B-200 quantity ${q2} at ${p2} each. No notes.`;
  return { text, expected: { order_id: id, status, q1, q2 }, nonce };
}

function messagesFor(lang: "en" | "zh", nonce: string, text: string, jsonHint: boolean): ChatMessage[] {
  const sys = SIMPLE_SYSTEM(lang, nonce) + (jsonHint ? (lang === "zh" ? " 只输出 JSON。" : " Respond with JSON only.") : "");
  return [
    { role: "system", content: sys },
    { role: "user", content: text },
  ];
}

function evaluateJson(res: CompletionResult, schema: Record<string, unknown> | null, req: unknown, check?: (v: any) => Msg | null) {
  const ev = { request: req, response: responseEvidence(res), notes: [] as Msg[], facts: {} as Record<string, string | number | boolean | null> };
  if (res.refusal) return ok("fail", msg("cap.structured.refusal"), ev);
  const parsed = parseJsonLenient(res.content);
  if (!parsed) return ok("fail", msg("cap.structured.not_json"), ev);
  if (parsed.fenced) ev.notes.push(msg("cap.structured.fenced"));
  else if (!parsed.exact) ev.notes.push(msg("cap.structured.embedded"));
  let status: "pass" | "partial" = parsed.exact ? "pass" : "partial";
  if (schema) {
    const errors = validateSchema(parsed.value, schema);
    ev.facts.schemaErrors = errors.length;
    if (errors.length) {
      ev.notes.push(...errors.slice(0, 5).map((e) => msg("cap.structured.schema_error", { path: e.path, message: e.message })));
      return ok("partial", msg("cap.structured.invalid", { n: errors.length }), ev);
    }
  } else if (!parsed.value || typeof parsed.value !== "object") return ok("partial", msg("cap.structured.not_object"), ev);
  const contentIssue = check?.(parsed.value);
  if (contentIssue) {
    ev.notes.push(contentIssue);
    status = "partial";
  }
  return ok(status, status === "pass" ? msg(schema ? "cap.structured.valid" : "cap.structured.json_ok") : msg("cap.structured.mostly"), ev);
}

function rejected(e: unknown, req: unknown) {
  const err = toLlmError(e);
  if (err.kind === "aborted") throw err;
  const out = fromError(err, { request: req });
  if (err.kind === "bad_request" && mentionsParam(err, "response_format")) out.evidence.notes.push(msg("cap.tools.param_rejected", { param: "response_format" }));
  return out;
}

function schemaTest(id: string, strict: boolean, nested: boolean): CapTestDef {
  return {
    id,
    suite: "structured",
    async run(ctx) {
      const c = nested ? orderCase(ctx.lang) : personCase(ctx.lang);
      const schema = nested ? orderSchema : personSchema(strict);
      const response_format: ResponseFormat = { type: "json_schema", json_schema: { name: nested ? "order" : "person", schema, ...(strict ? { strict: true } : {}) } };
      const req = { messages: messagesFor(ctx.lang, c.nonce, c.text, false), response_format };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        return evaluateJson(res, schema, req, (v) => {
          if (nested) {
            const e = (c as ReturnType<typeof orderCase>).expected;
            if (v.order_id !== e.order_id) return msg("cap.structured.value_mismatch", { field: "order_id", expected: e.order_id, got: String(v.order_id) });
            if (!Array.isArray(v.items) || v.items.length !== 2) return msg("cap.structured.value_mismatch", { field: "items.length", expected: 2, got: Array.isArray(v.items) ? v.items.length : "n/a" });
            return null;
          }
          const e = (c as ReturnType<typeof personCase>).expected;
          if (v.age !== e.age) return msg("cap.structured.value_mismatch", { field: "age", expected: e.age, got: String(v.age) });
          return null;
        });
      } catch (e) {
        return rejected(e, req);
      }
    },
  };
}

export const structuredTests: CapTestDef[] = [
  {
    id: "structured.json_object",
    suite: "structured",
    async run(ctx) {
      const c = personCase(ctx.lang);
      const req = { messages: messagesFor(ctx.lang, c.nonce, c.text + (ctx.lang === "zh" ? " 以 JSON 对象输出，键：name, age, email, is_active, tags。" : " Return a JSON object with keys name, age, email, is_active, tags."), true), response_format: { type: "json_object" as const } };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        return evaluateJson(res, null, req);
      } catch (e) {
        return rejected(e, req);
      }
    },
  },
  schemaTest("structured.json_schema", false, false),
  schemaTest("structured.json_schema_strict", true, false),
  schemaTest("structured.json_schema_nested", true, true),
];
