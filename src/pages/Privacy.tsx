import { useRef, useState } from 'react'
import { Button, Field, Modal, Toggle, useToast } from '../components/ui'
import { Icon, type IconName } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { actions, exportPayload, useStore } from '../lib/store'
import { download, fmtInt, safeJson } from '../lib/util'
import { Link } from '../router'

const STORAGE_ROWS: { what: string; where: string; content: string }[] = [
  { what: '服务商配置', where: 'localStorage', content: '名称、Base URL、请求路径、自定义请求头、可选的中转地址（不含 API Key）' },
  { what: 'API Key', where: 'localStorage 或 sessionStorage', content: '按下方开关决定；与其它配置分开存放，导出时默认剔除' },
  { what: '模型列表', where: 'localStorage', content: '模型 ID、别名、备注' },
  { what: '测试记录', where: 'localStorage', content: '最近 25 次测试的指标、结论、脱敏后的请求与响应片段' },
  { what: '界面设置', where: 'localStorage', content: '主题、测试项勾选、运行参数' },
]

const NEVER: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'globe', title: '没有后端接口', desc: '整站是纯静态资源。页面加载完成后，浏览器与本站之间不再有任何请求。' },
  { icon: 'eye', title: '没有埋点与统计', desc: '不接入任何分析脚本、广告 SDK 或第三方追踪器，不写 Cookie。' },
  { icon: 'lock', title: '不经手你的密钥', desc: 'API Key 只在浏览器内存与本机存储中出现，仅作为 Authorization 头发往你填写的模型端点。' },
  { icon: 'shield', title: '不上传测试结果', desc: '结果只写入本机。要分享时由你主动导出 JSON 或复制 Markdown。' },
]

