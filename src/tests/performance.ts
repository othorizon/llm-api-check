import type { CheckDef, CheckOutcome, Evidence, SeriesPoint } from '../lib/types'
import { fmtMs, fmtNum, sleep, stats } from '../lib/util'
import { perfPrompt, stablePrefix } from './fixtures'
import { decodeTps, e2eTps, evidence, itlSeries, outputTokens, tokensAreEstimated, transportFailure } from './helpers'

export interface StreamAggregate {
  ttft: number[]
  decodeTps: number[]
  e2e: number[]
  itlP95: number[]
  itlP50: number[]
  reasoningLead: number[]
  okCount: number
  total: number
  estimated: boolean
}

const STREAM_SHARED_KEY = 'perf.stream.aggregate'

export const PERF_CHECKS: CheckDef[] = [
  /* ---------------------------------------------------------------- */
  {
    id: 'perf.stream',
    suite: 'performance',
    group: 'throughput',
    title: '流式生成性能',
    subtitle: 'TTFT / 输出速度 / 端到端时延',
    weight: 3,
    doc: `以 \`stream: true\` 连续发起多轮请求，逐 chunk 记录到达时间。

- **TTFT（Time To First Token，首 token 时延）**：从发出请求到收到第一个**可见正文** token 的时间。若模型先输出思维链，则以思维链结束、正文开始计时，这与用户/TTS 真正“听到内容”的时刻一致。
- **输出速度（Output tok/s）**：\`completion_tokens ÷ (总耗时 − TTFT)\`，即解码阶段的吞吐，不含首 token 等待。
- **ITL（Inter-Token Latency，token 间隔）**：相邻 chunk 的时间差，其 p95/p50 比值反映输出是否卡顿。

每一轮请求都会在提示词**最前面**注入随机 run-id，破坏前缀，确保不会命中 Prompt Cache，测到的是真实冷启动表现。`,
    async run(ctx) {
      const rounds = Math.max(1, ctx.options.rounds)
      const agg: StreamAggregate = {
        ttft: [], decodeTps: [], e2e: [], itlP95: [], itlP50: [], reasoningLead: [],
        okCount: 0, total: rounds, estimated: false,
      }
      const series: SeriesPoint[] = []
      const ev: Evidence[] = []
      let lastFailure: CheckOutcome | null = null

      for (let r = 1; r <= rounds; r++) {
        if (ctx.signal.aborted) break
        ctx.progress(`流式第 ${r}/${rounds} 轮`)
        const p = perfPrompt(r, ctx.options.randomizePrompts)
        const res = await ctx.chat({
          messages: [
            { role: 'system', content: p.system },
            { role: 'user', content: p.user },
          ],
          stream: true,
          maxTokens: ctx.options.perfOutputTokens,
          temperature: ctx.options.temperature,
        })
        if (!res.ok) {
          lastFailure = transportFailure(res)
          series.push({ round: r, ok: false })
          if (ev.length < 3) ev.push(evidence(`第 ${r} 轮（失败）`, res))
          continue
        }
        agg.okCount++
        if (tokensAreEstimated(res)) agg.estimated = true
        const ttft = res.timing.ttftMs ?? res.timing.totalMs
        const dtps = decodeTps(res)
        agg.ttft.push(ttft)
        agg.e2e.push(res.timing.totalMs)
        if (dtps) agg.decodeTps.push(dtps)
        const itl = itlSeries(res)
        const s = stats(itl)
        if (s) { agg.itlP95.push(s.p95); agg.itlP50.push(s.p50) }
        if (res.timing.ttfrMs != null) agg.reasoningLead.push(ttft - res.timing.ttfrMs)
        series.push({ round: r, ok: true, ttftMs: ttft, e2eMs: res.timing.totalMs, tps: dtps, outputTokens: outputTokens(res) })
        if (ev.length < 2) ev.push(evidence(`第 ${r} 轮`, res))
        if (r < rounds) await sleep(250, ctx.signal).catch(() => {})
      }

      ctx.shared.set(STREAM_SHARED_KEY, agg)

      if (!agg.okCount) {
        return lastFailure ?? { status: 'error', summary: '所有轮次均失败', evidence: ev }
      }

      const ttftS = stats(agg.ttft)!
      const tpsS = stats(agg.decodeTps)
      const e2eS = stats(agg.e2e)!
      const jitter = stats(agg.itlP95)?.p50 && stats(agg.itlP50)?.p50
        ? (stats(agg.itlP95)!.p50 / Math.max(1, stats(agg.itlP50)!.p50))
        : undefined

      return {
        status: agg.okCount === rounds ? 'pass' : 'partial',
        summary: `TTFT p50 ${fmtMs(ttftS.p50)} · 输出 ${fmtNum(tpsS?.p50)} tok/s · 端到端 p50 ${fmtMs(e2eS.p50)}`,
        detail: agg.estimated ? '该端点未返回 usage.completion_tokens，token 数为字符估算，速度仅供横向参考。' : undefined,
        metrics: {
          'TTFT p50': ttftS.p50,
          'TTFT p95': ttftS.p95,
          'TTFT 最快': ttftS.min,
          'TTFT 最慢': ttftS.max,
          '输出速度 p50 (tok/s)': tpsS?.p50 ?? null,
          '输出速度 最低 (tok/s)': tpsS?.min ?? null,
          '端到端 p50': e2eS.p50,
          '端到端 p95': e2eS.p95,
          'ITL 抖动 (p95/p50)': jitter ?? null,
          '成功轮次': `${agg.okCount}/${rounds}`,
        },
        series,
        evidence: ev,
      }
    },
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'perf.nonstream',
    suite: 'performance',
    group: 'throughput',
    title: '非流式生成性能',
    subtitle: '一次性返回的端到端时延',
    weight: 2,
    doc: `以 \`stream: false\` 发起同样的请求。非流式没有“首 token”概念，用户必须等待**全部内容生成完毕**才能看到结果，因此这里的端到端时延就是感知时延。

对比流式结果可以直观看出：同样的输出，流式把等待拆成了 TTFT + 逐字输出，非流式则是一次长等待。语音、实时对话类场景必须使用流式。`,
    async run(ctx) {
      const rounds = Math.max(1, Math.min(ctx.options.rounds, 3))
      const e2e: number[] = []
      const tps: number[] = []
      const series: SeriesPoint[] = []
      const ev: Evidence[] = []
      let ok = 0
      let lastFailure: CheckOutcome | null = null
      let estimated = false

      for (let r = 1; r <= rounds; r++) {
        if (ctx.signal.aborted) break
        ctx.progress(`非流式第 ${r}/${rounds} 轮`)
        const p = perfPrompt(100 + r, ctx.options.randomizePrompts)
        const res = await ctx.chat({
          messages: [
            { role: 'system', content: p.system },
            { role: 'user', content: p.user },
          ],
          stream: false,
          maxTokens: ctx.options.perfOutputTokens,
          temperature: ctx.options.temperature,
        })
        if (!res.ok) {
          lastFailure = transportFailure(res)
          series.push({ round: r, ok: false })
          if (ev.length < 3) ev.push(evidence(`第 ${r} 轮（失败）`, res))
          continue
        }
        ok++
        if (tokensAreEstimated(res)) estimated = true
        e2e.push(res.timing.totalMs)
        const t = e2eTps(res)
        if (t) tps.push(t)
        series.push({ round: r, ok: true, e2eMs: res.timing.totalMs, tps: t, outputTokens: outputTokens(res) })
        if (ev.length < 2) ev.push(evidence(`第 ${r} 轮`, res))
        if (r < rounds) await sleep(250, ctx.signal).catch(() => {})
      }

      if (!ok) return lastFailure ?? { status: 'error', summary: '所有轮次均失败', evidence: ev }

      const e2eS = stats(e2e)!
      const tpsS = stats(tps)
      const streamAgg = ctx.shared.get(STREAM_SHARED_KEY) as StreamAggregate | undefined
      const streamTtft = streamAgg?.ttft.length ? stats(streamAgg.ttft)!.p50 : undefined
      const extraWait = streamTtft != null ? e2eS.p50 - streamTtft : undefined

      return {
        status: ok === rounds ? 'pass' : 'partial',
        summary: `端到端 p50 ${fmtMs(e2eS.p50)} · 整体 ${fmtNum(tpsS?.p50)} tok/s`,
        detail: [
          extraWait != null
            ? `相同任务下，非流式的首字等待比流式多约 ${fmtMs(Math.max(0, extraWait))}。`
            : undefined,
          estimated ? '该端点未返回 usage，token 数为估算值。' : undefined,
        ].filter(Boolean).join(' '),
        metrics: {
          '端到端 p50': e2eS.p50,
          '端到端 p95': e2eS.p95,
          '端到端 最快': e2eS.min,
          '整体速度 p50 (tok/s)': tpsS?.p50 ?? null,
          '相对流式的额外首字等待': extraWait != null ? Math.max(0, extraWait) : null,
          '成功轮次': `${ok}/${rounds}`,
        },
        series,
        evidence: ev,
      }
    },
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'perf.cache',
    suite: 'performance',
    group: 'cache',
    title: 'Prompt Cache 命中与加速',
    subtitle: '上下文缓存是否生效、能省多少时延',
    weight: 3,
    doc: `**Prompt Caching（上下文缓存 / 前缀缓存）**：当多次请求共享同一段很长的前缀时，服务端可复用已计算的 KV Cache，从而显著降低 TTFT 与输入费用。

测试方法：构造一段**逐字节完全相同**的长前缀（长度可在运行参数中调整），连续发起 3 次请求：
1. 第 1 次视为冷启动（首次可能仍未建立缓存）；
2. 第 2、3 次视为热请求，取更优者。

判定依据有两条，任一成立即认为命中：
- \`usage\` 中出现缓存字段（\`prompt_tokens_details.cached_tokens\` / \`prompt_cache_hit_tokens\` / \`cached_tokens\` 等）且大于 0；
- 热请求 TTFT 相比冷启动下降明显（> 20%）。

注意：与本测试相反，性能测试的其它项会主动**随机化前缀**来规避缓存，两者结论需要分开看。`,
    async run(ctx) {
      const prefix = stablePrefix(ctx.options.cachePrefixTokens)
      const messages = [
        { role: 'system' as const, content: prefix },
        { role: 'user' as const, content: '仅回答手册标题的第一个英文单词，不要解释。' },
      ]
      const ev: Evidence[] = []
      const runs: { label: string; ttft: number; cached?: number; prompt?: number; field?: string }[] = []
      let lastFailure: CheckOutcome | null = null

      for (let i = 0; i < 3; i++) {
        if (ctx.signal.aborted) break
        ctx.progress(`缓存测试第 ${i + 1}/3 次（${i === 0 ? '冷' : '热'}）`)
        const res = await ctx.chat({ messages, stream: true, maxTokens: 32, temperature: 0 })
        if (!res.ok) {
          lastFailure = transportFailure(res)
          ev.push(evidence(`第 ${i + 1} 次（失败）`, res))
          break
        }
        runs.push({
          label: i === 0 ? '冷启动' : `热请求 ${i}`,
          ttft: res.timing.ttftMs ?? res.timing.totalMs,
          cached: res.usage?.cachedTokens,
          prompt: res.usage?.promptTokens,
          field: res.usage?.cacheField,
        })
        ev.push(evidence(`第 ${i + 1} 次（${i === 0 ? '冷启动' : '热请求'}）`, res))
        if (i < 2) await sleep(400, ctx.signal).catch(() => {})
      }

      if (runs.length < 2) {
        return lastFailure ?? { status: 'error', summary: '缓存测试未能完成', evidence: ev }
      }

      const cold = runs[0]
      const warm = runs.slice(1).reduce((a, b) => (a.ttft <= b.ttft ? a : b))
      const speedup = cold.ttft > 0 ? (1 - warm.ttft / cold.ttft) * 100 : 0
      const warmCached = warm.cached ?? 0
      const promptTokens = warm.prompt ?? cold.prompt
      const hitRate = promptTokens ? (warmCached / promptTokens) * 100 : undefined
      const reportsCache = runs.some((r) => typeof r.cached === 'number')

      let status: CheckOutcome['status']
      let summary: string
      if (warmCached > 0) {
        status = 'pass'
        summary = `命中缓存 ${warmCached} tokens（${fmtNum(hitRate, 0)}%），热请求 TTFT ${speedup >= 0 ? '降低' : '反而升高'} ${fmtNum(Math.abs(speedup), 0)}%`
      } else if (speedup >= 20) {
        status = 'partial'
        summary = `未返回缓存计数，但热请求 TTFT 下降 ${fmtNum(speedup, 0)}%，疑似命中`
      } else if (reportsCache) {
        status = 'unsupported'
        summary = '返回了缓存字段但命中数为 0（可能未达最小缓存长度或该模型不支持）'
      } else {
        status = 'unsupported'
        summary = '未观察到缓存命中：usage 无缓存字段，TTFT 也无明显下降'
      }

      return {
        status,
        summary,
        detail: warm.field ? `缓存字段：\`${warm.field}\`` : undefined,
        metrics: {
          '输入 tokens': promptTokens ?? null,
          '命中 tokens': reportsCache ? warmCached : null,
          '命中率 %': hitRate ?? null,
          '冷启动 TTFT': cold.ttft,
          '热请求 TTFT': warm.ttft,
          'TTFT 降幅 %': speedup,
          '前缀规模（近似 tokens）': ctx.options.cachePrefixTokens,
        },
        series: runs.map((r, i) => ({ round: i + 1, ok: true, ttftMs: r.ttft })),
        evidence: ev,
      }
    },
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'perf.voice',
    suite: 'performance',
    group: 'verdict',
    title: '实时语音对话适配度',
    subtitle: '综合评分与结论',
    weight: 0,
    requires: ['perf.stream'],
    doc: `把流式性能换算成一个面向**实时语音（Voice Agent / 语音对话）**场景的结论。

评分构成：
- **首字时延 55%**：语音链路里 TTFT 直接决定“接话快不快”。人类对话的自然停顿约 200–500 ms，超过 1 s 就会明显感觉迟钝。
- **输出速度 35%**：TTS 大约需要 15–25 tok/s 才能持续播报不断流；低于此值会出现“说一句卡一下”。
- **稳定性 10%**：ITL 的 p95/p50 比值，衡量吐字是否均匀。

评级：**A 优秀（≥85）· B 可用（≥70）· C 勉强（≥55）· D 不适合（<55）**。

若模型默认输出思维链，正文之前的思考时间会计入首字时延，这也是很多推理模型不适合语音场景的原因。`,
    async run(ctx) {
      const agg = ctx.shared.get(STREAM_SHARED_KEY) as StreamAggregate | undefined
      if (!agg || !agg.ttft.length) {
        return { status: 'skipped', summary: '需要先完成「流式生成性能」测试', evidence: [] }
      }
      const ttftS = stats(agg.ttft)!
      const tpsS = stats(agg.decodeTps)
      const p95 = ttftS.p95
      const tps = tpsS?.p50 ?? 0
      const jitter =
        stats(agg.itlP95)?.p50 && stats(agg.itlP50)?.p50
          ? stats(agg.itlP95)!.p50 / Math.max(1, stats(agg.itlP50)!.p50)
          : 2

      const ttftScore = scoreRange(p95, 300, 2500)
      const tpsScore = 100 - scoreRange(tps, 8, 60)
      const stabilityScore = scoreRange(jitter, 1.5, 6)
      const score = Math.round(0.55 * ttftScore + 0.35 * tpsScore + 0.1 * stabilityScore)

      const reasoningLead = stats(agg.reasoningLead)?.p50
      const reasons: string[] = []
      reasons.push(
        p95 <= 500
          ? `首字时延 p95 ${fmtMs(p95)}，接近自然对话的停顿感`
          : p95 <= 1000
            ? `首字时延 p95 ${fmtMs(p95)}，可用但偶有迟钝感`
            : `首字时延 p95 ${fmtMs(p95)}，用户会明显感到等待`,
      )
      reasons.push(
        tps >= 30
          ? `输出 ${fmtNum(tps)} tok/s，足以让 TTS 连续播报`
          : tps >= 15
            ? `输出 ${fmtNum(tps)} tok/s，勉强跟得上 TTS，长句可能断续`
            : `输出 ${fmtNum(tps)} tok/s，低于 TTS 播报速度，会出现明显卡顿`,
      )
      if (jitter > 4) reasons.push(`吐字节奏不均（ITL p95/p50 ≈ ${fmtNum(jitter)}），需要更大的播放缓冲`)
      if (reasoningLead != null && reasoningLead > 300) {
        reasons.push(`正文前有约 ${fmtMs(reasoningLead)} 的思维链输出，语音场景建议关闭思维链`)
      }
      if (agg.okCount < agg.total) reasons.push(`${agg.total} 轮中有 ${agg.total - agg.okCount} 轮请求失败，稳定性存疑`)

      const grade =
        score >= 85 ? { label: 'A · 很适合实时语音', tone: 'ok' as const }
          : score >= 70 ? { label: 'B · 可用于实时语音', tone: 'ok' as const }
            : score >= 55 ? { label: 'C · 勉强可用，需优化', tone: 'warn' as const }
              : { label: 'D · 不适合实时语音', tone: 'bad' as const }

      return {
        status: score >= 70 ? 'pass' : score >= 55 ? 'partial' : 'fail',
        summary: `${grade.label}（${score} 分）`,
        detail: reasons.map((r) => `· ${r}`).join('\n'),
        grade: { ...grade, score },
        metrics: {
          '综合得分': score,
          '首字时延得分': Math.round(ttftScore),
          '输出速度得分': Math.round(tpsScore),
          '稳定性得分': Math.round(stabilityScore),
          'TTFT p95': p95,
          '输出速度 p50 (tok/s)': tps,
        },
        evidence: [],
      }
    },
  },
]

/** value 落在 [good, bad] 区间内线性映射到 [100, 0] */
function scoreRange(value: number, good: number, bad: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= good) return 100
  if (value >= bad) return 0
  return ((bad - value) / (bad - good)) * 100
}
