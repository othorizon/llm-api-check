/**
 * Known request-body dialects for switching a model's reasoning ("thinking",
 * "chain-of-thought") on or off through OpenAI-compatible endpoints.
 * The capability suite tries every dialect and reports which ones the endpoint
 * accepts and which ones actually change the model's behaviour.
 */
export interface ReasoningDialect {
  id: string;
  /** Short label shown in the UI, e.g. `reasoning_effort: "none"`. */
  label: string;
  /** Extra body params that should turn reasoning OFF. */
  disable: Record<string, unknown>;
  /** Extra body params that should turn reasoning ON (or up). */
  enable: Record<string, unknown>;
  /** Vendors/servers documented to use this dialect. */
  vendors: string;
}

export const REASONING_DIALECTS: ReasoningDialect[] = [
  {
    id: "reasoning_effort_none",
    label: 'reasoning_effort: "none"',
    disable: { reasoning_effort: "none" },
    enable: { reasoning_effort: "high" },
    vendors: "OpenAI (GPT-5.1+), Groq, Gemini (OpenAI-compatible), xAI",
  },
  {
    id: "reasoning_effort_minimal",
    label: 'reasoning_effort: "minimal"',
    disable: { reasoning_effort: "minimal" },
    enable: { reasoning_effort: "high" },
    vendors: "OpenAI (GPT-5 family), Anthropic (OpenAI-compatible layer), OpenRouter",
  },
  {
    id: "thinking_type",
    label: 'thinking: { type: "disabled" }',
    disable: { thinking: { type: "disabled" } },
    enable: { thinking: { type: "enabled" } },
    vendors: "Volcengine Ark (Doubao), Zhipu GLM, Moonshot Kimi, DeepSeek (V3.2+), Anthropic-style gateways",
  },
  {
    id: "enable_thinking",
    label: "enable_thinking: false",
    disable: { enable_thinking: false },
    enable: { enable_thinking: true },
    vendors: "Alibaba Qwen (DashScope compatible mode), SiliconFlow, Baidu Qianfan, vLLM (legacy)",
  },
  {
    id: "chat_template_kwargs",
    label: "chat_template_kwargs: { enable_thinking: false }",
    disable: { chat_template_kwargs: { enable_thinking: false } },
    enable: { chat_template_kwargs: { enable_thinking: true } },
    vendors: "vLLM, SGLang, llama.cpp server (Qwen3 / DeepSeek chat templates)",
  },
  {
    id: "openrouter_reasoning",
    label: "reasoning: { enabled: false }",
    disable: { reasoning: { enabled: false } },
    enable: { reasoning: { effort: "high" } },
    vendors: "OpenRouter",
  },
  {
    id: "ollama_think",
    label: "think: false",
    disable: { think: false },
    enable: { think: true },
    vendors: "Ollama",
  },
  {
    id: "gemini_thinking_budget",
    label: "extra_body.google.thinking_config.thinking_budget: 0",
    disable: { extra_body: { google: { thinking_config: { thinking_budget: 0 } } } },
    enable: { extra_body: { google: { thinking_config: { thinking_budget: 2048, include_thoughts: true } } } },
    vendors: "Google Gemini (OpenAI-compatible endpoint)",
  },
];

export const REASONING_EFFORT_LEVELS = ["minimal", "low", "medium", "high"] as const;
