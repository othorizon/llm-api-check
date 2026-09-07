import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, EmptyState, Field, Popover, StatusDot, StatusPill, Toggle, useToast } from '../components/ui'
import { Icon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { Link, useRouter } from '../router'
import { useRun } from '../RunContext'
import { actions, providerMap, useStore } from '../lib/store'
import { ALL_CHECKS, CHECK_MAP, GROUPS, SUITES, estimateRequests } from '../tests'
import { expandChecks } from '../lib/engine'
import { THINKING_OFF_VARIANTS, thinkingOffVariant } from '../lib/thinking'
import type { CheckDef, SuiteId } from '../lib/types'
import { classNames, fmtMs } from '../lib/util'

const STORAGE_SELECTION = 'wliu.selection.v1'

export default function RunPage() {
  const { models, providers, options } = useStore()
  const { start, abort, running, live } = useRun()
  const { navigate } = useRouter()
  const toast = useToast()

  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [selectedChecks, setSelectedChecks] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SELECTION)
      if (raw) {
        const ids: string[] = JSON.parse(raw)
        const valid = ids.filter((id) => CHECK_MAP[id])
        if (valid.length) return new Set(valid)
      }
    } catch { /* ignore */ }
    return new Set(ALL_CHECKS.map((c) => c.id))
  })

  useEffect(() => {
    setSelectedModels((prev) => {
      const next = new Set(Array.from(prev).filter((id) => models.some((m) => m.id === id)))
      if (!next.size) models.filter((m) => m.enabled).forEach((m) => next.add(m.id))
      return next
    })
  }, [models])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_SELECTION, JSON.stringify(Array.from(selectedChecks))) } catch { /* ignore */ }
  }, [selectedChecks])

  const expanded = useMemo(() => expandChecks(Array.from(selectedChecks)), [selectedChecks])
  const autoAdded = expanded.filter((c) => !selectedChecks.has(c.id))
  const perModelRequests = estimateRequests(expanded.map((c) => c.id), options)
  const totalRequests = perModelRequests * selectedModels.size

  const canRun = selectedModels.size > 0 && expanded.length > 0 && !running

  const onStart = async () => {
    const chosen = models.filter((m) => selectedModels.has(m.id))
    const missingKey = chosen.filter((m) => !providers.find((p) => p.id === m.providerId)?.apiKey)
    if (missingKey.length && !confirm(`有 ${missingKey.length} 个模型所属服务商未填写 API Key，仍要继续吗？`)) return
    const session = await start({
      models: chosen,
      providers: providerMap(),
      checkIds: Array.from(selectedChecks),
      suites: Array.from(new Set(expanded.map((c) => c.suite))) as SuiteId[],
      options,
    })
    toast(session.status === 'aborted' ? '测试已中止' : '测试完成', session.status === 'aborted' ? 'bad' : 'ok')
    navigate(`/results?run=${session.id}`)
  }

  if (!models.length) {
    return (
      <div className="card">
        <EmptyState
          icon="cpu"
          title="还没有可测试的模型"
          desc="请先在「模型与服务商」页面添加一个 OpenAI 兼容端点与至少一个模型。"
          action={<Link to="/models" className="no-underline"><Button variant="primary" icon="plus">去配置</Button></Link>}
        />
      </div>
    )
  }

  if (running && live) return <LivePanel onAbort={abort} />

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">发起测试</h1>
        <p className="mt-1 text-[13px] text-muted">
          选择模型与测试项，所有请求将由当前浏览器直接发往各服务商。
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-5 min-w-0">
          {/* 模型选择 */}
          <section className="card">
            <SectionHeader
              n={1}
              title="选择模型"
              right={
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setSelectedModels(new Set(models.map((m) => m.id)))}>全选</Button>
                  <Button size="sm" onClick={() => setSelectedModels(new Set())}>清空</Button>
                </div>
              }
            />
            <div className="divide-y divide-line">
              {providers.map((p) => {
                const list = models.filter((m) => m.providerId === p.id)
                if (!list.length) return null
                const allOn = list.every((m) => selectedModels.has(m.id))
                return (
                  <div key={p.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-center justify-between gap-2">
                      <Checkbox
                        checked={allOn}
                        indeterminate={list.some((m) => selectedModels.has(m.id))}
                        onChange={(v) => {
                          const next = new Set(selectedModels)
                          list.forEach((m) => (v ? next.add(m.id) : next.delete(m.id)))
                          setSelectedModels(next)
                        }}
                        label={<span className="font-medium">{p.name}</span>}
                      />
                      {!p.apiKey && <span className="chip text-warn bg-warn/10 border-warn/25">未填 Key</span>}
                    </div>
                    <div className="mt-2 grid gap-1.5 pl-6 sm:grid-cols-2">
                      {list.map((m) => (
                        <label
                          key={m.id}
                          className={classNames(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors',
                            selectedModels.has(m.id) ? 'border-brand/40 bg-brand/5' : 'border-line hover:border-faint',
                          )}
                        >
                          <Checkbox
                            checked={selectedModels.has(m.id)}
                            onChange={(v) => {
                              const next = new Set(selectedModels)
                              v ? next.add(m.id) : next.delete(m.id)
                              setSelectedModels(next)
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px]">{m.alias || m.model}</span>
                            {m.alias !== m.model && <span className="block truncate font-mono text-[11px] text-faint">{m.model}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 测试项选择 */}
          <section className="card">
            <SectionHeader
              n={2}
              title="选择测试项"
              right={
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setSelectedChecks(new Set(ALL_CHECKS.map((c) => c.id)))}>全选</Button>
                  <Button size="sm" onClick={() => setSelectedChecks(new Set())}>清空</Button>
                </div>
              }
            />
            <div className="divide-y divide-line">
              {SUITES.map((suite) => {
                const checks = ALL_CHECKS.filter((c) => c.suite === suite.id)
                const on = checks.filter((c) => selectedChecks.has(c.id)).length
                return (
                  <div key={suite.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <Checkbox
                        checked={on === checks.length}
                        indeterminate={on > 0}
                        onChange={(v) => {
                          const next = new Set(selectedChecks)
                          checks.forEach((c) => (v ? next.add(c.id) : next.delete(c.id)))
                          setSelectedChecks(next)
                        }}
                        label={
                          <span>
                            <span className="font-medium">{suite.title}</span>
                            <span className="ml-2 text-[12px] text-faint">{on}/{checks.length}</span>
                          </span>
                        }
                      />
                    </div>
                    <p className="mt-1 pl-6 text-[12.5px] text-muted">{suite.desc}</p>
                    <div className="mt-3 space-y-3 pl-6">
                      {GROUPS.filter((g) => g.suite === suite.id).map((g) => {
                        const list = checks.filter((c) => c.group === g.id)
                        if (!list.length) return null
                        return (
                          <div key={g.id}>
                            <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-faint">{g.title}</div>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {list.map((c) => (
                                <CheckRow
                                  key={c.id}
                                  check={c}
                                  checked={selectedChecks.has(c.id)}
                                  auto={!selectedChecks.has(c.id) && autoAdded.some((a) => a.id === c.id)}
                                  onToggle={(v) => {
                                    const next = new Set(selectedChecks)
                                    v ? next.add(c.id) : next.delete(c.id)
                                    setSelectedChecks(next)
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* 参数与启动 */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="card card-pad space-y-4">
            <h2 className="text-sm font-semibold">运行参数</h2>

            <NumField
              label="性能测试轮数"
              value={options.rounds}
              min={1}
              max={20}
              onChange={(v) => actions.setOptions({ rounds: v })}
              hint="轮数越多，p50 / p95 越稳定。"
            />
            <NumField
              label="性能测试输出上限 (tokens)"
              value={options.perfOutputTokens}
              min={32}
              max={4096}
              step={32}
              onChange={(v) => actions.setOptions({ perfOutputTokens: v })}
              hint="影响每轮的费用与输出速度采样长度。"
            />
            <NumField
              label="能力测试输出上限 (tokens)"
              value={options.maxTokens}
              min={64}
              max={8192}
              step={64}
              onChange={(v) => actions.setOptions({ maxTokens: v })}
              hint="推理模型需要更大空间，建议 ≥ 512。"
            />
            <NumField
              label="缓存测试前缀规模 (≈tokens)"
              value={options.cachePrefixTokens}
              min={512}
              max={32000}
              step={256}
              onChange={(v) => actions.setOptions({ cachePrefixTokens: v })}
              hint="多数厂商要求 1k+ 才会建立缓存。"
            />
            <div className="grid grid-cols-2 gap-3">
              <NumField label="temperature" value={options.temperature} min={0} max={2} step={0.1} onChange={(v) => actions.setOptions({ temperature: v })} />
              <NumField label="并发模型数" value={options.concurrency} min={1} max={8} onChange={(v) => actions.setOptions({ concurrency: v })} />
            </div>
            <NumField
              label="单请求超时 (秒)"
              value={Math.round(options.timeoutMs / 1000)}
              min={10}
              max={600}
              step={10}
              onChange={(v) => actions.setOptions({ timeoutMs: v * 1000 })}
            />
            <Toggle
              checked={options.randomizePrompts}
              onChange={(v) => actions.setOptions({ randomizePrompts: v })}
              label="随机化提示词以规避缓存"
              hint="在每轮提示词最前面注入随机 run-id。关闭后多轮结果可能因命中 Prompt Cache 而虚高。"
            />

            <div className="border-t border-line pt-4">
              <div className="mb-3 flex items-center gap-1.5">
                <h3 className="text-[13px] font-semibold">思维链条件</h3>
                <Popover label="思维链条件说明" width={400}>
                  <h3 className="mb-2 text-sm font-semibold">为什么要分两种条件测</h3>
                  <Markdown
                    text={`推理模型在正文之前会先输出思维链，这段时间会**整个计入 TTFT**。同一个模型，思考开着和关掉，首字时延可以差一个数量级 —— 这正是很多推理模型在语音场景不可用、关掉思考后又变得可用的原因。

开启对比后，**每个性能测试项**都会跑两遍：一遍不干预（模型默认行为），一遍带上关闭写法。两组结果分别展示，语音适配度也会分别给出评级。

关闭写法业界没有统一标准，这里列出的都是主流厂商的实际写法。如果不确定该选哪个，可以先跑一遍能力测试里的「关闭思维链的传参方式」，它会把所有写法逐个试出来。

模型本身不输出思维链时，对比条件会自动跳过，不会浪费额度。`}
                  />
                </Popover>
              </div>

              <Toggle
                checked={options.perfThinkingCompare}
                onChange={(v) => actions.setOptions({ perfThinkingCompare: v })}
                label="同时测试关闭思维链后的表现"
                hint="每个性能测试项各跑两遍：默认行为 + 关闭思维链。模型不输出思维链时自动跳过。"
              />

              {options.perfThinkingCompare && (
                <div className="mt-3">
                  <Field
                    label="关闭思维链的写法"
                    hint={`常见于：${thinkingOffVariant(options.thinkingOffId).vendors}`}
                  >
                    <select
                      className="input font-mono text-[12px]"
                      value={options.thinkingOffId}
                      onChange={(e) => actions.setOptions({ thinkingOffId: e.target.value })}
                    >
                      {THINKING_OFF_VARIANTS.map((v) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
            </div>
          </section>

          <section className="card card-pad">
            <h2 className="text-sm font-semibold">预估</h2>
            <dl className="mt-3 space-y-2 text-[13px]">
              <Row k="模型数" v={`${selectedModels.size} 个`} />
              <Row k="测试项" v={`${expanded.length} 项`} />
              <Row k="每模型请求" v={`≈ ${perModelRequests} 次`} />
              <Row k="总请求数" v={<span className="font-semibold text-ink">≈ {totalRequests} 次</span>} />
            </dl>
            {options.perfThinkingCompare && (
              <p className="mt-3 rounded-lg border border-line bg-raised px-2.5 py-2 text-[12px] leading-relaxed text-muted">
                已按「关闭思维链对比」双倍计算性能测试请求数，这是<strong className="font-medium text-ink">上限</strong>：模型不输出思维链时对比条件会自动跳过，实际次数更少。
              </p>
            )}
            {autoAdded.length > 0 && (
              <p className="mt-3 rounded-lg border border-line bg-raised px-2.5 py-2 text-[12px] leading-relaxed text-muted">
                已自动补上 {autoAdded.length} 个前置依赖项：{autoAdded.map((c) => c.title).join('、')}
              </p>
            )}
            <Button variant="primary" size="lg" icon="play" className="mt-4 w-full" disabled={!canRun} onClick={onStart}>
              开始测试
            </Button>
            {!selectedModels.size && <p className="mt-2 text-center text-[12px] text-faint">请至少选择一个模型</p>}
          </section>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function LivePanel({ onAbort }: { onAbort: () => void }) {
  const { live } = useRun()
  if (!live) return null
  const models = live.modelIds
  const doneChecks = models.reduce(
    (n, id) => n + Object.values(live.results[id]?.checks ?? {}).filter((c) => c.status !== 'running' && c.status !== 'pending').length,
    0,
  )
  const totalChecks = models.length * live.checkIds.length
  const pct = totalChecks ? Math.round((doneChecks / totalChecks) * 100) : 0

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight">
            <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
            测试进行中
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            已完成 {doneChecks}/{totalChecks} 个检查项 · 关闭页面会中止测试
          </p>
        </div>
        <Button variant="danger" icon="stop" onClick={onAbort}>中止</Button>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {models.map((id) => {
          const r = live.results[id]
          const snap = live.modelSnapshots[id]
          const current = r?.current ? CHECK_MAP[r.current] : undefined
          const finished = Object.values(r?.checks ?? {}).filter((c) => c.status !== 'running' && c.status !== 'pending').length
          return (
            <article key={id} className="card card-pad">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{snap?.alias}</h2>
                  <p className="mt-0.5 truncate text-[12px] text-faint">{snap?.providerName} · {snap?.model}</p>
                </div>
                <span className="chip shrink-0">
                  {r?.status === 'done' ? '已完成' : r?.status === 'running' ? `${finished}/${live.checkIds.length}` : r?.status === 'error' ? '出错' : '等待中'}
                </span>
              </div>

              {r?.status === 'running' && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-2 text-[12.5px]">
                  <Icon name="clock" size={13} className="shrink-0 animate-pulse text-brand" />
                  <span className="min-w-0 truncate">
                    <span className="text-ink">{current?.title ?? '准备中'}</span>
                    {r.note && <span className="text-faint"> · {r.note}</span>}
                  </span>
                </div>
              )}
              {r?.error && <div className="mt-3 rounded-lg border border-bad/25 bg-bad/10 px-2.5 py-2 text-[12.5px] text-bad">{r.error}</div>}

              <div className="mt-3 flex flex-wrap gap-1">
                {live.checkIds.map((cid) => {
                  const o = r?.checks[cid]
                  return (
                    <span key={cid} title={`${CHECK_MAP[cid]?.title ?? cid}${o ? ` · ${o.summary}` : ''}`} className="inline-flex">
                      <StatusDot status={o?.status ?? 'pending'} />
                    </span>
                  )
                })}
              </div>

              {r?.status === 'done' && <RunSummaryLine modelId={id} />}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function RunSummaryLine({ modelId }: { modelId: string }) {
  const { live } = useRun()
  const r = live?.results[modelId]
  if (!r) return null
  const perf = r.checks['perf.stream']
  const voice = r.checks['perf.voice']
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12.5px] text-muted">
      {perf?.metrics?.['TTFT p50'] != null && (
        <span>TTFT p50 <span className="text-ink tnum">{fmtMs(Number(perf.metrics['TTFT p50']))}</span></span>
      )}
      {voice?.grade && <StatusPill status={voice.status} size="sm" />}
      {voice?.grade && <span className="text-ink">{voice.grade.label}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SectionHeader({ n, title, right }: { n: number; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">{n}</span>
        {title}
      </h2>
      {right}
    </div>
  )
}

function CheckRow({ check, checked, auto, onToggle }: { check: CheckDef; checked: boolean; auto: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div
      className={classNames(
        'flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors',
        checked ? 'border-brand/40 bg-brand/5' : auto ? 'border-info/30 bg-info/5' : 'border-line hover:border-faint',
      )}
    >
      <div className="pt-0.5">
        <Checkbox checked={checked} onChange={onToggle} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{check.title}</span>
          <Popover label={`${check.title} 的说明`}>
            <h3 className="mb-2 text-sm font-semibold">{check.title}</h3>
            <Markdown text={check.doc} />
          </Popover>
          {auto && <span className="chip shrink-0 border-info/30 text-info">依赖自动选中</span>}
        </div>
        {check.subtitle && <div className="mt-0.5 truncate font-mono text-[11px] text-faint">{check.subtitle}</div>}
      </div>
    </div>
  )
}

function NumField({
  label, value, min, max, step = 1, onChange, hint,
}: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        className="input tnum"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)))
        }}
      />
    </Field>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="tnum">{v}</dd>
    </div>
  )
}
