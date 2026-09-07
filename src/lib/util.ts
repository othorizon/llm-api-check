export function uid(prefix = ''): string {
  const s = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return prefix ? `${prefix}_${s}` : s
}

export function nonce(len = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export interface Stats {
  n: number
  min: number
  max: number
  mean: number
  p50: number
  p90: number
  p95: number
  stdev: number
}

export function stats(values: number[]): Stats | null {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b)
  if (!v.length) return null
  const q = (p: number) => {
    if (v.length === 1) return v[0]
    const idx = (v.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return v[lo] + (v[hi] - v[lo]) * (idx - lo)
  }
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length
  return {
    n: v.length,
    min: v[0],
    max: v[v.length - 1],
    mean,
    p50: q(0.5),
    p90: q(0.9),
    p95: q(0.95),
    stdev: Math.sqrt(variance),
  }
}

export function fmtMs(ms: number | undefined | null, digits = 0): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)} s`
  return `${ms.toFixed(digits)} ms`
}

export function fmtNum(n: number | undefined | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export function fmtInt(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

export function fmtTime(ts: number | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 极粗略的 token 估算：中文按字符，英文按 ~4 字符 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (/[㐀-鿿　-〿＀-￯]/.test(ch)) cjk++
    else other++
  }
  return Math.round(cjk + other / 3.8)
}

/** 深拷贝并抹掉敏感字段，用于展示请求体 */
export function redact<T>(obj: T): T {
  const seen = new WeakSet()
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v
    if (seen.has(v as object)) return '[circular]'
    seen.add(v as object)
    if (Array.isArray(v)) return v.map(walk)
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^(authorization|api[-_]?key|x-api-key|token|secret)$/i.test(k)) out[k] = '••••••'
      else if (typeof val === 'string' && val.length > 900) out[k] = `${val.slice(0, 400)}… [${val.length} chars truncated]`
      else out[k] = walk(val)
    }
    return out
  }
  return walk(obj) as T
}

export function safeJson(v: unknown, space = 2): string {
  try {
    return JSON.stringify(v, null, space) ?? String(v)
  } catch {
    return String(v)
  }
}

/** 从可能包含 markdown 围栏的文本中提取第一个 JSON 对象 */
export function extractJson(text: string): { value: unknown; raw: string } | null {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fenced) candidates.push(fenced[1].trim())
  candidates.push(text.trim())
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1))
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) candidates.push(text.slice(firstBracket, lastBracket + 1))
  for (const c of candidates) {
    try {
      return { value: JSON.parse(c), raw: c }
    } catch {
      /* next */
    }
  }
  return null
}

export function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ')
}

export function download(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 有限并发执行 */
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}
