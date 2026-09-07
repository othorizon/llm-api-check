import { Link } from '../router'
import { Icon, type IconName } from '../components/icons'
import { Button, EmptyState } from '../components/ui'
import { useStore } from '../lib/store'
import { SUITES, checksOfSuite } from '../tests'
import { fmtTime } from '../lib/util'

const HIGHLIGHTS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'lock',
    title: '请求不经服务器',
    desc: 'API Key 与全部测试流量只存在于你的浏览器，直接发往模型服务商。本站没有后端，也没有埋点。',
  },
  {
    icon: 'gauge',
    title: '真实链路测速',
    desc: '在你自己的网络环境里测 TTFT 与 token/s —— 这才是你的用户会体验到的延迟，而不是厂商榜单。',
  },
  {
    icon: 'layers',
    title: '兼容性说人话',
    desc: '把「支持」拆成接受参数、语义生效、结构合规三层，避免网关静默忽略参数造成的假阳性。',
  },
]

const SCENARIOS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'message',
    title: '给语音助手挑模型',
    desc: '实时语音对首 token 时延极其敏感。测试台会给出 TTFT p95、输出 token/s 与吐字抖动，并折算成 A/B/C/D 的适配评级。',
  },
  {
    icon: 'wrench',
    title: '换供应商前的回归',
    desc: '同一套 Agent 代码换个 Base URL 就报 400？先跑一遍工具调用与消息格式兼容性，把差异找出来再迁移。',
  },
  {
    icon: 'braces',
    title: '排查结构化输出翻车',
    desc: 'json_schema 在扁平结构上好好的，一嵌套就漏字段。测试台会分别验证非严格、strict、嵌套三种情况。',
  },
  {
    icon: 'cpu',
    title: '自建推理服务验收',
    desc: 'vLLM / SGLang / Ollama 部署完，用同一套用例验证它跟 OpenAI 规范的差距，包括关闭思维链的传参方式。',
  },
]

const FAQ: { q: string; a: string }[] = [
  {
    q: '我的 API Key 会被上传吗？',
    a: '不会。本站是纯静态页面，没有任何后端接口。API Key 保存在浏览器的 localStorage（可切换为仅当前标签页有效的 sessionStorage），仅用于在你的浏览器里向模型服务商发起请求。你可以在「隐私与安全」页一键清除全部本地数据。',
  },
  {
    q: '测试结果保存在哪里？',
    a: '同样保存在浏览器本地。最多保留最近 25 次测试记录，可以导出为 JSON 备份或分享，导出时默认剔除 API Key。',
  },
  {
    q: '支持哪些模型服务商？',
    a: '任何实现 OpenAI Chat Completions 规范的端点都能接入。内置 OpenAI、DeepSeek、阿里云百炼（通义千问）、火山方舟（豆包）、MiniMax、智谱 GLM、月之暗面 Kimi、硅基流动、OpenRouter、Groq、xAI、Gemini 兼容层、Ollama、vLLM / SGLang 等预设，也可以自定义 Base URL 与请求头。',
  },
  {
    q: '为什么有的服务商连不上？',
    a: '浏览器直连需要目标服务返回 CORS 响应头（Access-Control-Allow-Origin）。部分服务商只面向服务端调用，没有开放跨域，此时页面会明确提示「疑似 CORS 未放行」。你可以自建一个中转地址填入服务商配置，或改用本地部署的模型。',
  },
  {
    q: '多轮测试会不会命中缓存导致数据虚高？',
    a: '不会。性能测试的每一轮都会在提示词最前面注入随机 run-id，破坏前缀以规避 Prompt Cache；只有专门的缓存测试项才会刻意复用完全相同的长前缀，并单独报告命中率与 TTFT 降幅。',
  },
  {
    q: '测试会产生多少费用？',
    a: '取决于你选择的测试项与轮数。发起测试前，页面会实时估算总请求次数；性能测试默认输出 256 token，能力与格式测试的输出都很短。建议先用便宜的模型跑通流程。',
  },
]

