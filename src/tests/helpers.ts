import type { ChatResult, CheckOutcome, Evidence } from '../lib/types'
import { estimateTokens, redact } from '../lib/util'

export function outputTokens(res: ChatResult): number {
  const fromUsage = res.usage?.completionTokens
  if (typeof fromUsage === 'number' && fromUsage > 0) return fromUsage
  return estimateTokens(res.content) + estimateTokens(res.reasoning)
}

export function tokensAreEstimated(res: ChatResult): boolean {
  return !(typeof res.usage?.completionTokens === 'number' && res.usage.completionTokens > 0)
}

/** 输出速度：解码阶段的 token/s（排除首 token 等待） */
export function decodeTps(res: ChatResult): number | undefined {
  const out = outputTokens(res)
  const ttft = res.timing.ttftMs ?? 0
  const decodeMs = res.timing.totalMs - ttft
  if (!out || decodeMs <= 1) return undefined
  return (out / decodeMs) * 1000
}

/** 端到端速度：总耗时口径的 token/s */
export function e2eTps(res: ChatResult): number | undefined {
  const out = outputTokens(res)
  if (!out || res.timing.totalMs <= 1) return undefined
  return (out / res.timing.totalMs) * 1000
}

/** token 间隔（inter-token latency）序列 */
export function itlSeries(res: ChatResult): number[] {
  const t = res.timing.chunkAtMs
  if (t.length < 3) return []
  const out: number[] = []
  for (let i = 1; i < t.length; i++) out.push(t[i] - t[i - 1])
  return out
}

export function evidence(label: string, res: ChatResult, note?: string): Evidence {
  return {
    label,
    request: redact(res.requestBody),
    response: res.ok
      ? {
          content: trim(res.content, 1500),
          reasoning: res.reasoning ? trim(res.reasoning, 800) : undefined,
          reasoning_channel: res.reasoningChannel ?? undefined,
          tool_calls: res.toolCalls.length ? res.toolCalls : undefined,
          finish_reason: res.finishReason,
          usage: res.usage?.raw,
        }
      : res.errorBody,
    error: res.ok ? undefined : res.errorMessage,
    httpStatus: res.httpStatus,
    durationMs: Math.round(res.timing.totalMs),
    note: note ?? (res.fixesApplied.length ? `自动兼容修复：${res.fixesApplied.join('；')}` : undefined),
  }
}

function trim(s: string, n: number): string {
  if (!s) return s
  return s.length > n ? `${s.slice(0, n)}… [共 ${s.length} 字符]` : s
}

/** 网络层 / 鉴权层错误 —— 与“能力不支持”区分开 */
export function transportFailure(res: ChatResult): CheckOutcome | null {
  if (res.ok) return null
  if (res.networkError === 'cors') {
    return {
      status: 'error',
      summary: '浏览器无法连接该端点（疑似 CORS 未放行）',
      detail: res.errorMessage,
      evidence: [evidence('请求失败', res)],
    }
  }
  if (res.networkError === 'timeout') {
    return { status: 'error', summary: '请求超时', detail: res.errorMessage, evidence: [evidence('请求超时', res)] }
  }
  if (res.networkError === 'abort') {
    return { status: 'skipped', summary: '已取消', evidence: [] }
  }
  if (res.httpStatus === 401 || res.httpStatus === 403) {
    return {
      status: 'error',
      summary: `鉴权失败（HTTP ${res.httpStatus}）`,
      detail: res.errorMessage,
      evidence: [evidence('鉴权失败', res)],
    }
  }
  if (res.httpStatus === 429) {
    return {
      status: 'error',
      summary: '触发限流（HTTP 429），请降低并发后重试',
      detail: res.errorMessage,
      evidence: [evidence('限流', res)],
    }
  }
  if (res.httpStatus >= 500) {
    return {
      status: 'error',
      summary: `服务端错误（HTTP ${res.httpStatus}）`,
      detail: res.errorMessage,
      evidence: [evidence('服务端错误', res)],
    }
  }
  return null
}

/** 判定 4xx 是否为“参数不被支持” */
export function isParamRejection(res: ChatResult): boolean {
  return !res.ok && res.httpStatus >= 400 && res.httpStatus < 500
}

export function contains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}
