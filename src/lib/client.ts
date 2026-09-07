import type {
  ChatRequest,
  ChatResult,
  ModelEntry,
  Provider,
  ReasoningChannel,
  ToolCall,
  UsageInfo,
} from './types'
import { presetOf } from './presets'

/* ------------------------------------------------------------------ */
/* URL / headers                                                       */
/* ------------------------------------------------------------------ */

export function chatUrl(provider: Provider): string {
  const base = (provider.baseUrl || '').trim().replace(/\/+$/, '')
  const path = (provider.chatPath || presetOf(provider.preset).chatPath || '/chat/completions').trim()
  const full = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const relay = provider.relayUrl?.trim()
  if (!relay) return full
  // 中转支持两种写法：以 {url} 占位，或直接前缀拼接
  if (relay.includes('{url}')) return relay.replace('{url}', encodeURIComponent(full))
  return relay.replace(/\/+$/, '') + '/' + full.replace(/^https?:\/\//, '')
}

export function modelsUrl(provider: Provider): string {
  const base = (provider.baseUrl || '').trim().replace(/\/+$/, '')
  return `${base}/models`
}

export function buildHeaders(provider: Provider): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.apiKey?.trim()) h.Authorization = `Bearer ${provider.apiKey.trim()}`
  for (const { key, value } of provider.headers || []) {
    if (key?.trim()) h[key.trim()] = value ?? ''
  }
  return h
}

/* ------------------------------------------------------------------ */
/* 解析辅助                                                            */
/* ------------------------------------------------------------------ */

const THINK_TAG = /<(think|thinking|reasoning)>([\s\S]*?)(<\/\1>|$)/gi

export function splitThinkTags(text: string): { content: string; reasoning: string; found: boolean } {
  if (!text || !/<(think|thinking|reasoning)>/i.test(text)) return { content: text, reasoning: '', found: false }
  let reasoning = ''
  const content = text.replace(THINK_TAG, (_m, _tag, inner) => {
    reasoning += inner
    return ''
  })
  return { content: content.trim(), reasoning: reasoning.trim(), found: true }
}

function pickString(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    return v
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const o = part as Record<string, unknown>
          if (typeof o.text === 'string') return o.text
          if (typeof o.content === 'string') return o.content
        }
        return ''
      })
      .join('')
  }
  return ''
}

export function parseUsage(raw: unknown): UsageInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const u = raw as Record<string, any>
  const promptDetails = u.prompt_tokens_details ?? u.input_tokens_details
  const completionDetails = u.completion_tokens_details ?? u.output_tokens_details
  let cachedTokens: number | undefined
  let cacheField: string | undefined
  const candidates: Array<[string, unknown]> = [
    ['usage.prompt_tokens_details.cached_tokens', promptDetails?.cached_tokens],
    ['usage.prompt_cache_hit_tokens', u.prompt_cache_hit_tokens],
    ['usage.cached_tokens', u.cached_tokens],
    ['usage.prompt_tokens_details.cache_read_input_tokens', promptDetails?.cache_read_input_tokens],
    ['usage.cache_read_input_tokens', u.cache_read_input_tokens],
  ]
  for (const [field, val] of candidates) {
    if (typeof val === 'number') {
      cachedTokens = val
      cacheField = field
      break
    }
  }
  return {
    promptTokens: num(u.prompt_tokens ?? u.input_tokens),
    completionTokens: num(u.completion_tokens ?? u.output_tokens),
    totalTokens: num(u.total_tokens),
    reasoningTokens: num(completionDetails?.reasoning_tokens),
    cachedTokens,
    cacheField,
    raw,
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/* ------------------------------------------------------------------ */
/* 请求体构造                                                          */
/* ------------------------------------------------------------------ */

export function buildBody(model: ModelEntry, req: ChatRequest, tweaks: Tweaks): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: model.model,
    messages: req.messages,
  }
  if (req.stream) {
    body.stream = true
    if (!tweaks.dropStreamOptions) body.stream_options = { include_usage: true }
  }
  if (req.tools) body.tools = req.tools
  if (req.tool_choice !== undefined) body.tool_choice = req.tool_choice
  if (req.response_format) body.response_format = req.response_format
  if (!req.omitMaxTokens && req.maxTokens != null) {
    if (tweaks.useMaxCompletionTokens) body.max_completion_tokens = req.maxTokens
    else body.max_tokens = req.maxTokens
  }
  if (!req.omitTemperature && !tweaks.dropTemperature && req.temperature != null) {
    body.temperature = req.temperature
  }
  Object.assign(body, req.extra ?? {})
  return body
}

