/**
 * 关闭思维链的传参写法。
 *
 * 业界没有统一参数，这里集中维护一份，供「能力测试 → 关闭思维链的传参方式」
 * 逐一探测，以及「性能测试」在对比条件下选用其中一种。
 */
export interface ThinkingOffVariant {
  id: string
  /** 展示用的参数写法 */
  label: string
  /** 直接透传到请求体的字段 */
  extra: Record<string, unknown>
  /** 常见于哪些厂商 */
  vendors: string
}

export const THINKING_OFF_VARIANTS: ThinkingOffVariant[] = [
  {
    id: 'thinking-disabled',
    label: 'thinking: { type: "disabled" }',
    extra: { thinking: { type: 'disabled' } },
    vendors: '火山方舟豆包、GLM-4.5+',
  },
  {
    id: 'enable-thinking',
    label: 'enable_thinking: false',
    extra: { enable_thinking: false },
    vendors: '通义千问 Qwen3、硅基流动',
  },
  {
    id: 'effort-minimal',
    label: 'reasoning_effort: "minimal"',
    extra: { reasoning_effort: 'minimal' },
    vendors: 'OpenAI GPT-5 系列',
  },
  {
    id: 'effort-none',
    label: 'reasoning_effort: "none"',
    extra: { reasoning_effort: 'none' },
    vendors: '部分兼容网关',
  },
  {
    id: 'chat-template',
    label: 'chat_template_kwargs: { enable_thinking: false }',
    extra: { chat_template_kwargs: { enable_thinking: false } },
    vendors: 'vLLM / SGLang 自建',
  },
  {
    id: 'openrouter',
    label: 'reasoning: { enabled: false }',
    extra: { reasoning: { enabled: false } },
    vendors: 'OpenRouter',
  },
]

/** 性能对比默认采用的写法 */
export const DEFAULT_THINKING_OFF_ID = 'thinking-disabled'

export function thinkingOffVariant(id: string | undefined): ThinkingOffVariant {
  return THINKING_OFF_VARIANTS.find((v) => v.id === id) ?? THINKING_OFF_VARIANTS[0]
}
