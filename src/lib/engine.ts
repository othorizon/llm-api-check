import type {
  CheckDef, ChatRequest, ModelEntry, ModelRunResult, Provider, RunOptions, RunSession, SuiteId,
} from './types'
import { ALL_CHECKS, CHECK_MAP } from '../tests'
import { chat as rawChat } from './client'
import { pool, uid } from './util'
import { presetOf } from './presets'
import { DEFAULT_THINKING_OFF_ID } from './thinking'

export const DEFAULT_OPTIONS: RunOptions = {
  rounds: 3,
  maxTokens: 512,
  temperature: 0.3,
  concurrency: 2,
  timeoutMs: 120000,
  cachePrefixTokens: 2400,
  randomizePrompts: true,
  perfOutputTokens: 256,
  perfThinkingCompare: true,
  thinkingOffId: DEFAULT_THINKING_OFF_ID,
}

/** 把选中的 check 展开为包含依赖、并按注册顺序排序的列表 */
export function expandChecks(checkIds: string[]): CheckDef[] {
  const want = new Set(checkIds)
  let changed = true
  while (changed) {
    changed = false
    for (const id of Array.from(want)) {
      for (const dep of CHECK_MAP[id]?.requires ?? []) {
        if (!want.has(dep)) {
          want.add(dep)
          changed = true
        }
      }
    }
  }
  return ALL_CHECKS.filter((c) => want.has(c.id))
}

export interface RunHandle {
  session: RunSession
  abort: () => void
  done: Promise<RunSession>
}

export interface StartRunArgs {
  models: ModelEntry[]
  providers: Record<string, Provider>
  checkIds: string[]
  suites: SuiteId[]
  options: RunOptions
  label?: string
  onUpdate: (session: RunSession) => void
}

export function startRun(args: StartRunArgs): RunHandle {
  const { models, providers, checkIds, suites, options, onUpdate } = args
  const checks = expandChecks(checkIds)
  const controller = new AbortController()

  const session: RunSession = {
    id: uid('run'),
    label: args.label || `测试 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    createdAt: Date.now(),
    modelIds: models.map((m) => m.id),
    modelSnapshots: Object.fromEntries(
      models.map((m) => [
        m.id,
        {
          alias: m.alias || m.model,
          model: m.model,
          providerName: providers[m.providerId]?.name ?? '未知服务商',
          preset: providers[m.providerId]?.preset ?? presetOf(undefined).id,
        },
      ]),
    ),
    suites,
    checkIds: checks.map((c) => c.id),
    options,
    results: Object.fromEntries(
      models.map((m) => [m.id, { modelId: m.id, status: 'pending', checks: {} } as ModelRunResult]),
    ),
    status: 'running',
  }

  const emit = () => onUpdate({ ...session, results: { ...session.results } })
  emit()

  const done = (async () => {
    await pool(models, Math.max(1, options.concurrency), async (model) => {
      const provider = providers[model.providerId]
      const result = session.results[model.id]
      result.status = 'running'
      result.startedAt = Date.now()
      emit()

      if (!provider) {
        result.status = 'error'
        result.error = '找不到该模型对应的服务商配置'
        result.finishedAt = Date.now()
        emit()
        return
      }

      const shared = new Map<string, unknown>()
      const chat = (req: ChatRequest) =>
        rawChat({ provider, model, timeoutMs: options.timeoutMs, signal: controller.signal }, req)

      for (const def of checks) {
        if (controller.signal.aborted) break
        result.current = def.id
        result.note = ''
        result.checks[def.id] = { status: 'running', summary: '执行中…', evidence: [], startedAt: Date.now() }
        emit()
        try {
          const outcome = await def.run({
            model,
            provider,
            options,
            signal: controller.signal,
            chat,
            progress: (note) => {
              result.note = note
              emit()
            },
            shared,
          })
          result.checks[def.id] = {
            ...outcome,
            startedAt: result.checks[def.id].startedAt,
            finishedAt: Date.now(),
          }
        } catch (err) {
          const e = err as Error
          result.checks[def.id] = {
            status: e?.name === 'AbortError' ? 'skipped' : 'error',
            summary: e?.name === 'AbortError' ? '已取消' : `执行异常：${e?.message ?? String(err)}`,
            evidence: [],
            startedAt: result.checks[def.id].startedAt,
            finishedAt: Date.now(),
          }
        }
        emit()
      }

      result.current = undefined
      result.note = undefined
      result.status = controller.signal.aborted ? 'aborted' : 'done'
      result.finishedAt = Date.now()
      emit()
    })

    session.status = controller.signal.aborted ? 'aborted' : 'done'
    session.finishedAt = Date.now()
    emit()
    return session
  })()

  return { session, abort: () => controller.abort(), done }
}

/* ------------------------------------------------------------------ */
/* 结果聚合                                                            */
/* ------------------------------------------------------------------ */

export interface SuiteScore {
  pass: number
  partial: number
  fail: number
  unsupported: number
  error: number
  total: number
  /** 参与打分的项数；为 0 时 score 无意义 */
  counted: number
  /** 0-100 支持度 */
  score: number
}

/** 判定该模型是否整体连不上（全部检查都因传输层问题失败） */
export function isTransportBroken(result: ModelRunResult | undefined): boolean {
  if (!result) return false
  const outcomes = Object.values(result.checks)
  if (!outcomes.length) return false
  const errors = outcomes.filter((o) => o.status === 'error').length
  const decided = outcomes.filter((o) => ['pass', 'partial', 'fail', 'unsupported'].includes(o.status)).length
  return errors > 0 && decided === 0
}

export function scoreSuite(result: ModelRunResult | undefined, checkIds: string[]): SuiteScore {
  const acc: SuiteScore = { pass: 0, partial: 0, fail: 0, unsupported: 0, error: 0, total: 0, counted: 0, score: 0 }
  if (!result) return acc
  let weighted = 0
  let counted = 0
  for (const id of checkIds) {
    const o = result.checks[id]
    if (!o || o.status === 'pending' || o.status === 'running') continue
    acc.total++
    switch (o.status) {
      case 'pass': acc.pass++; weighted += 1; counted++; break
      case 'partial': acc.partial++; weighted += 0.5; counted++; break
      case 'fail': acc.fail++; counted++; break
      case 'unsupported': acc.unsupported++; counted++; break
      case 'error': acc.error++; break
      default: break
    }
  }
  acc.counted = counted
  acc.score = counted ? Math.round((weighted / counted) * 100) : 0
  return acc
}
