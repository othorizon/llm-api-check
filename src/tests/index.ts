import type { CheckDef, RunOptions, SuiteId } from '../lib/types'
import { PERF_CHECKS } from './performance'
import { CAPABILITY_CHECKS } from './capability'
import { MESSAGE_FORMAT_CHECKS } from './msgformat'

export interface SuiteMeta {
  id: SuiteId
  title: string
  short: string
  desc: string
  accent: string
}

export const SUITES: SuiteMeta[] = [
  {
    id: 'performance',
    title: '性能测试',
    short: '性能',
    desc: '首 token 时延、输出速度、缓存加速，以及实时语音场景的适配结论。',
    accent: 'brand',
  },
  {
    id: 'capability',
    title: '能力测试',
    short: '能力',
    desc: '思维链、工具调用、结构化输出、视觉理解等模型侧能力的实测支持度。',
    accent: 'info',
  },
  {
    id: 'message-format',
    title: '消息格式兼容性',
    short: '消息格式',
    desc: '非常规消息序列（多条 system、非交替轮次、残缺工具消息）能否被端点接受。',
    accent: 'warn',
  },
]

export interface GroupMeta {
  id: string
  suite: SuiteId
  title: string
  desc: string
  /** 结果页中额外展示该分组的套件 */
  alsoIn?: SuiteId[]
}

export const GROUPS: GroupMeta[] = [
  { id: 'throughput', suite: 'performance', title: '时延与吞吐', desc: '流式 / 非流式两种口径下的真实速度' },
  { id: 'cache', suite: 'performance', title: '上下文缓存 Prompt Caching', desc: '缓存是否命中、命中后能省多少首字时延', alsoIn: ['capability'] },
  { id: 'verdict', suite: 'performance', title: '场景结论', desc: '把性能指标换算成可直接决策的结论' },

  { id: 'reasoning', suite: 'capability', title: '推理与思维链', desc: '思维链回传、思考等级、关闭方式' },
  { id: 'tools', suite: 'capability', title: '工具调用 Function Calling', desc: '基础调用、强制调用、并行与结果回填' },
  { id: 'structured', suite: 'capability', title: '结构化输出', desc: 'JSON 模式与 JSON Schema 的实际约束力' },
  { id: 'vision', suite: 'capability', title: '多模态理解', desc: '图片输入与识别' },

  { id: 'system', suite: 'message-format', title: '系统提示词位置', desc: '多条 system、中途 system、developer 角色' },
  { id: 'turns', suite: 'message-format', title: '对话轮次结构', desc: '非严格交替、以 assistant 结尾' },
  { id: 'tool-msgs', suite: 'message-format', title: '工具消息完整性', desc: '残缺的 tool_calls / tool 结果配对' },
  { id: 'content', suite: 'message-format', title: '内容格式', desc: 'content 的数组写法与最小请求' },
]

export const ALL_CHECKS: CheckDef[] = [...PERF_CHECKS, ...CAPABILITY_CHECKS, ...MESSAGE_FORMAT_CHECKS]

export const CHECK_MAP: Record<string, CheckDef> = Object.fromEntries(ALL_CHECKS.map((c) => [c.id, c]))

export const GROUP_MAP: Record<string, GroupMeta> = Object.fromEntries(GROUPS.map((g) => [g.id, g]))

export const SUITE_MAP: Record<SuiteId, SuiteMeta> = Object.fromEntries(SUITES.map((s) => [s.id, s])) as Record<SuiteId, SuiteMeta>

export function checksOfSuite(suite: SuiteId): CheckDef[] {
  return ALL_CHECKS.filter((c) => c.suite === suite)
}

export function groupsOfSuite(suite: SuiteId): GroupMeta[] {
  return GROUPS.filter((g) => g.suite === suite)
}

/** 结果页展示用：包含 alsoIn 借展的分组 */
export function displayGroupsOfSuite(suite: SuiteId): GroupMeta[] {
  return GROUPS.filter((g) => g.suite === suite || g.alsoIn?.includes(suite))
}

/**
 * 估算请求次数，用于成本提示。
 *
 * 性能测试开启「关闭思维链」对比时按两组条件计算，属于**上限** ——
 * 模型本身不输出思维链时对比条件会被自动跳过。
 */
export function estimateRequests(checkIds: string[], options: RunOptions): number {
  const perfConditions = options.perfThinkingCompare ? 2 : 1
  let n = 0
  for (const id of checkIds) {
    const c = CHECK_MAP[id]
    if (!c) continue
    if (c.id === 'perf.stream') n += options.rounds * perfConditions
    else if (c.id === 'perf.nonstream') n += Math.min(options.rounds, 3) * perfConditions
    else if (c.id === 'perf.cache') n += 3 * perfConditions
    else n += c.weight ?? 1
  }
  return n
}
