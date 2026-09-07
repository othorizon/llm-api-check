import { toLlmError, mentionsParam } from "@/lib/llm/errors";
import type { ChatMessage, CompletionResult } from "@/lib/llm/types";
import { SHAPE_WORDS, STATIC_PROBE, makeProbeImage, type ProbeImage } from "../image";
import { msg, type CapTestDef, type Msg } from "../types";
import { SIMPLE_SYSTEM, fromError, ok, responseEvidence, shortNonce } from "../helpers";

function visionMessages(lang: "en" | "zh", url: string): ChatMessage[] {
  const nonce = shortNonce();
  const q =
    lang === "zh"
      ? `看图回答：图中形状是什么颜色？是什么形状？印着什么数字？请按格式回答：color=<英文颜色>, shape=<英文形状>, number=<数字>（标记 ${nonce}）`
      : `Look at the image. What colour is the shape, what shape is it, and what number is printed? Answer exactly in the form: color=<colour>, shape=<shape>, number=<number> (tag ${nonce})`;
  return [
    { role: "system", content: SIMPLE_SYSTEM(lang, nonce) },
    { role: "user", content: [{ type: "text", text: q }, { type: "image_url", image_url: { url } }] },
  ];
}

function evaluate(res: CompletionResult, probe: Pick<ProbeImage, "color" | "shape" | "number">, req: unknown) {
  const text = res.content.toLowerCase();
  const colorOk = text.includes(probe.color.en) || text.includes(probe.color.zh);
  const numberOk = new RegExp(`(^|[^0-9])${probe.number}([^0-9]|$)`).test(text);
  const shapeOk = SHAPE_WORDS[probe.shape].some((w) => text.includes(w));
  const ev = { request: req, response: responseEvidence(res), notes: [] as Msg[], facts: { expectedColor: probe.color.en, expectedShape: probe.shape, expectedNumber: probe.number, colorOk, shapeOk, numberOk } };
  if (colorOk && numberOk) return ok("pass", msg("cap.vision.ok", { color: probe.color.en, shape: probe.shape, number: probe.number }), ev);
  if (colorOk || numberOk || shapeOk) return ok("partial", msg("cap.vision.partial"), ev);
  if (/cannot|can't|unable|no image|not able|无法|不能|没有看到/i.test(text)) return ok("fail", msg("cap.vision.cannot_see"), ev);
  return ok("fail", msg("cap.vision.wrong"), ev);
}

function rejected(e: unknown, req: unknown) {
  const err = toLlmError(e);
  if (err.kind === "aborted") throw err;
  const out = fromError(err, { request: req });
  if (err.kind === "bad_request" && (mentionsParam(err, "image") || mentionsParam(err, "content") || mentionsParam(err, "multimodal"))) out.summary = msg("cap.vision.rejected", { message: (err.providerMessage ?? err.message).slice(0, 160) });
  return out;
}

export const visionTests: CapTestDef[] = [
  {
    id: "vision.base64",
    suite: "vision",
    async run(ctx) {
      const probe = makeProbeImage();
      if (!probe) return ok("skipped", msg("cap.vision.no_canvas"));
      const req = { messages: visionMessages(ctx.lang, probe.dataUrl) };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        return evaluate(res, probe, req);
      } catch (e) {
        return rejected(e, req);
      }
    },
  },
  {
    id: "vision.url",
    suite: "vision",
    dependsOn: ["vision.base64"],
    async run(ctx) {
      if (!ctx.publicOrigin) return ok("skipped", msg("cap.vision.no_public_url"));
      const url = ctx.publicOrigin + STATIC_PROBE.path;
      const req = { messages: visionMessages(ctx.lang, url) };
      try {
        const res = await ctx.send(req, { maxTokens: 1024 });
        return evaluate(res, STATIC_PROBE, req);
      } catch (e) {
        return rejected(e, req);
      }
    },
  },
];
