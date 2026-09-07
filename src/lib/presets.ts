import type { ProviderPresetId } from './types'

export type CorsSupport = 'yes' | 'partial' | 'no' | 'unknown' | 'local'

export interface ProviderPreset {
  id: ProviderPresetId
  name: string
  nameEn: string
  baseUrl: string
  /** 相对 baseUrl 的对话补全路径 */
  chatPath: string
  docsUrl?: string
  keysUrl?: string
  region: 'global' | 'cn' | 'local'
  cors: CorsSupport
  corsNote?: string
  /** 常见模型，用于快速填充 */
  models: string[]
  /** 已知的关闭思维链参数写法 */
  thinkingOff?: string
  note?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    nameEn: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    keysUrl: 'https://platform.openai.com/api-keys',
    region: 'global',
    cors: 'yes',
    corsNote: 'api.openai.com 返回 CORS 响应头，浏览器可直连。',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
    thinkingOff: 'reasoning_effort: "minimal"（仅推理模型；GPT-5 系列支持）',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    nameEn: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://api-docs.deepseek.com/',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    region: 'cn',
    cors: 'unknown',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    note: '缓存命中字段为 usage.prompt_cache_hit_tokens / prompt_cache_miss_tokens。',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼（通义千问）',
    nameEn: 'Alibaba Bailian / Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope',
    keysUrl: 'https://bailian.console.aliyun.com/',
    region: 'cn',
    cors: 'unknown',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-235b-a22b', 'qwen-vl-max'],
    thinkingOff: 'enable_thinking: false（Qwen3 混合推理模型）',
    note: '国际站 Base URL：https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'ark',
    name: '火山方舟（豆包）',
    nameEn: 'Volcengine Ark / Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    chatPath: '/chat/completions',
    docsUrl: 'https://www.volcengine.com/docs/82379',
    keysUrl: 'https://console.volcengine.com/ark',
    region: 'cn',
    cors: 'unknown',
    models: ['doubao-seed-1-6-250615', 'doubao-1-5-pro-32k', 'deepseek-v3'],
    thinkingOff: 'thinking: { type: "disabled" }',
    note: 'model 字段可填推理接入点 ID（ep-xxxx）或模型名。',
  },
  {
    id: 'minimax',
    name: 'MiniMax 稀宇',
    nameEn: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    chatPath: '/text/chatcompletion_v2',
    docsUrl: 'https://platform.minimaxi.com/document/ChatCompletion',
    keysUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    region: 'cn',
    cors: 'unknown',
    models: ['MiniMax-Text-01', 'abab6.5s-chat'],
    note: 'OpenAI 兼容路径是 /text/chatcompletion_v2，而非 /chat/completions。',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    nameEn: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatPath: '/chat/completions',
    docsUrl: 'https://docs.bigmodel.cn/',
    keysUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    region: 'cn',
    cors: 'unknown',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4v-plus', 'glm-z1-air'],
    thinkingOff: 'thinking: { type: "disabled" }（GLM-4.5 起）',
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    nameEn: 'Moonshot Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://platform.moonshot.cn/docs/api/chat',
    keysUrl: 'https://platform.moonshot.cn/console/api-keys',
    region: 'cn',
    cors: 'unknown',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-k2-0711-preview'],
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    nameEn: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://docs.siliconflow.cn/',
    keysUrl: 'https://cloud.siliconflow.cn/account/ak',
    region: 'cn',
    cors: 'unknown',
    models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    thinkingOff: 'enable_thinking: false',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    nameEn: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://openrouter.ai/docs',
    keysUrl: 'https://openrouter.ai/keys',
    region: 'global',
    cors: 'yes',
    corsNote: 'OpenRouter 官方支持浏览器直连。',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'],
    thinkingOff: 'reasoning: { enabled: false }',
  },
  {
    id: 'groq',
    name: 'Groq',
    nameEn: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://console.groq.com/docs',
    keysUrl: 'https://console.groq.com/keys',
    region: 'global',
    cors: 'unknown',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    nameEn: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://docs.x.ai/',
    keysUrl: 'https://console.x.ai/',
    region: 'global',
    cors: 'unknown',
    models: ['grok-2-latest', 'grok-beta'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini（OpenAI 兼容层）',
    nameEn: 'Gemini (OpenAI-compatible)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatPath: '/chat/completions',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    keysUrl: 'https://aistudio.google.com/apikey',
    region: 'global',
    cors: 'unknown',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash'],
    thinkingOff: 'extra_body.google.thinking_config.thinking_budget = 0',
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    nameEn: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    region: 'local',
    cors: 'local',
    corsNote: '需设置 OLLAMA_ORIGINS 允许本站域名，否则浏览器会被 CORS 拦截。',
    models: ['qwen2.5:7b', 'llama3.1:8b'],
  },
  {
    id: 'vllm',
    name: 'vLLM / SGLang（自建）',
    nameEn: 'vLLM / SGLang',
    baseUrl: 'http://localhost:8000/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
    region: 'local',
    cors: 'local',
    corsNote: '启动时加 --allowed-origins 或前置反向代理放行 CORS。',
    models: ['Qwen/Qwen2.5-7B-Instruct'],
    thinkingOff: 'chat_template_kwargs: { enable_thinking: false }',
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容端点',
    nameEn: 'Custom OpenAI-compatible',
    baseUrl: '',
    chatPath: '/chat/completions',
    region: 'global',
    cors: 'unknown',
    models: [],
    note: '任何实现 OpenAI Chat Completions 规范的服务均可接入。',
  },
]

export const PRESET_MAP: Record<ProviderPresetId, ProviderPreset> = Object.fromEntries(
  PROVIDER_PRESETS.map((p) => [p.id, p]),
) as Record<ProviderPresetId, ProviderPreset>

export function presetOf(id: ProviderPresetId | undefined): ProviderPreset {
  return (id && PRESET_MAP[id]) || PRESET_MAP.custom
}
