import { Fragment, useEffect, useMemo, useState } from 'react'
import { Button, CopyButton, Drawer, EmptyState, Popover, StatusPill, useToast } from '../components/ui'
import { Icon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { Link, useRouter } from '../router'
import { useRun } from '../RunContext'
import { actions, useStore } from '../lib/store'
import { CHECK_MAP, SUITES, displayGroupsOfSuite } from '../tests'
import { isTransportBroken, scoreSuite } from '../lib/engine'
import type { CheckOutcome, CheckStatus, RunSession, SuiteId } from '../lib/types'
import { classNames, download, fmtInt, fmtMs, fmtNum, fmtTime, safeJson } from '../lib/util'

type TabId = 'overview' | SuiteId

export default function Results() {
  const { sessions } = useStore()
  const { live, running } = useRun()
  const { query, navigate } = useRouter()
  const toast = useToast()

  const all = useMemo<RunSession[]>(() => {
    if (live && !sessions.some((s) => s.id === live.id)) return [live, ...sessions]
    return sessions.map((s) => (live && s.id === live.id ? live : s))
  }, [sessions, live])

  const requested = query.get('run')
  const [tab, setTab] = useState<TabId>('overview')
  const session = all.find((s) => s.id === requested) ?? all[0]
  const [detail, setDetail] = useState<{ modelId: string; checkId: string } | null>(null)

  useEffect(() => {
    if (session && requested !== session.id) navigate(`/results?run=${session.id}`, { replace: true })
  }, [session, requested, navigate])

  if (!session) {
    return (
      <div className="card">
        <EmptyState
          icon="chart"
          title="还没有测试结果"
          desc="配置好模型后发起一次测试，结果会保存在本机（最多保留最近 25 次）。"
          action={<Link to="/run" className="no-underline"><Button variant="primary" icon="play">发起测试</Button></Link>}
        />
      </div>
    )
  }

  const suiteTabs = SUITES.filter((s) => session.checkIds.some((id) => CHECK_MAP[id]?.suite === s.id))

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">测试结果</h1>
          <p className="mt-1 text-[13px] text-muted">
            {fmtTime(session.createdAt)} · {session.modelIds.length} 个模型 · {session.checkIds.length} 个测试项
            {session.status === 'running' && <span className="ml-2 text-brand">· 进行中</span>}
            {session.status === 'aborted' && <span className="ml-2 text-warn">· 已中止</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {all.length > 1 && (
            <select
              className="input w-auto max-w-[260px] py-1.5 text-[13px]"
              value={session.id}
              onChange={(e) => navigate(`/results?run=${e.target.value}`)}
            >
              {all.map((s) => (
                <option key={s.id} value={s.id}>{fmtTime(s.createdAt)} · {s.modelIds.length} 模型</option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            icon="download"
            onClick={() => {
              download(`llm-test-${session.id}.json`, safeJson(session))
              toast('已导出 JSON', 'ok')
            }}
          >
            导出
          </Button>
          <CopyButton text={toMarkdown(session)} className="border border-line" />
          {!running && (
            <Button
              size="sm"
              variant="danger"
              icon="trash"
              onClick={() => {
                if (confirm('删除这条测试记录？')) {
                  actions.removeSession(session.id)
                  navigate('/results', { replace: true })
                }
              }}
            >
              删除
            </Button>
          )}
        </div>
      </header>

      <nav className="tabbar overflow-x-auto scrollbar-none">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>总览</TabBtn>
        {suiteTabs.map((s) => (
          <TabBtn key={s.id} active={tab === s.id} onClick={() => setTab(s.id)}>{s.title}</TabBtn>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab session={session} onOpen={setDetail} onGoTab={setTab} />}
      {tab === 'performance' && <PerformanceTab session={session} onOpen={setDetail} />}
      {(tab === 'capability' || tab === 'message-format') && (
        <MatrixTab session={session} suite={tab} onOpen={setDetail} />
      )}

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? CHECK_MAP[detail.checkId]?.title ?? detail.checkId : ''}
        subtitle={detail ? session.modelSnapshots[detail.modelId]?.alias : ''}
      >
        {detail && <CheckDetail session={session} modelId={detail.modelId} checkId={detail.checkId} />}
      </Drawer>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={classNames('tab', active && 'tab-active')} onClick={onClick}>{children}</button>
  )
}

/* ============================== 总览 ============================== */

function OverviewTab({
  session, onOpen, onGoTab,
}: { session: RunSession; onOpen: (d: { modelId: string; checkId: string }) => void; onGoTab: (t: TabId) => void }) {
  const capIds = session.checkIds.filter((id) => CHECK_MAP[id]?.suite === 'capability')
  const msgIds = session.checkIds.filter((id) => CHECK_MAP[id]?.suite === 'message-format')

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {session.modelIds.map((id) => {
          const r = session.results[id]
          const snap = session.modelSnapshots[id]
          const stream = r?.checks['perf.stream']
          const voice = r?.checks['perf.voice']
          const cache = r?.checks['perf.cache']
          const cap = scoreSuite(r, capIds)
          const msg = scoreSuite(r, msgIds)
          const broken = isTransportBroken(r)
          return (
            <article key={id} className="card card-pad">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold">{snap?.alias}</h2>
                  <p className="mt-0.5 truncate text-[12px] text-faint">{snap?.providerName} · {snap?.model}</p>
                </div>
                {voice?.grade && (
                  <span
                    className={classNames(
                      'shrink-0 rounded-lg border px-2.5 py-1 text-[12px] font-medium',
                      voice.grade.tone === 'ok' && 'border-ok/30 bg-ok/10 text-ok',
                      voice.grade.tone === 'warn' && 'border-warn/30 bg-warn/10 text-warn',
                      voice.grade.tone === 'bad' && 'border-bad/30 bg-bad/10 text-bad',
                      voice.grade.tone === 'info' && 'border-info/30 bg-info/10 text-info',
                    )}
                  >
                    {voice.grade.label}
                  </span>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Metric label="TTFT p50" value={stream?.metrics?.['TTFT p50'] != null ? fmtMs(Number(stream.metrics['TTFT p50'])) : '—'} />
                <Metric label="输出速度" value={stream?.metrics?.['输出速度 p50 (tok/s)'] != null ? `${fmtNum(Number(stream.metrics['输出速度 p50 (tok/s)']))} t/s` : '—'} />
                <Metric label="能力支持度" value={cap.counted ? `${cap.score}%` : '—'} sub={cap.counted ? `${cap.pass} 通过 / ${cap.counted} 项` : undefined} />
                <Metric label="格式兼容度" value={msg.counted ? `${msg.score}%` : '—'} sub={msg.counted ? `${msg.pass} 通过 / ${msg.counted} 项` : undefined} />
              </dl>

              {broken && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-bad">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                  <span>
                    所有请求都没能到达该端点，本次结果<strong className="font-semibold">不代表模型能力</strong>。
                    常见原因：服务端未放行 CORS、Base URL 或模型名有误、API Key 无效。
                    请到「模型与服务商」页做一次连通性检测。
                  </span>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                {cache && (
                  <button className="chip hover:border-brand" onClick={() => onOpen({ modelId: id, checkId: 'perf.cache' })}>
                    缓存 <StatusPill status={cache.status} size="sm" />
                  </button>
                )}
                {r?.checks['reasoning.presence'] && (
                  <button className="chip hover:border-brand" onClick={() => onOpen({ modelId: id, checkId: 'reasoning.presence' })}>
                    思维链 <StatusPill status={r.checks['reasoning.presence'].status} size="sm" />
                  </button>
                )}
                {r?.checks['tools.basic'] && (
                  <button className="chip hover:border-brand" onClick={() => onOpen({ modelId: id, checkId: 'tools.basic' })}>
                    工具调用 <StatusPill status={r.checks['tools.basic'].status} size="sm" />
                  </button>
                )}
                {r?.checks['structured.json_schema_strict'] && (
                  <button className="chip hover:border-brand" onClick={() => onOpen({ modelId: id, checkId: 'structured.json_schema_strict' })}>
                    strict schema <StatusPill status={r.checks['structured.json_schema_strict'].status} size="sm" />
                  </button>
                )}
                {r?.checks['vision.image'] && (
                  <button className="chip hover:border-brand" onClick={() => onOpen({ modelId: id, checkId: 'vision.image' })}>
                    视觉 <StatusPill status={r.checks['vision.image'].status} size="sm" />
                  </button>
                )}
              </div>

              {voice?.detail && (
                <div className="mt-3 whitespace-pre-line rounded-lg border border-line bg-raised px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
                  {voice.detail}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="gauge" onClick={() => onGoTab('performance')}>查看性能明细</Button>
        {!!capIds.length && <Button size="sm" icon="sparkles" onClick={() => onGoTab('capability')}>查看能力矩阵</Button>}
        {!!msgIds.length && <Button size="sm" icon="message" onClick={() => onGoTab('message-format')}>查看消息格式兼容性</Button>}
      </div>
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-faint">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tnum">{value}</dd>
      {sub && <dd className="text-[11px] text-faint">{sub}</dd>}
    </div>
  )
}

/* ============================== 性能 ============================== */

const PERF_COLUMNS: { key: string; checkId: string; metric: string; label: string; fmt: (n: number) => string; lowerBetter: boolean }[] = [
  { key: 'ttft50', checkId: 'perf.stream', metric: 'TTFT p50', label: 'TTFT p50', fmt: (n) => fmtMs(n), lowerBetter: true },
  { key: 'ttft95', checkId: 'perf.stream', metric: 'TTFT p95', label: 'TTFT p95', fmt: (n) => fmtMs(n), lowerBetter: true },
  { key: 'tps', checkId: 'perf.stream', metric: '输出速度 p50 (tok/s)', label: '输出 tok/s', fmt: (n) => fmtNum(n), lowerBetter: false },
  { key: 'e2e', checkId: 'perf.stream', metric: '端到端 p50', label: '流式端到端', fmt: (n) => fmtMs(n), lowerBetter: true },
  { key: 'nse2e', checkId: 'perf.nonstream', metric: '端到端 p50', label: '非流式端到端', fmt: (n) => fmtMs(n), lowerBetter: true },
  { key: 'cache', checkId: 'perf.cache', metric: 'TTFT 降幅 %', label: '缓存加速', fmt: (n) => (n >= 0 ? `快 ${fmtNum(n, 0)}%` : `慢 ${fmtNum(-n, 0)}%`), lowerBetter: false },
  { key: 'voice', checkId: 'perf.voice', metric: '综合得分', label: '语音适配分', fmt: (n) => String(Math.round(n)), lowerBetter: false },
]

function PerformanceTab({ session, onOpen }: { session: RunSession; onOpen: (d: { modelId: string; checkId: string }) => void }) {
  const cols = PERF_COLUMNS.filter((c) => session.checkIds.includes(c.checkId))
  const values = (col: typeof PERF_COLUMNS[number]) =>
    session.modelIds.map((id) => {
      const v = session.results[id]?.checks[col.checkId]?.metrics?.[col.metric]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    })

  const globalMaxTtft = Math.max(
    1,
    ...session.modelIds.flatMap((id) =>
      (session.results[id]?.checks['perf.stream']?.series ?? []).map((p) => p.ttftMs ?? 0),
    ),
  )

  const bests = new Map<string, number | null>()
  for (const col of cols) {
    const vs = values(col).filter((v): v is number => v != null)
    bests.set(col.key, vs.length ? (col.lowerBetter ? Math.min(...vs) : Math.max(...vs)) : null)
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-faint">
        表头箭头表示优劣方向（<span className="text-muted">↓ 越低越好 · ↑ 越高越好</span>）；每列的最优值以绿色标出。
      </p>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="sticky left-0 z-10 bg-surface px-4 py-2.5 font-medium text-muted">模型</th>
                {cols.map((c) => (
                  <th key={c.key} className="px-3 py-2.5 font-medium text-muted whitespace-nowrap">
                    {c.label}
                    <span className="ml-1 text-[11px] text-faint" title={c.lowerBetter ? '越低越好' : '越高越好'}>
                      {c.lowerBetter ? '↓' : '↑'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {session.modelIds.map((id) => {
                const snap = session.modelSnapshots[id]
                return (
                  <tr key={id} className="border-b border-line last:border-0 hover:bg-raised/60">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                      <div className="max-w-[220px] truncate font-medium">{snap?.alias}</div>
                      <div className="max-w-[220px] truncate text-[11px] text-faint">{snap?.providerName}</div>
                    </td>
                    {cols.map((c, colIdx) => {
                      const outcome = session.results[id]?.checks[c.checkId]
                      const raw = outcome?.metrics?.[c.metric]
                      const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
                      const best = bests.get(c.key)
                      const isBest = v != null && best != null && Math.abs(v - best) < 1e-9 && session.modelIds.length > 1
                      // 同一个检查项跨多列时，状态徽章只在第一列显示，避免重复噪音
                      const firstOfCheck = cols.findIndex((x) => x.checkId === c.checkId) === colIdx
                      return (
                        <td key={c.key} className="px-3 py-2.5">
                          <button
                            className="group inline-flex items-center gap-1.5 text-left"
                            onClick={() => onOpen({ modelId: id, checkId: c.checkId })}
                          >
                            <span className={classNames('tnum', isBest ? 'font-semibold text-ok' : 'text-ink')}>
                              {v != null ? c.fmt(v) : <span className="text-faint">—</span>}
                            </span>
                            {isBest && <Icon name="check" size={11} className="text-ok" strokeWidth={3} />}
                            {v == null && outcome && outcome.status !== 'pass' && firstOfCheck && (
                              <StatusPill status={outcome.status} size="sm" />
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 每轮明细 */}
      {session.checkIds.includes('perf.stream') && (
        <section className="card card-pad">
          <h2 className="text-sm font-semibold">逐轮 TTFT 分布</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            每一轮都使用随机化提示词，柱高代表该轮的首 token 时延；差异过大说明服务端负载不稳定。
          </p>
          <div className="mt-4 space-y-2.5">
            {session.modelIds.map((id) => {
              const s = session.results[id]?.checks['perf.stream']
              const series = s?.series ?? []
              return (
                <div key={id} className="flex items-center gap-3">
                  <div className="w-36 shrink-0 truncate text-[12.5px]" title={session.modelSnapshots[id]?.alias}>
                    {session.modelSnapshots[id]?.alias}
                  </div>
                  <div className="flex h-10 flex-1 items-end gap-[3px]">
                    {series.length ? series.map((p) => (
                      <div
                        key={p.round}
                        title={`第 ${p.round} 轮：${p.ok ? fmtMs(p.ttftMs) : '请求失败'}`}
                        className={classNames('min-w-[8px] max-w-[32px] flex-1 rounded-t-sm', p.ok ? 'bg-brand/75 hover:bg-brand' : 'bg-bad/50')}
                        style={{ height: `${p.ok ? Math.max(6, ((p.ttftMs ?? 0) / globalMaxTtft) * 100) : 100}%` }}
                      />
                    )) : <span className="text-[12px] text-faint">无数据</span>}
                    <div className="flex-1" />
                  </div>
                  <div className="w-28 shrink-0 text-right text-[12px] tnum text-muted">
                    p50 {s?.metrics?.['TTFT p50'] != null ? fmtMs(Number(s.metrics['TTFT p50'])) : '—'}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[11.5px] text-faint">纵轴按所有模型的最大 TTFT（{fmtMs(globalMaxTtft)}）统一缩放，可直接横向比较。</p>
        </section>
      )}

      {/* 结论卡片 */}
      {session.checkIds.includes('perf.voice') && (
        <section className="grid gap-3 md:grid-cols-2">
          {session.modelIds.map((id) => {
            const v = session.results[id]?.checks['perf.voice']
            if (!v) return null
            return (
              <article key={id} className="card card-pad">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="truncate text-sm font-semibold">{session.modelSnapshots[id]?.alias}</h3>
                  <StatusPill status={v.status} />
                </div>
                <div className="mt-2 text-[13px] font-medium">{v.summary}</div>
                {v.detail && <div className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{v.detail}</div>}
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}

/* ============================== 矩阵 ============================== */

function MatrixTab({
  session, suite, onOpen,
}: { session: RunSession; suite: SuiteId; onOpen: (d: { modelId: string; checkId: string }) => void }) {
  const groups = displayGroupsOfSuite(suite).filter((g) =>
    session.checkIds.some((id) => CHECK_MAP[id]?.group === g.id),
  )
  const ids = session.checkIds.filter((id) => groups.some((g) => g.id === CHECK_MAP[id]?.group))

  return (
    <div className="space-y-4">
      <Legend />
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 320 + session.modelIds.length * 150 }}>
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left font-medium text-muted">测试项</th>
                {session.modelIds.map((id) => {
                  const s = scoreSuite(session.results[id], ids)
                  return (
                    <th key={id} className="px-3 py-2.5 text-left align-top">
                      <div className="max-w-[150px] truncate font-medium text-ink">{session.modelSnapshots[id]?.alias}</div>
                      <div className="max-w-[150px] truncate text-[11px] font-normal text-faint">{session.modelSnapshots[id]?.providerName}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold tnum text-ink">{s.counted ? `${s.score}%` : '—'}</span>
                        {!!s.counted && (
                          <span className="h-1 w-12 overflow-hidden rounded-full bg-raised">
                            <span
                              className={classNames('block h-full rounded-full', s.score >= 80 ? 'bg-ok' : s.score >= 50 ? 'bg-warn' : 'bg-bad')}
                              style={{ width: `${s.score}%` }}
                            />
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const list = session.checkIds.filter((id) => CHECK_MAP[id]?.group === g.id)
                if (!list.length) return null
                return (
                  <Fragment key={g.id}>
                    <tr className="bg-raised/70">
                      <td colSpan={session.modelIds.length + 1} className="px-4 py-1.5">
                        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{g.title}</span>
                        <span className="ml-2 text-[11.5px] text-faint">{g.desc}</span>
                      </td>
                    </tr>
                    {list.map((cid) => {
                      const def = CHECK_MAP[cid]
                      return (
                        <tr key={cid} className="border-b border-line last:border-0 hover:bg-raised/40">
                          <td className="sticky left-0 z-10 bg-surface px-4 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px]">{def?.title}</span>
                              {def && (
                                <Popover label={`${def.title} 的说明`}>
                                  <h3 className="mb-2 text-sm font-semibold">{def.title}</h3>
                                  <Markdown text={def.doc} />
                                </Popover>
                              )}
                            </div>
                            {def?.subtitle && <div className="truncate font-mono text-[11px] text-faint">{def.subtitle}</div>}
                          </td>
                          {session.modelIds.map((mid) => {
                            const o = session.results[mid]?.checks[cid]
                            return (
                              <td key={mid} className="px-3 py-2 align-top">
                                {o ? (
                                  <button
                                    className="group block w-[150px] text-left"
                                    title={o.summary}
                                    onClick={() => onOpen({ modelId: mid, checkId: cid })}
                                  >
                                    <StatusPill status={o.status} size="sm" />
                                    <span className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-faint group-hover:text-muted">
                                      {o.summary}
                                    </span>
                                  </button>
                                ) : (
                                  <span className="text-faint">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Legend() {
  const items: { s: CheckStatus; t: string }[] = [
    { s: 'pass', t: '参数被接受，语义生效，结果符合预期' },
    { s: 'partial', t: '参数被接受，但语义未生效或结果不完全符合' },
    { s: 'fail', t: '接受了请求但行为错误' },
    { s: 'unsupported', t: '请求被 4xx 拒绝，端点不支持' },
    { s: 'error', t: '网络 / 鉴权 / 限流等问题，非能力结论' },
    { s: 'skipped', t: '前置条件不满足，已跳过' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5">
      {items.map((i) => (
        <span key={i.s} className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <StatusPill status={i.s} size="sm" />
          {i.t}
        </span>
      ))}
    </div>
  )
}

/* ============================== 详情 ============================== */

function CheckDetail({ session, modelId, checkId }: { session: RunSession; modelId: string; checkId: string }) {
  const def = CHECK_MAP[checkId]
  const outcome: CheckOutcome | undefined = session.results[modelId]?.checks[checkId]
  const { settings } = useStore()
  if (!outcome) return <p className="text-[13px] text-muted">没有该项的结果。</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={outcome.status} />
        <span className="text-[13.5px] font-medium">{outcome.summary}</span>
      </div>

      {outcome.detail && (
        <div className="whitespace-pre-line rounded-lg border border-line bg-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
          {outcome.detail}
        </div>
      )}

      {!!outcome.variants?.length && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold">逐项探测结果</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {outcome.variants.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <code className="font-mono text-[12px] text-ink">{v.label}</code>
                  {v.note && <div className="mt-0.5 text-[11.5px] text-faint break-words">{v.note}</div>}
                </div>
                <StatusPill status={v.status} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!outcome.metrics && Object.keys(outcome.metrics).length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold">指标</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line px-3.5 py-3">
            {Object.entries(outcome.metrics).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="text-[12.5px] font-medium tnum">{formatMetric(k, v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {!!outcome.series?.length && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold">逐轮数据</h3>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-3 py-1.5 font-medium">轮次</th>
                  <th className="px-3 py-1.5 font-medium">TTFT</th>
                  <th className="px-3 py-1.5 font-medium">端到端</th>
                  <th className="px-3 py-1.5 font-medium">tok/s</th>
                  <th className="px-3 py-1.5 font-medium">输出 tokens</th>
                </tr>
              </thead>
              <tbody>
                {outcome.series.map((p) => (
                  <tr key={p.round} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 tnum">{p.round}</td>
                    <td className="px-3 py-1.5 tnum">{p.ok ? fmtMs(p.ttftMs) : <span className="text-bad">失败</span>}</td>
                    <td className="px-3 py-1.5 tnum">{fmtMs(p.e2eMs)}</td>
                    <td className="px-3 py-1.5 tnum">{fmtNum(p.tps)}</td>
                    <td className="px-3 py-1.5 tnum">{fmtInt(p.outputTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!!outcome.evidence.length && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold">请求与响应</h3>
          <div className="space-y-2">
            {outcome.evidence.map((e, i) => (
              <details key={i} className="rounded-lg border border-line" open={settings.expandRaw || i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-[12.5px] font-medium">{e.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-faint">
                    {e.httpStatus ? <span className={e.httpStatus >= 400 ? 'text-bad' : ''}>HTTP {e.httpStatus}</span> : null}
                    {e.durationMs != null && <span className="tnum">{fmtMs(e.durationMs)}</span>}
                    <Icon name="chevronDown" size={13} />
                  </span>
                </summary>
                <div className="space-y-2 border-t border-line px-3 py-2.5">
                  {e.note && <p className="text-[12px] text-muted">{e.note}</p>}
                  {e.error && <p className="rounded-md border border-bad/25 bg-bad/10 px-2.5 py-2 text-[12px] text-bad break-words">{e.error}</p>}
                  <JsonBlock title="请求体（已脱敏）" value={e.request} />
                  <JsonBlock title="响应" value={e.response} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {def && (
        <section className="border-t border-line pt-4">
          <h3 className="mb-2 text-[13px] font-semibold">这项测试在测什么</h3>
          <Markdown text={def.doc} />
        </section>
      )}
    </div>
  )
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === undefined || value === null) return null
  const text = typeof value === 'string' ? value : safeJson(value)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium text-muted">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-line bg-raised p-2.5 font-mono text-[11.5px] leading-relaxed text-ink">
        {text}
      </pre>
    </div>
  )
}

function formatMetric(key: string, v: number | string | boolean | null): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'string') return v
  if (/TTFT|端到端|等待/.test(key)) return fmtMs(v)
  if (/%|降幅|命中率/.test(key)) return `${fmtNum(v, 1)}%`
  if (/tok\/s|速度/.test(key)) return fmtNum(v, 1)
  if (Number.isInteger(v)) return fmtInt(v)
  return fmtNum(v, 2)
}

/* ------------------------------------------------------------------ */

function toMarkdown(session: RunSession): string {
  const lines: string[] = []
  lines.push(`# LLM 测试报告 · ${fmtTime(session.createdAt)}`)
  lines.push('')
  lines.push(`模型：${session.modelIds.map((id) => session.modelSnapshots[id]?.alias).join('、')}`)
  lines.push('')
  for (const suite of SUITES) {
    const ids = session.checkIds.filter((id) => CHECK_MAP[id]?.suite === suite.id)
    if (!ids.length) continue
    lines.push(`## ${suite.title}`)
    lines.push('')
    lines.push(`| 测试项 | ${session.modelIds.map((id) => session.modelSnapshots[id]?.alias ?? id).join(' | ')} |`)
    lines.push(`| --- | ${session.modelIds.map(() => '---').join(' | ')} |`)
    for (const cid of ids) {
      const row = session.modelIds.map((mid) => {
        const o = session.results[mid]?.checks[cid]
        if (!o) return '—'
        return `${statusText(o.status)} ${o.summary.replace(/\|/g, '/')}`
      })
      lines.push(`| ${CHECK_MAP[cid]?.title ?? cid} | ${row.join(' | ')} |`)
    }
    lines.push('')
  }
  lines.push('> 由 which-llm-i-can-use 生成，所有测试均在浏览器本地执行。')
  return lines.join('\n')
}

function statusText(s: CheckStatus): string {
  return { pass: '✅', partial: '⚠️', fail: '❌', unsupported: '⛔', error: '🔧', skipped: '➖', running: '⏳', pending: '⏳' }[s]
}
