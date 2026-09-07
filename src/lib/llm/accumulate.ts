import type { CompletionResult, ToolCall, Usage } from "./types";

/**
 * Splits `<think>...</think>` blocks (used by MiniMax M2, some vLLM/Ollama chat
 * templates) out of visible content. Works incrementally on a growing buffer.
 */
export function splitThinkTags(text: string): { content: string; reasoning: string; open: boolean } {
  let content = "";
  let reasoning = "";
  let rest = text;
  let open = false;
  while (rest.length) {
    const start = rest.indexOf("<think>");
    if (start === -1) {
      content += rest;
      break;
    }
    content += rest.slice(0, start);
    const afterOpen = rest.slice(start + 7);
    const end = afterOpen.indexOf("</think>");
    if (end === -1) {
      reasoning += afterOpen;
      open = true;
      break;
    }
    reasoning += afterOpen.slice(0, end);
    rest = afterOpen.slice(end + 8);
  }
  return { content, reasoning, open };
}

/** Incrementally assembles an OpenAI streaming response. */
export class StreamAccumulator {
  rawContent = "";
  reasoning = "";
  reasoningSource: CompletionResult["reasoningSource"] = null;
  toolCalls: ToolCall[] = [];
  finishReason: string | null = null;
  refusal: string | null = null;
  usage: Usage | null = null;
  chunkCount = 0;
  lastChunk: unknown = null;
  model: string | undefined;
  id: string | undefined;
  sawAnyDelta = false;
  sawContent = false;
  sawReasoning = false;
  sawToolCall = false;

  /** Returns which kinds of delta this chunk carried. */
  push(chunk: any): { content: boolean; reasoning: boolean; toolCall: boolean } {
    this.chunkCount++;
    this.lastChunk = chunk;
    const flags = { content: false, reasoning: false, toolCall: false };
    if (!chunk || typeof chunk !== "object") return flags;
    if (chunk.model && !this.model) this.model = chunk.model;
    if (chunk.id && !this.id) this.id = chunk.id;
    if (chunk.usage) this.usage = { ...(this.usage ?? {}), ...chunk.usage };
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (!choice) return flags;
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
    const delta = choice.delta ?? choice.message ?? {};
    if (typeof delta.content === "string" && delta.content.length) {
      this.rawContent += delta.content;
      // Content inside <think> tags counts as reasoning, not content.
      const split = splitThinkTags(this.rawContent);
      if (split.content.trim().length > 0 || (!split.open && split.reasoning.length === 0)) {
        flags.content = true;
        this.sawContent = true;
      } else if (split.reasoning.length > 0) {
        flags.reasoning = true;
        this.sawReasoning = true;
        if (!this.reasoningSource) this.reasoningSource = "think_tag";
      }
    }
    const r = typeof delta.reasoning_content === "string" ? delta.reasoning_content : typeof delta.reasoning === "string" ? delta.reasoning : null;
    if (r && r.length) {
      this.reasoning += r;
      flags.reasoning = true;
      this.sawReasoning = true;
      if (!this.reasoningSource) this.reasoningSource = typeof delta.reasoning_content === "string" ? "reasoning_content" : "reasoning";
    }
    if (typeof delta.refusal === "string" && delta.refusal.length) {
      this.refusal = (this.refusal ?? "") + delta.refusal;
      flags.content = true;
    }
    if (Array.isArray(delta.tool_calls)) {
      for (let i = 0; i < delta.tool_calls.length; i++) {
        const tc = delta.tool_calls[i];
        const idx = typeof tc.index === "number" ? tc.index : this.toolCalls.length && !tc.id ? this.toolCalls.length - 1 : this.toolCalls.length;
        let target = this.toolCalls[idx];
        if (!target) {
          target = { id: tc.id, type: "function", index: idx, function: { name: "", arguments: "" } };
          this.toolCalls[idx] = target;
        }
        if (tc.id && !target.id) target.id = tc.id;
        if (tc.function?.name) target.function.name += tc.function.name;
        if (typeof tc.function?.arguments === "string") target.function.arguments += tc.function.arguments;
        flags.toolCall = true;
        this.sawToolCall = true;
      }
    }
    if (flags.content || flags.reasoning || flags.toolCall) this.sawAnyDelta = true;
    return flags;
  }

  finalize(): Pick<CompletionResult, "content" | "reasoning" | "reasoningSource" | "toolCalls" | "finishReason" | "refusal" | "usage" | "chunkCount" | "model" | "id"> {
    const split = splitThinkTags(this.rawContent);
    const reasoning = (this.reasoning + (split.reasoning ? (this.reasoning ? "\n" : "") + split.reasoning : "")).trim();
    let source = this.reasoningSource;
    if (!source && reasoning) source = "think_tag";
    if (!source && this.usage?.completion_tokens_details?.reasoning_tokens) source = "hidden_tokens";
    return {
      content: split.content.trim(),
      reasoning,
      reasoningSource: source,
      toolCalls: this.toolCalls.filter(Boolean),
      finishReason: this.finishReason,
      refusal: this.refusal,
      usage: this.usage,
      chunkCount: this.chunkCount,
      model: this.model,
      id: this.id,
    };
  }
}

/** Normalises a non-streaming response object. */
export function parseNonStreamResponse(json: any): Pick<CompletionResult, "content" | "reasoning" | "reasoningSource" | "toolCalls" | "finishReason" | "refusal" | "usage" | "model" | "id"> {
  const choice = Array.isArray(json?.choices) ? json.choices[0] : undefined;
  const msg = choice?.message ?? {};
  let rawContent = "";
  if (typeof msg.content === "string") rawContent = msg.content;
  else if (Array.isArray(msg.content)) rawContent = msg.content.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  const split = splitThinkTags(rawContent);
  let reasoning = "";
  let source: CompletionResult["reasoningSource"] = null;
  if (typeof msg.reasoning_content === "string" && msg.reasoning_content.trim()) {
    reasoning = msg.reasoning_content;
    source = "reasoning_content";
  } else if (typeof msg.reasoning === "string" && msg.reasoning.trim()) {
    reasoning = msg.reasoning;
    source = "reasoning";
  }
  if (split.reasoning.trim()) {
    reasoning = reasoning ? reasoning + "\n" + split.reasoning : split.reasoning;
    if (!source) source = "think_tag";
  }
  const usage: Usage | null = json?.usage ?? null;
  if (!source && usage?.completion_tokens_details?.reasoning_tokens) source = "hidden_tokens";
  const toolCalls: ToolCall[] = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((tc: any, i: number) => ({
        id: tc.id,
        type: "function",
        index: typeof tc.index === "number" ? tc.index : i,
        function: { name: tc.function?.name ?? "", arguments: typeof tc.function?.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? "") },
      }))
    : [];
  return {
    content: split.content.trim(),
    reasoning: reasoning.trim(),
    reasoningSource: source,
    toolCalls,
    finishReason: choice?.finish_reason ?? null,
    refusal: typeof msg.refusal === "string" ? msg.refusal : null,
    usage,
    model: json?.model,
    id: json?.id,
  };
}