interface Tweaks {
  useMaxCompletionTokens: boolean
  dropTemperature: boolean
  dropStreamOptions: boolean
}

/** 只针对与被测能力无关的参数做兼容重试，避免掩盖真实的能力缺失 */
function nextTweak(errText: string, t: Tweaks): { tweaks: Tweaks; fix: string } | null {
  const e = errText.toLowerCase()
  if (!t.useMaxCompletionTokens && /max_tokens/.test(e) && /(not support|unsupported|use\s+`?max_completion_tokens|deprecat|invalid)/.test(e)) {
    return { tweaks: { ...t, useMaxCompletionTokens: true }, fix: 'max_tokens → max_completion_tokens' }
  }
  if (!t.dropTemperature && /temperature/.test(e) && /(not support|unsupported|only the default|does not support|invalid)/.test(e)) {
    return { tweaks: { ...t, dropTemperature: true }, fix: '移除 temperature（模型仅支持默认值）' }
  }
  if (!t.dropStreamOptions && /stream_options/.test(e)) {
    return { tweaks: { ...t, dropStreamOptions: true }, fix: '移除 stream_options.include_usage' }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

export interface ChatDeps {
  provider: Provider
  model: ModelEntry
  timeoutMs: number
  signal?: AbortSignal
}

export async function chat(deps: ChatDeps, req: ChatRequest): Promise<ChatResult> {
  let tweaks: Tweaks = { useMaxCompletionTokens: false, dropTemperature: false, dropStreamOptions: false }
  const fixes: string[] = []
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await chatOnce(deps, req, tweaks)
    res.fixesApplied = [...fixes]
    if (res.ok || res.httpStatus < 400) return res
    const errText = `${res.errorMessage ?? ''} ${JSON.stringify(res.errorBody ?? '')}`
    const next = nextTweak(errText, tweaks)
    if (!next) return res
    tweaks = next.tweaks
    fixes.push(next.fix)
  }
  return chatOnce(deps, req, tweaks)
}

async function chatOnce(deps: ChatDeps, req: ChatRequest, tweaks: Tweaks): Promise<ChatResult> {
  const { provider, model, timeoutMs, signal } = deps
  const body = buildBody(model, req, tweaks)
  const startedAt = performance.now()
  const result: ChatResult = {
    ok: false,
    httpStatus: 0,
    content: '',
    reasoning: '',
    reasoningChannel: null,
    toolCalls: [],
    timing: { startedAt, totalMs: 0, chunkAtMs: [] },
    requestBody: body,
    fixesApplied: [],
  }

  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs)
  let timedOut = false
  ctrl.signal.addEventListener('abort', () => {
    if (ctrl.signal.reason === 'timeout') timedOut = true
  })

  try {
    const resp = await fetch(chatUrl(provider), {
      method: 'POST',
      headers: buildHeaders(provider),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    result.httpStatus = resp.status

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch { /* keep text */ }
      result.errorBody = parsed
      result.errorMessage = extractErrMessage(parsed) || `HTTP ${resp.status}`
      result.timing.totalMs = performance.now() - startedAt
      return result
    }

    const ctype = resp.headers.get('content-type') || ''
    if (req.stream && (ctype.includes('text/event-stream') || !ctype.includes('application/json'))) {
      await consumeStream(resp, result)
    } else {
      const json = await resp.json()
      applyNonStream(json, result)
    }
    result.ok = true
    result.timing.totalMs = performance.now() - startedAt
    return result
  } catch (err) {
    result.timing.totalMs = performance.now() - startedAt
    const e = err as Error
    if (timedOut) {
      result.networkError = 'timeout'
      result.errorMessage = `请求超时（> ${timeoutMs} ms）`
    } else if (e?.name === 'AbortError') {
      result.networkError = 'abort'
      result.errorMessage = '已取消'
    } else if (e instanceof TypeError) {
      result.networkError = navigator.onLine === false ? 'network' : 'cors'
      result.errorMessage =
        navigator.onLine === false
          ? '网络不可用'
          : '请求未发出或被浏览器拦截：通常是目标服务未返回 CORS 响应头（Access-Control-Allow-Origin），也可能是域名无法解析 / 证书错误。'
    } else {
      result.networkError = 'network'
      result.errorMessage = e?.message || String(err)
    }
    return result
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function extractErrMessage(body: unknown): string | undefined {
  if (!body) return undefined
  if (typeof body === 'string') return body.slice(0, 1200)
  const o = body as Record<string, any>
  const cand =
    o?.error?.message ??
    o?.error?.msg ??
    o?.message ??
    o?.msg ??
    o?.base_resp?.status_msg ??
    o?.detail
  if (typeof cand === 'string') return cand
  return JSON.stringify(body).slice(0, 1200)
}

/* ------------------------------------------------------------------ */
/* 非流式                                                              */
/* ------------------------------------------------------------------ */

function applyNonStream(json: any, result: ChatResult) {
  result.raw = json
  const choice = json?.choices?.[0]
  const msg = choice?.message ?? {}
  let content = pickString(msg.content)
  const reasoningRaw =
    (typeof msg.reasoning_content === 'string' && msg.reasoning_content) ||
    (typeof msg.reasoning === 'string' && msg.reasoning) ||
    ''
  let channel: ReasoningChannel = null
  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content) channel = 'reasoning_content'
  else if (typeof msg.reasoning === 'string' && msg.reasoning) channel = 'reasoning'
  else if (Array.isArray(msg.reasoning_details) && msg.reasoning_details.length) channel = 'reasoning_details'

  let reasoning = reasoningRaw
  if (!reasoning) {
    const split = splitThinkTags(content)
    if (split.found && split.reasoning) {
      reasoning = split.reasoning
      content = split.content
      channel = 'think_tag'
    }
  }
  if (!reasoning && channel === 'reasoning_details') {
    reasoning = (msg.reasoning_details as any[])
      .map((d) => (typeof d?.text === 'string' ? d.text : typeof d?.summary === 'string' ? d.summary : ''))
      .join('\n')
  }

  result.content = content
  result.reasoning = reasoning
  result.reasoningChannel = channel
  result.finishReason = choice?.finish_reason ?? choice?.finishReason
  result.usage = parseUsage(json?.usage)
  result.toolCalls = normalizeToolCalls(msg.tool_calls)
  // 首 token 时间在非流式场景等价于整体耗时
  result.timing.ttftMs = performance.now() - result.timing.startedAt
}

function normalizeToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return []
  return raw.map((tc: any, i: number) => ({
    id: tc?.id ?? `call_${i}`,
    name: tc?.function?.name ?? tc?.name ?? '',
    argumentsRaw: typeof tc?.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc?.function?.arguments ?? {}),
  }))
}

/* ------------------------------------------------------------------ */
/* 流式                                                                */
/* ------------------------------------------------------------------ */

async function consumeStream(resp: Response, result: ChatResult) {
  const reader = resp.body?.getReader()
  if (!reader) throw new TypeError('响应没有可读流')
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let lastChunk: any = null
  const toolAcc = new Map<number, { id: string; name: string; args: string }>()
  let sawThinkOpen = false
  let usageRaw: unknown

  const push = (fn: () => void) => {
    result.timing.chunkAtMs.push(performance.now() - result.timing.startedAt)
    fn()
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      for (const line of part.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let json: any
        try {
          json = JSON.parse(payload)
        } catch {
          continue
        }
        lastChunk = json
        if (json.usage) usageRaw = json.usage
        const delta = json?.choices?.[0]?.delta ?? json?.choices?.[0]?.message
        const fr = json?.choices?.[0]?.finish_reason
        if (fr) result.finishReason = fr
        if (!delta) continue

        const rc =
          (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
          (typeof delta.reasoning === 'string' && delta.reasoning) ||
          ''
        if (rc) {
          if (!result.reasoningChannel) {
            result.reasoningChannel = typeof delta.reasoning_content === 'string' ? 'reasoning_content' : 'reasoning'
          }
          push(() => {
            if (result.timing.ttfrMs == null) result.timing.ttfrMs = performance.now() - result.timing.startedAt
            result.reasoning += rc
          })
        }
        if (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length) {
          if (!result.reasoningChannel) result.reasoningChannel = 'reasoning_details'
          const t = delta.reasoning_details
            .map((d: any) => (typeof d?.text === 'string' ? d.text : ''))
            .join('')
          if (t) {
            push(() => {
              if (result.timing.ttfrMs == null) result.timing.ttfrMs = performance.now() - result.timing.startedAt
              result.reasoning += t
            })
          }
        }

        const c = pickString(delta.content)
        if (c) {
          push(() => {
            // <think> 标签流式拆分
            if (!sawThinkOpen && /<(think|thinking|reasoning)>/i.test(result.content + c)) sawThinkOpen = true
            result.content += c
            if (!sawThinkOpen && result.timing.ttftMs == null) {
              result.timing.ttftMs = performance.now() - result.timing.startedAt
            }
          })
        }

        if (Array.isArray(delta.tool_calls)) {
          push(() => {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc.index === 'number' ? tc.index : toolAcc.size
              const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' }
              if (tc.id) cur.id = tc.id
              if (tc.function?.name) cur.name += tc.function.name
              if (typeof tc.function?.arguments === 'string') cur.args += tc.function.arguments
              toolAcc.set(idx, cur)
            }
          })
        }
      }
    }
  }

  if (sawThinkOpen) {
    const split = splitThinkTags(result.content)
    if (split.found) {
      result.content = split.content
      if (split.reasoning) {
        result.reasoning = result.reasoning || split.reasoning
        result.reasoningChannel = result.reasoningChannel ?? 'think_tag'
      }
      // 重新估算 TTFT：think 标签闭合后的首个可见 token 无法精确定位，退化为整体耗时
      if (result.timing.ttftMs == null) result.timing.ttftMs = performance.now() - result.timing.startedAt
    }
  }
  if (result.timing.ttftMs == null && result.timing.chunkAtMs.length) {
    result.timing.ttftMs = result.timing.chunkAtMs[0]
  }

  result.toolCalls = Array.from(toolAcc.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([i, v]) => ({ id: v.id || `call_${i}`, name: v.name, argumentsRaw: v.args }))
  result.usage = parseUsage(usageRaw)
  result.raw = {
    note: '流式响应已聚合展示',
    lastChunk,
    chunks: result.timing.chunkAtMs.length,
    content: result.content,
    reasoning: result.reasoning ? `${result.reasoning.slice(0, 2000)}` : '',
    tool_calls: result.toolCalls,
    usage: usageRaw,
  }
}

/* ------------------------------------------------------------------ */
/* 连通性自检                                                          */
/* ------------------------------------------------------------------ */

export interface ProbeResult {
  ok: boolean
  status: number
  message: string
  kind: 'ok' | 'auth' | 'cors' | 'notfound' | 'network' | 'other'
  models?: string[]
  durationMs: number
}

export async function probeProvider(provider: Provider, timeoutMs = 20000): Promise<ProbeResult> {
  const started = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs)
  try {
    const resp = await fetch(modelsUrl(provider), { headers: buildHeaders(provider), signal: ctrl.signal })
    const durationMs = performance.now() - started
    if (resp.ok) {
      const json: any = await resp.json().catch(() => null)
      const list: string[] = Array.isArray(json?.data)
        ? json.data.map((m: any) => m?.id).filter((x: unknown): x is string => typeof x === 'string')
        : []
      return { ok: true, status: resp.status, kind: 'ok', message: `连接正常，返回 ${list.length} 个模型`, models: list, durationMs }
    }
    const text = await resp.text().catch(() => '')
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, status: resp.status, kind: 'auth', message: `鉴权失败（${resp.status}）：请检查 API Key。${text.slice(0, 200)}`, durationMs }
    }
    if (resp.status === 404) {
      return { ok: false, status: resp.status, kind: 'notfound', message: '该服务未提供 /models 列表接口（不影响对话测试）。', durationMs }
    }
    return { ok: false, status: resp.status, kind: 'other', message: `HTTP ${resp.status}：${text.slice(0, 300)}`, durationMs }
  } catch (err) {
    const durationMs = performance.now() - started
    const e = err as Error
    if (e?.name === 'AbortError') {
      return { ok: false, status: 0, kind: 'network', message: `连接超时（> ${timeoutMs} ms）`, durationMs }
    }
    return {
      ok: false,
      status: 0,
      kind: 'cors',
      message:
        '浏览器无法直连该地址。多数情况是服务端未开启 CORS（缺少 Access-Control-Allow-Origin 响应头）；也可能是地址错误或 HTTPS 页面访问了 HTTP 地址。',
      durationMs,
    }
  } finally {
    clearTimeout(timer)
  }
}
