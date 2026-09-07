/** 通用类型定义 —— 全部数据仅存在于浏览器 localStorage，不会离开设备。 */

export type ProviderPresetId =
  | 'openai'
  | 'deepseek'
  | 'dashscope'
  | 'ark'
  | 'minimax'
  | 'zhipu'
  | 'moonshot'
  | 'siliconflow'
  | 'openrouter'
  | 'groq'
  | 'xai'
  | 'gemini'
  | 'ollama'
  | 'vllm'
  | 'custom'

export interface HeaderPair {
  key: string
  value: string
}

export interface Provider {
  id: string
  name: string
  preset: ProviderPresetId
  /** OpenAI 兼容 Base URL，例如 https://api.openai.com/v1 */
  baseUrl: string
  apiKey: string
  /** 对话补全路径，默认 /chat/completions（MiniMax 等需覆盖） */
  chatPath?: string
  headers: HeaderPair[]
  /** 可选：用户自建的 CORS 中转地址。留空表示浏览器直连。 */
  relayUrl?: string
  createdAt: number
}

export interface ModelEntry {
  id: string
  providerId: string
  /** 传给 API 的 model 字段 */
  model: string
  /** 展示用别名 */
  alias: string
  enabled: boolean
  notes?: string
  createdAt: number
}

/* ------------------------------------------------------------------ */
/* 测试框架                                                             */
/* ------------------------------------------------------------------ */

export type SuiteId = 'performance' | 'capability' | 'message-format'

export type CheckStatus =
  | 'pass'
  | 'partial'
  | 'fail'
  | 'unsupported'
  | 'error'
  | 'skipped'
  | 'running'
  | 'pending'

export interface Evidence {
  label: string
  request?: unknown
  response?: unknown
  error?: string
  httpStatus?: number
  durationMs?: number
  note?: string
}

export interface VariantResult {
  id: string
  label: string
  status: CheckStatus
  note?: string
}

export interface SeriesPoint {
  round: number
  ok: boolean
  ttftMs?: number
  e2eMs?: number
  tps?: number
  outputTokens?: number
}

export interface CheckOutcome {
  status: CheckStatus
  /** 一句话结论 */
  summary: string
  detail?: string
  evidence: Evidence[]
  metrics?: Record<string, number | string | boolean | null>
  variants?: VariantResult[]
  series?: SeriesPoint[]
  /** 结论徽章（如语音场景评级） */
  grade?: { label: string; tone: 'ok' | 'warn' | 'bad' | 'info'; score?: number }
  startedAt?: number
  finishedAt?: number
}

export interface RunOptions {
  /** 性能测试轮数 */
  rounds: number
  /** 最大输出 token */
  maxTokens: number
  temperature: number
  /** 单个模型的并发（同一时刻发起的请求数） */
  concurrency: number
  /** 单次请求超时（毫秒） */
  timeoutMs: number
  /** 缓存测试使用的前缀 token 量级（近似） */
  cachePrefixTokens: number
  /** 是否在每轮请求中注入随机前缀以规避 prompt cache */
  randomizePrompts: boolean
  /** 性能测试使用的输出长度目标 */
  perfOutputTokens: number
}

export interface CheckDef {
  id: string
  suite: SuiteId
  group: string
  title: string
  subtitle?: string
  /** 展开说明（popover / 详情） */
  doc: string
  /** 依赖的其它检查 id，若依赖失败则跳过 */
  requires?: string[]
  /** 大致请求次数，用于进度与成本预估 */
  weight?: number
  run: (ctx: RunContext) => Promise<CheckOutcome>
}

export interface CheckGroupDef {
  id: string
  suite: SuiteId
  title: string
  desc: string
}

export interface ModelRunResult {
  modelId: string
  status: 'pending' | 'running' | 'done' | 'aborted' | 'error'
  startedAt?: number
  finishedAt?: number
  error?: string
  /** 正在执行的 check id 与子步骤说明（仅运行期有意义） */
  current?: string
  note?: string
  checks: Record<string, CheckOutcome>
}

export interface RunSession {
  id: string
  label: string
  createdAt: number
  finishedAt?: number
  modelIds: string[]
  /** 快照，避免模型被删除后结果无法解读 */
  modelSnapshots: Record<string, { alias: string; model: string; providerName: string; preset: ProviderPresetId }>
  suites: SuiteId[]
  checkIds: string[]
  options: RunOptions
  results: Record<string, ModelRunResult>
  status: 'running' | 'done' | 'aborted'
}

/* ------------------------------------------------------------------ */
/* 请求 / 响应                                                          */
/* ------------------------------------------------------------------ */

export interface ToolCall {
  id: string
  name: string
  argumentsRaw: string
}

export interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedTokens?: number
  cacheField?: string
  raw?: unknown
}

export interface ChatTiming {
  startedAt: number
  /** time to first token（首个可见内容 token） */
  ttftMs?: number
  /** time to first reasoning token */
  ttfrMs?: number
  totalMs: number
  /** 各 chunk 到达的相对时间，用于计算抖动 */
  chunkAtMs: number[]
}

export type ReasoningChannel = 'reasoning_content' | 'reasoning' | 'think_tag' | 'reasoning_details' | null

export interface ChatResult {
  ok: boolean
  httpStatus: number
  errorMessage?: string
  errorBody?: unknown
  content: string
  reasoning: string
  reasoningChannel: ReasoningChannel
  toolCalls: ToolCall[]
  finishReason?: string
  usage?: UsageInfo
  timing: ChatTiming
  requestBody: Record<string, unknown>
  /** 非流式：完整响应；流式：聚合后的精简对象 */
  raw?: unknown
  /** 自动兼容修复（如 max_tokens -> max_completion_tokens） */
  fixesApplied: string[]
  /** 网络层错误（CORS / DNS / 超时） */
  networkError?: 'cors' | 'timeout' | 'abort' | 'network'
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer'
  content?: unknown
  name?: string
  tool_calls?: unknown[]
  tool_call_id?: string
  [k: string]: unknown
}

export interface ChatRequest {
  messages: ChatMessage[]
  stream?: boolean
  tools?: unknown[]
  tool_choice?: unknown
  response_format?: unknown
  maxTokens?: number
  temperature?: number
  /** 直接透传到请求体的额外字段 */
  extra?: Record<string, unknown>
  /** 关闭 max_tokens / temperature 的自动注入 */
  omitMaxTokens?: boolean
  omitTemperature?: boolean
}

export interface RunContext {
  model: ModelEntry
  provider: Provider
  options: RunOptions
  signal: AbortSignal
  chat: (req: ChatRequest) => Promise<ChatResult>
  /** 上报子步骤进度 */
  progress: (note: string) => void
  /** 跨 check 共享的缓存（例如推理通道探测结果） */
  shared: Map<string, unknown>
}