export default function Privacy() {
  const { settings, providers, models, sessions } = useStore()
  const [importOpen, setImportOpen] = useState(false)
  const [exportKeys, setExportKeys] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const doExport = () => {
    download(
      `llm-test-bench-${new Date().toISOString().slice(0, 10)}.json`,
      safeJson(exportPayload({ includeKeys: exportKeys, includeSessions: true })),
    )
    toast(exportKeys ? '已导出（包含 API Key，请妥善保管）' : '已导出（不含 API Key）', 'ok')
  }

  const doImport = async (file: File) => {
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      actions.importData(payload)
      toast('导入完成', 'ok')
      setImportOpen(false)
    } catch {
      toast('导入失败：文件不是有效的 JSON', 'bad')
    }
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">隐私与数据安全</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">
          这是一个<strong className="text-ink font-medium">没有服务器的工具</strong>。
          你的 API Key、模型配置和测试结果全部保存在这台设备的浏览器里；
          所有测试请求由浏览器直接发往你自己填写的模型服务商，本站既看不到、也无法看到。
        </p>
      </header>

      {/* 不做什么 */}
      <section className="grid gap-3 sm:grid-cols-2">
        {NEVER.map((n) => (
          <div key={n.title} className="card card-pad flex gap-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ok/10 text-ok">
              <Icon name={n.icon} size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{n.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{n.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* 存储明细 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">本机都存了什么</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          当前：{providers.length} 个服务商 · {models.length} 个模型 · {sessions.length} 条测试记录
          {' · 约 '}{fmtInt(estimateBytes() / 1024)} KB
        </p>
        <div className="mt-4 card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2.5 font-medium">内容</th>
                  <th className="px-3 py-2.5 font-medium">位置</th>
                  <th className="px-3 py-2.5 font-medium">具体存了什么</th>
                </tr>
              </thead>
              <tbody>
                {STORAGE_ROWS.map((r) => (
                  <tr key={r.what} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.what}</td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted">{r.where}</td>
                    <td className="px-3 py-2.5 text-muted">{r.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Key 策略 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">API Key 的保存方式</h2>
        <div className="mt-4 card card-pad space-y-4">
          <Toggle
            checked={settings.persistKeys}
            onChange={(v) => {
              actions.setSettings({ persistKeys: v })
              toast(v ? '已改为长期保存在本机' : '已改为仅当前标签页有效', 'ok')
            }}
            label="长期保存 API Key（localStorage）"
            hint="关闭后改用 sessionStorage：关闭标签页即清除，下次需要重新填写。在公用电脑上建议关闭。"
          />
          <div className="rounded-lg border border-warn/25 bg-warn/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
            <span className="font-medium text-warn">安全提示：</span>
            浏览器本地存储不加密。请为测试单独申请一枚**权限与额度受限**的 API Key，
            不要使用生产环境主密钥；测试完成后可在下方一键清除。
          </div>
        </div>
      </section>

      {/* 中转 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">关于「中转地址」</h2>
        <div className="mt-3 card card-pad">
          <Markdown
            text={`部分模型服务商没有开放 CORS，浏览器无法直连。此时你可以在服务商配置里填写一个**中转地址**。

请务必注意：**一旦启用中转，请求内容与 API Key 就会经过那台服务器**。因此：

- 只填写你自己部署、自己可控的地址（例如自建的 Cloudflare Worker、Nginx）；
- 不要使用来路不明的公共代理；
- 启用了中转的服务商，卡片上会显示「经中转」标记，测试结果里也会体现。

默认情况下所有服务商都是直连，本站不提供、也不内置任何公共中转。`}
          />
        </div>
      </section>

      {/* 数据管理 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">数据管理</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="card card-pad">
            <h3 className="text-sm font-semibold">导出备份</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              导出全部配置与测试记录为 JSON，可在其它设备导入。
            </p>
            <label className="mt-3 flex items-start gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={exportKeys}
                onChange={(e) => setExportKeys(e.target.checked)}
                className="mt-0.5 accent-[rgb(var(--c-brand))]"
              />
              <span className="text-muted">同时导出 API Key（默认不导出）</span>
            </label>
            <Button className="mt-3 w-full" icon="download" onClick={doExport}>导出 JSON</Button>
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-semibold">导入</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              从备份文件恢复。同名条目按 ID 去重，不会覆盖已有数据。
            </p>
            <Button className="mt-3 w-full" icon="upload" onClick={() => setImportOpen(true)}>选择文件</Button>
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-semibold text-bad">清除本机数据</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              删除全部服务商、模型、API Key 与测试记录。此操作不可撤销。
            </p>
            <div className="mt-3 space-y-2">
              <Button
                className="w-full"
                onClick={() => {
                  if (confirm(`删除全部 ${sessions.length} 条测试记录？配置会保留。`)) {
                    actions.clearSessions()
                    toast('测试记录已清除', 'ok')
                  }
                }}
              >
                仅清除测试记录
              </Button>
              <Button
                variant="danger"
                className="w-full"
                icon="trash"
                onClick={() => {
                  if (confirm('确定要清空本机所有数据吗？包括 API Key、模型配置与全部测试记录。')) {
                    actions.wipeAll()
                    toast('本机数据已全部清除', 'ok')
                  }
                }}
              >
                清空全部数据
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 自建 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">不放心？自己部署一份</h2>
        <div className="mt-3 card card-pad">
          <Markdown
            text={`本项目开源，构建产物是纯静态文件，可以部署到 Cloudflare Pages / Workers，或任何静态托管上；
也可以 \`npm run build\` 之后用任意本地服务器打开，完全离线使用（模型请求仍然直接发往你配置的端点）。

自建之后，你可以逐字核对源码里每一处网络请求 —— 除了向你填写的模型端点发起的请求之外，不存在任何其它出站流量。`}
          />
          <a
            href="https://github.com/othorizon/which-llm-i-can-use"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] no-underline hover:underline"
          >
            <Icon name="github" size={14} /> 查看源码与部署说明 <Icon name="external" size={12} />
          </a>
        </div>
      </section>

      <p className="text-[13px] text-muted">
        想了解每项测试具体发了什么请求？见 <Link to="/docs" className="underline underline-offset-2">测试项说明</Link>。
      </p>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="导入备份"
        width="max-w-md"
        footer={<Button onClick={() => setImportOpen(false)}>取消</Button>}
      >
        <Field label="选择此前导出的 JSON 文件" hint="文件只在浏览器内解析，不会上传。">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="input"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
            }}
          />
        </Field>
      </Modal>
    </div>
  )
}

function estimateBytes(): number {
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith('wliu.')) continue
      total += (localStorage.getItem(k)?.length ?? 0) * 2
    }
    return total
  } catch {
    return 0
  }
}