export default function Overview() {
  const { models, providers, sessions } = useStore()
  const configured = models.length > 0

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="pt-2">
        <span className="chip border-brand/30 bg-brand/10 text-brand">
          <Icon name="lock" size={11} /> 浏览器直连 · 数据不出本机
        </span>
        <h1 className="mt-4 text-[30px] font-semibold leading-[1.2] tracking-tight sm:text-[38px]">
          大模型能力与性能测试台
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          录入任意 OpenAI 兼容端点，一次性测清它的
          <strong className="text-ink font-medium">首 token 时延与吞吐</strong>、
          <strong className="text-ink font-medium">思维链 / 工具调用 / 结构化输出 / 视觉能力</strong>，以及
          <strong className="text-ink font-medium">非常规消息格式的兼容性</strong>。
          所有请求由浏览器直接发出，不经过任何中间服务器。
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link to={configured ? '/run' : '/models'} className="no-underline">
            <Button variant="primary" size="lg" icon={configured ? 'play' : 'plus'}>
              {configured ? '发起测试' : '添加第一个模型'}
            </Button>
          </Link>
          <Link to="/docs" className="no-underline">
            <Button size="lg" icon="book">看看测什么</Button>
          </Link>
        </div>
      </section>

      {/* 亮点 */}
      <section className="grid gap-3 sm:grid-cols-3">
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} className="card card-pad">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-raised text-brand">
              <Icon name={h.icon} size={16} />
            </div>
            <h2 className="mt-3 text-sm font-semibold">{h.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{h.desc}</p>
          </div>
        ))}
      </section>

      {/* 当前状态 */}
      {configured ? (
        <section>
          <SectionTitle title="你的测试台" desc={`${providers.length} 个服务商 · ${models.length} 个模型 · ${sessions.length} 条测试记录`} />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="card card-pad md:col-span-2">
              <h3 className="text-sm font-semibold">最近的测试</h3>
              {sessions.length ? (
                <ul className="mt-3 divide-y divide-line">
                  {sessions.slice(0, 4).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <Link to={`/results?run=${s.id}`} className="block truncate text-[13.5px] font-medium no-underline hover:underline">
                          {s.label}
                        </Link>
                        <div className="mt-0.5 text-xs text-faint">
                          {fmtTime(s.createdAt)} · {s.modelIds.length} 个模型 · {s.checkIds.length} 个测试项
                        </div>
                      </div>
                      <span className="chip shrink-0">{s.status === 'done' ? '已完成' : s.status === 'aborted' ? '已中止' : '进行中'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-muted">还没有测试记录。选好模型后到「发起测试」页面开始。</p>
              )}
            </div>
            <div className="card card-pad">
              <h3 className="text-sm font-semibold">快速开始</h3>
              <ol className="mt-3 space-y-2.5 text-[13px] text-muted">
                <Step n={1} done={providers.length > 0}>添加服务商与 API Key</Step>
                <Step n={2} done={models.length > 0}>录入要对比的模型</Step>
                <Step n={3} done={sessions.length > 0}>勾选测试项并运行</Step>
              </ol>
              <Link to="/run" className="no-underline">
                <Button variant="primary" className="mt-4 w-full" icon="play">发起测试</Button>
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="card">
          <EmptyState
            icon="cpu"
            title="还没有配置模型"
            desc="先添加一个服务商（内置 14 个主流预设，也支持自定义 OpenAI 兼容端点），再录入要对比的模型即可开始测试。"
            action={
              <Link to="/models" className="no-underline">
                <Button variant="primary" icon="plus">去配置</Button>
              </Link>
            }
          />
        </section>
      )}

      {/* 三大套件 */}
      <section>
        <SectionTitle title="三类测试，覆盖选型的三个问题" desc="快不快、能不能、接不接受" />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {SUITES.map((s) => {
            const checks = checksOfSuite(s.id)
            return (
              <article key={s.id} className="card card-pad flex flex-col">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{s.title}</h3>
                  <span className="chip">{checks.length} 项</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.desc}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-[12.5px] text-muted">
                  {checks.slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-start gap-1.5">
                      <Icon name="check" size={12} className="mt-1 shrink-0 text-ok" strokeWidth={2.5} />
                      <span>{c.title}</span>
                    </li>
                  ))}
                  {checks.length > 6 && <li className="text-faint pl-[18px]">…等 {checks.length} 项</li>}
                </ul>
                <Link to="/docs" className="mt-4 inline-flex items-center gap-1 text-[13px] no-underline hover:underline">
                  查看判定标准 <Icon name="arrowRight" size={13} />
                </Link>
              </article>
            )
          })}
        </div>
      </section>

      {/* 场景 */}
      <section>
        <SectionTitle title="典型使用场景" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <div key={s.title} className="card card-pad flex gap-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
                <Icon name={s.icon} size={15} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 数据流向 */}
      <section className="card card-pad">
        <SectionTitle title="数据是怎么流动的" desc="一句话：只有你的浏览器和模型服务商之间有流量" />
        <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <FlowBox icon="globe" title="本站静态页面" desc="仅通过 CDN 下发 HTML / JS，不含任何 API" />
          <FlowArrow label="页面加载" />
          <FlowBox icon="lock" title="你的浏览器" desc="保存配置与结果，直接发起请求" highlight />
          <FlowArrow label="HTTPS 直连" />
          <FlowBox icon="cpu" title="模型服务商" desc="OpenAI / 百炼 / 方舟 / 自建端点…" />
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          页面本身托管在 Cloudflare 静态资源上，加载完成后就与本站再无通信。
          详见 <Link to="/privacy" className="underline underline-offset-2">隐私与安全说明</Link>。
        </p>
      </section>

      {/* FAQ */}
      <section>
        <SectionTitle title="常见问题" />
        <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 py-3.5 sm:px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-medium">
                {f.q}
                <Icon name="chevronDown" size={15} className="shrink-0 text-faint transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      {desc && <p className="mt-1 text-[13px] text-muted">{desc}</p>}
    </div>
  )
}

function Step({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={
          done
            ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok'
            : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-faint'
        }
      >
        {done ? <Icon name="check" size={12} strokeWidth={2.6} /> : n}
      </span>
      <span className={done ? 'text-faint line-through' : ''}>{children}</span>
    </li>
  )
}

function FlowBox({ icon, title, desc, highlight }: { icon: IconName; title: string; desc: string; highlight?: boolean }) {
  return (
    <div className={`flex-1 rounded-lg border px-3.5 py-3 ${highlight ? 'border-brand/40 bg-brand/5' : 'border-line bg-raised'}`}>
      <div className={`flex items-center gap-2 text-[13px] font-medium ${highlight ? 'text-brand' : 'text-ink'}`}>
        <Icon name={icon} size={14} /> {title}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{desc}</p>
    </div>
  )
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-1 text-faint">
      <Icon name="arrowRight" size={14} className="rotate-90 sm:rotate-0" />
      <span className="text-[10.5px] whitespace-nowrap">{label}</span>
    </div>
  )
}
