import { useMemo, useState } from 'react'
import { Button, Checkbox, EmptyState, Field, Modal, useToast } from '../components/ui'
import { Icon } from '../components/icons'
import { PROVIDER_PRESETS, presetOf, type CorsSupport } from '../lib/presets'
import { actions, useStore } from '../lib/store'
import { probeProvider, type ProbeResult } from '../lib/client'
import type { HeaderPair, ModelEntry, Provider, ProviderPresetId } from '../lib/types'
import { classNames, fmtMs } from '../lib/util'
import { Link } from '../router'

const CORS_META: Record<CorsSupport, { label: string; cls: string }> = {
  yes: { label: '支持浏览器直连', cls: 'text-ok bg-ok/10 border-ok/25' },
  partial: { label: '部分支持', cls: 'text-warn bg-warn/10 border-warn/25' },
  no: { label: '不支持直连', cls: 'text-bad bg-bad/10 border-bad/25' },
  unknown: { label: '直连情况未知', cls: 'text-muted bg-raised border-line' },
  local: { label: '本地服务，需放行跨域', cls: 'text-info bg-info/10 border-info/25' },
}

export default function Models() {
  const { providers, models } = useStore()
  const [providerModal, setProviderModal] = useState<{ open: boolean; edit?: Provider }>({ open: false })
  const [modelModal, setModelModal] = useState<{ open: boolean; providerId?: string; edit?: ModelEntry }>({ open: false })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">模型与服务商</h1>
          <p className="mt-1 text-[13px] text-muted">
            先配置一个 OpenAI 兼容端点，再录入要测试的模型。API Key 只写入本机存储，不会发往本站。
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon="plus" onClick={() => setProviderModal({ open: true })}>添加服务商</Button>
          <Button
            variant="primary"
            icon="plus"
            disabled={!providers.length}
            onClick={() => setModelModal({ open: true, providerId: providers[0]?.id })}
          >
            添加模型
          </Button>
        </div>
      </header>

      {!providers.length ? (
        <div className="card">
          <EmptyState
            icon="globe"
            title="还没有服务商"
            desc="内置 14 个主流预设（OpenAI、DeepSeek、通义千问、豆包、MiniMax、GLM、Kimi、OpenRouter、Ollama、vLLM…），也可以填写任意自定义 Base URL。"
            action={<Button variant="primary" icon="plus" onClick={() => setProviderModal({ open: true })}>添加服务商</Button>}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              models={models.filter((m) => m.providerId === p.id)}
              onEdit={() => setProviderModal({ open: true, edit: p })}
              onAddModel={() => setModelModal({ open: true, providerId: p.id })}
              onEditModel={(m) => setModelModal({ open: true, providerId: p.id, edit: m })}
            />
          ))}
        </div>
      )}

      {providerModal.open && (
        <ProviderModal
          edit={providerModal.edit}
          onClose={() => setProviderModal({ open: false })}
        />
      )}
      {modelModal.open && (
        <ModelModal
          providerId={modelModal.providerId!}
          edit={modelModal.edit}
          onClose={() => setModelModal({ open: false })}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ProviderCard({
  provider, models, onEdit, onAddModel, onEditModel,
}: {
  provider: Provider
  models: ModelEntry[]
  onEdit: () => void
  onAddModel: () => void
  onEditModel: (m: ModelEntry) => void
}) {
  const preset = presetOf(provider.preset)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [probing, setProbing] = useState(false)
  const toast = useToast()
  const cors = CORS_META[preset.cors]

  const runProbe = async () => {
    setProbing(true)
    setProbe(null)
    try {
      const r = await probeProvider(provider)
      setProbe(r)
    } finally {
      setProbing(false)
    }
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">{provider.name}</h2>
            <span className="chip">{preset.nameEn}</span>
            <span className={classNames('chip', cors.cls)}>{cors.label}</span>
            {!provider.apiKey && <span className="chip text-warn bg-warn/10 border-warn/25">未填 API Key</span>}
            {provider.relayUrl && <span className="chip text-info bg-info/10 border-info/25">经中转</span>}
          </div>
          <div className="mt-1.5 font-mono text-[12px] text-faint break-all">
            {provider.baseUrl || '（未填写 Base URL）'}
            <span className="text-line px-1">·</span>
            {provider.chatPath || preset.chatPath}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" icon="refresh" onClick={runProbe} disabled={probing}>
            {probing ? '检测中…' : '连通性检测'}
          </Button>
          <Button size="sm" icon="edit" onClick={onEdit}>编辑</Button>
          <Button
            size="sm"
            variant="danger"
            icon="trash"
            onClick={() => {
              if (confirm(`删除服务商「${provider.name}」及其下 ${models.length} 个模型？`)) {
                actions.removeProvider(provider.id)
                toast('已删除', 'ok')
              }
            }}
          >
            删除
          </Button>
        </div>
      </div>

      {probe && (
        <div
          className={classNames(
            'flex items-start gap-2 border-b border-line px-4 py-2.5 text-[12.5px] sm:px-5',
            probe.ok ? 'text-ok' : probe.kind === 'notfound' ? 'text-muted' : 'text-bad',
          )}
        >
          <Icon name={probe.ok ? 'check' : 'alert'} size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div>{probe.message}（{fmtMs(probe.durationMs)}）</div>
            {probe.kind === 'cors' && (
              <div className="mt-1 text-muted">
                解决办法见 <Link to="/docs" className="underline underline-offset-2">测试项说明 → 浏览器直连与 CORS</Link>，
                或在服务商配置里填写自建中转地址。
              </div>
            )}
            {!!probe.models?.length && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {probe.models.slice(0, 12).map((id) => (
                  <button
                    key={id}
                    className="chip hover:border-brand hover:text-brand"
                    onClick={() => {
                      actions.addModel({ providerId: provider.id, model: id, alias: id, enabled: true })
                      toast(`已添加模型 ${id}`, 'ok')
                    }}
                  >
                    + {id}
                  </button>
                ))}
                {probe.models.length > 12 && <span className="chip">还有 {probe.models.length - 12} 个…</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {models.length ? (
        <ul className="divide-y divide-line">
          {models.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <Checkbox checked={m.enabled} onChange={(v) => actions.updateModel(m.id, { enabled: v })} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium">{m.alias || m.model}</span>
                  {m.alias && m.alias !== m.model && (
                    <span className="truncate font-mono text-[11.5px] text-faint">{m.model}</span>
                  )}
                </div>
                {m.notes && <div className="mt-0.5 truncate text-[12px] text-faint">{m.notes}</div>}
              </div>
              <button className="btn btn-subtle btn-sm" onClick={() => onEditModel(m)} aria-label="编辑模型">
                <Icon name="edit" size={13} />
              </button>
              <button
                className="btn btn-subtle btn-sm text-faint hover:text-bad"
                onClick={() => actions.removeModel(m.id)}
                aria-label="删除模型"
              >
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-5 text-center text-[13px] text-muted sm:px-5">
          还没有模型。
          <button className="ml-1 underline underline-offset-2" onClick={onAddModel}>现在添加</button>
        </div>
      )}

      <div className="border-t border-line px-4 py-2.5 sm:px-5">
        <Button size="sm" icon="plus" onClick={onAddModel}>添加模型</Button>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function ProviderModal({ edit, onClose }: { edit?: Provider; onClose: () => void }) {
  const toast = useToast()
  const [preset, setPreset] = useState<ProviderPresetId>(edit?.preset ?? 'openai')
  const p0 = presetOf(preset)
  const [name, setName] = useState(edit?.name ?? p0.name)
  const [baseUrl, setBaseUrl] = useState(edit?.baseUrl ?? p0.baseUrl)
  const [chatPath, setChatPath] = useState(edit?.chatPath ?? p0.chatPath)
  const [apiKey, setApiKey] = useState(edit?.apiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [headers, setHeaders] = useState<HeaderPair[]>(edit?.headers ?? [])
  const [relayUrl, setRelayUrl] = useState(edit?.relayUrl ?? '')
  const [advanced, setAdvanced] = useState(!!edit?.relayUrl || !!edit?.headers?.length)

  const choosePreset = (id: ProviderPresetId) => {
    const p = presetOf(id)
    setPreset(id)
    if (!edit) {
      setName(p.name)
      setBaseUrl(p.baseUrl)
      setChatPath(p.chatPath)
    }
  }

  const save = () => {
    if (!baseUrl.trim()) return toast('请填写 Base URL', 'bad')
    const payload = {
      name: name.trim() || presetOf(preset).name,
      preset,
      baseUrl: baseUrl.trim(),
      chatPath: chatPath.trim() || '/chat/completions',
      apiKey: apiKey.trim(),
      headers: headers.filter((h) => h.key.trim()),
      relayUrl: relayUrl.trim() || undefined,
    }
    if (edit) {
      actions.updateProvider(edit.id, payload)
      toast('服务商已更新', 'ok')
    } else {
      actions.addProvider(payload)
      toast('服务商已添加', 'ok')
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={edit ? '编辑服务商' : '添加服务商'}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={save}>{edit ? '保存' : '添加'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="服务商预设" hint="选择预设会自动填好 Base URL 与请求路径，之后仍可手动修改。">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choosePreset(p.id)}
                className={classNames(
                  'rounded-lg border px-2.5 py-2 text-left transition-colors',
                  preset === p.id ? 'border-brand bg-brand/5' : 'border-line hover:border-faint',
                )}
              >
                <span className="block truncate text-[12.5px] font-medium">{p.name}</span>
                <span className="mt-0.5 block truncate text-[10.5px] text-faint">{p.nameEn}</span>
              </button>
            ))}
          </div>
        </Field>

        {(p0.note || p0.corsNote || p0.thinkingOff) && (
          <div className="rounded-lg border border-line bg-raised px-3 py-2.5 text-[12.5px] leading-relaxed text-muted space-y-1">
            {p0.note && <div>· {p0.note}</div>}
            {p0.corsNote && <div>· {p0.corsNote}</div>}
            {p0.thinkingOff && <div>· 已知关闭思维链写法：<code className="font-mono text-ink">{p0.thinkingOff}</code></div>}
            {(p0.docsUrl || p0.keysUrl) && (
              <div className="flex gap-3 pt-0.5">
                {p0.docsUrl && <a href={p0.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">API 文档 <Icon name="external" size={11} /></a>}
                {p0.keysUrl && <a href={p0.keysUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">获取 API Key <Icon name="external" size={11} /></a>}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="显示名称"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：公司内网网关" /></Field>
          <Field label="Base URL" required hint="到 /v1 为止，不要带 /chat/completions">
            <input className="input font-mono text-[12.5px]" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
          </Field>
        </div>

        <Field
          label="API Key"
          hint={
            <span>
              仅保存在本机（可在<Link to="/privacy" className="underline underline-offset-2">隐私设置</Link>中改为「关闭标签页即清除」）。
            </span>
          }
          action={
            <button type="button" className="text-[12px] text-muted hover:text-ink" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '隐藏' : '显示'}
            </button>
          }
        >
          <input
            className="input font-mono text-[12.5px]"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
          />
        </Field>

        <button type="button" className="flex items-center gap-1 text-[13px] text-muted hover:text-ink" onClick={() => setAdvanced((v) => !v)}>
          <Icon name={advanced ? 'chevronDown' : 'chevronRight'} size={14} /> 高级设置
        </button>

        {advanced && (
          <div className="space-y-4 rounded-lg border border-line bg-raised/60 p-3.5">
            <Field label="对话补全路径" hint="默认 /chat/completions；MiniMax 等厂商需改为 /text/chatcompletion_v2。">
              <input className="input font-mono text-[12.5px]" value={chatPath} onChange={(e) => setChatPath(e.target.value)} />
            </Field>

            <Field label="自定义请求头" hint="部分网关需要额外的鉴权或路由头，例如 X-DashScope-Async、HTTP-Referer。">
              <div className="space-y-1.5">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input
                      className="input font-mono text-[12.5px]"
                      placeholder="Header 名"
                      value={h.key}
                      onChange={(e) => setHeaders(headers.map((x, n) => (n === i ? { ...x, key: e.target.value } : x)))}
                    />
                    <input
                      className="input font-mono text-[12.5px]"
                      placeholder="值"
                      value={h.value}
                      onChange={(e) => setHeaders(headers.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)))}
                    />
                    <button className="btn btn-subtle btn-sm shrink-0" onClick={() => setHeaders(headers.filter((_, n) => n !== i))}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
                <Button size="sm" icon="plus" onClick={() => setHeaders([...headers, { key: '', value: '' }])}>添加请求头</Button>
              </div>
            </Field>

            <Field
              label="中转地址（可选）"
              hint="留空表示浏览器直连。若目标服务未开放 CORS，可填入你自建的中转地址；支持 {url} 占位写法。注意：中转方能看到你的请求内容与 Key，请只填自己可控的服务。"
            >
              <input className="input font-mono text-[12.5px]" value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} placeholder="https://my-worker.example.workers.dev/proxy/{url}" />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

function ModelModal({ providerId, edit, onClose }: { providerId: string; edit?: ModelEntry; onClose: () => void }) {
  const { providers } = useStore()
  const toast = useToast()
  const [pid, setPid] = useState(edit?.providerId ?? providerId)
  const [text, setText] = useState(edit?.model ?? '')
  const [alias, setAlias] = useState(edit?.alias ?? '')
  const [notes, setNotes] = useState(edit?.notes ?? '')
  const preset = useMemo(() => presetOf(providers.find((p) => p.id === pid)?.preset), [providers, pid])

  const ids = text.split('\n').map((s) => s.trim()).filter(Boolean)

  const save = () => {
    if (!ids.length) return toast('请填写至少一个模型 ID', 'bad')
    if (edit) {
      actions.updateModel(edit.id, { providerId: pid, model: ids[0], alias: alias.trim() || ids[0], notes: notes.trim() })
      toast('模型已更新', 'ok')
    } else {
      actions.addModels(
        ids.map((id, i) => ({
          providerId: pid,
          model: id,
          alias: ids.length === 1 ? (alias.trim() || id) : id,
          notes: i === 0 ? notes.trim() : '',
          enabled: true,
        })),
      )
      toast(`已添加 ${ids.length} 个模型`, 'ok')
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={edit ? '编辑模型' : '添加模型'}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={save}>{edit ? '保存' : `添加${ids.length > 1 ? ` ${ids.length} 个` : ''}`}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="所属服务商">
          <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field
          label={edit ? '模型 ID' : '模型 ID（每行一个，可批量添加）'}
          required
          hint="请求体里 model 字段的值。火山方舟可填接入点 ID（ep-…）。"
        >
          {edit ? (
            <input className="input font-mono text-[12.5px]" value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <textarea
              className="input font-mono text-[12.5px] min-h-[92px] resize-y"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'gpt-4o-mini\ndeepseek-chat'}
            />
          )}
        </Field>

        {!!preset.models.length && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[12px] text-faint py-0.5">常用：</span>
            {preset.models.map((m) => (
              <button
                key={m}
                className="chip hover:border-brand hover:text-brand"
                onClick={() => setText((t) => (t.trim() ? `${t.trim()}\n${m}` : m))}
              >
                + {m}
              </button>
            ))}
          </div>
        )}

        {(edit || ids.length <= 1) && (
          <Field label="显示别名" hint="留空则使用模型 ID。用于在结果对比中更好辨认。">
            <input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="例如：豆包 1.6 · 深度思考" />
          </Field>
        )}

        <Field label="备注">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="例如：华东节点 / 已开通缓存" />
        </Field>
      </div>
    </Modal>
  )
}
