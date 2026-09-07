import { useState } from 'react'
import { Markdown } from '../components/Markdown'
import { StatusPill } from '../components/ui'
import { Icon } from '../components/icons'
import { ALL_CHECKS, GROUPS, SUITES } from '../tests'
import { PROVIDER_PRESETS } from '../lib/presets'
import type { CheckStatus } from '../lib/types'
import { classNames } from '../lib/util'
import { Link } from '../router'

const GLOSSARY: { term: string; en?: string; body: string }[] = [
  {
    term: '首 token 时延',
    en: 'TTFT · Time To First Token',
    body: '从发出请求到收到第一个可见正文 token 的时间。它由排队、网络往返、prefill（输入编码）三部分构成，是对话类产品「反应快不快」的决定性指标。若模型先输出思维链，本站以正文的第一个 token 计时——那才是用户真正看到/听到内容的时刻。',
  },
  {
    term: 'token 间隔',
    en: 'ITL · Inter-Token Latency（也叫 TPOT）',
    body: '相邻两个输出 chunk 之间的时间差。p95/p50 的比值越接近 1，吐字越均匀；比值大说明有卡顿，语音播报需要更大的缓冲区。',
  },
  {
    term: '输出速度',
    en: 'Output tokens per second',
    body: '本站用「解码阶段吞吐」口径：completion_tokens ÷ (总耗时 − TTFT)，排除首 token 等待，更能反映纯生成速度。若端点不返回 usage，则按字符估算并在结果中标注。',
  },
  {
    term: '端到端时延',
    en: 'E2E Latency',
    body: '从发起请求到收到最后一个 token 的总时间。非流式场景下它等于用户的全部等待时间。',
  },
  {
    term: 'p50 / p95',
    en: 'Percentile',
    body: '把多轮测试结果排序后取中位数（p50）与 95 分位（p95）。p50 代表典型体验，p95 代表「较差的那几次」，做 SLA 时通常看 p95。',
  },
  {
    term: '上下文缓存',
    en: 'Prompt Caching / 前缀缓存',
    body: '服务端把重复出现的长前缀的 KV Cache 缓存下来，命中后可大幅降低 TTFT 与输入费用。命中要求前缀逐字节一致，且长度超过厂商的最小阈值（常见 1k~4k tokens）。usage 字段名各家不同：cached_tokens、prompt_cache_hit_tokens 等，本站均已兼容。',
  },
  {
    term: '思维链',
    en: 'CoT · Chain of Thought / Reasoning',
    body: '模型在给出答案前产生的推理过程。是否**回传**给调用方由厂商决定：DeepSeek / 通义千问 / 豆包 / GLM 走 reasoning_content 字段，OpenRouter 走 reasoning，自建 vLLM 常见 <think> 标签，而 OpenAI o 系列只计费不回传。',
  },
  {
    term: '思考等级',
    en: 'reasoning_effort',
    body: '控制模型思考预算的参数，常见取值 minimal / low / medium / high。很多网关会静默忽略未知参数，因此必须同时验证「接受」与「生效」。',
  },
  {
    term: '工具调用',
    en: 'Function Calling / Tool Calling',
    body: '模型按给定的 JSON Schema 输出一次函数调用请求（tool_calls），由客户端执行后把结果以 role:"tool" 的消息回填。这是 Agent 的基础设施。',
  },
  {
    term: '强制工具调用',
    en: 'tool_choice: required / any',
    body: '要求模型本轮必须调用工具而不能直接作答。LangChain 的 with_structured_output(method="function_calling") 正是依赖这个模式，因此它的支持度直接决定了大量框架代码能否跑通。',
  },
  {
    term: '结构化输出',
    en: 'Structured Outputs',
    body: '通过 response_format 约束输出格式。三个层次逐级增强：json_object 只保证是合法 JSON；json_schema 提供字段定义但不一定强制；strict: true 通常意味着服务端使用约束解码，从根本上保证结构合法。',
  },
  {
    term: '消息角色',
    en: 'Message roles',
    body: 'system（全局指令）、user、assistant、tool（工具结果），以及 OpenAI 推理模型引入的 developer。不同端点对角色顺序、重复、配对的宽松程度差异很大，这正是「消息格式兼容性」套件要测的内容。',
  },
  {
    term: '跨域资源共享',
    en: 'CORS',
    body: '浏览器的安全机制：只有当目标服务返回 Access-Control-Allow-Origin 等响应头时，网页脚本才能读取其响应。本站没有后端，因此只能测试开放了 CORS 的端点，或你自建的中转地址。',
  },
]

const STATUS_DOC: { s: CheckStatus; title: string; body: string }[] = [
  { s: 'pass', title: '支持', body: '请求返回 2xx，参数语义确实生效，返回内容满足预期（例如口令被复述、schema 校验全过、工具被正确调用）。' },
  { s: 'partial', title: '部分支持', body: '请求没被拒绝，但语义没有真正生效，或结果只满足了一部分。最典型的是网关静默忽略未知参数——这类「假支持」正是本站要暴露的。' },
  { s: 'fail', title: '未通过', body: '端点接受了请求，但行为明显错误（例如指名调用了别的函数、声称支持视觉却读错图片内容）。' },
  { s: 'unsupported', title: '不支持', body: '请求被 4xx 拒绝。结论明确：该端点不接受这种参数或消息结构。' },
  { s: 'error', title: '出错', body: '网络、CORS、鉴权、限流或超时导致无法得出能力结论。这不是模型的问题，请修复配置后重测。' },
  { s: 'skipped', title: '已跳过', body: '前置条件不满足而未执行，例如模型本身没有思维链时不再测试「关闭思维链」。' },
]

export default function Docs() {
  const [openSuite, setOpenSuite] = useState<string>('performance')

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">测试项说明与术语表</h1>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-muted">
          这里写清楚每一项测试到底发了什么请求、依据什么判定结论。所有判定都基于真实响应，不做任何厂商声明的照搬。
        </p>
      </header>

      {/* 判定口径 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">结果状态的判定口径</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          「支持」被刻意拆成了三层：接受参数、语义生效、结果合规。只有三层都过才算通过。
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {STATUS_DOC.map((d) => (
            <div key={d.s} className="card card-pad">
              <div className="flex items-center gap-2">
                <StatusPill status={d.s} />
                <span className="text-[13px] font-semibold">{d.title}</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 全部测试项 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">全部测试项</h2>
        <p className="mt-1.5 text-[13px] text-muted">共 {ALL_CHECKS.length} 项，分属三个套件。点击展开查看请求构造与判定标准。</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {SUITES.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenSuite(s.id)}
              className={classNames(
                'rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors',
                openSuite === s.id ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink',
              )}
            >
              {s.title}
              <span className="ml-1.5 text-[11px] opacity-70">{ALL_CHECKS.filter((c) => c.suite === s.id).length}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-6">
          {GROUPS.filter((g) => g.suite === openSuite).map((g) => {
            const list = ALL_CHECKS.filter((c) => c.group === g.id)
            if (!list.length) return null
            return (
              <div key={g.id}>
                <h3 className="text-[14px] font-semibold">{g.title}</h3>
                <p className="mt-0.5 text-[12.5px] text-muted">{g.desc}</p>
                <div className="mt-3 space-y-2">
                  {list.map((c) => (
                    <details key={c.id} className="group card">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium">{c.title}</div>
                          {c.subtitle && <div className="mt-0.5 font-mono text-[11.5px] text-faint">{c.subtitle}</div>}
                        </div>
                        <Icon name="chevronDown" size={15} className="mt-1 shrink-0 text-faint transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-line px-4 py-3.5">
                        <Markdown text={c.doc} />
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 术语表 */}
      <section id="glossary">
        <h2 className="text-[17px] font-semibold tracking-tight">术语表</h2>
        <dl className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="px-4 py-3.5 sm:px-5">
              <dt className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13.5px] font-semibold">{g.term}</span>
                {g.en && <span className="font-mono text-[11.5px] text-faint">{g.en}</span>}
              </dt>
              <dd className="mt-1.5 text-[13px] leading-relaxed text-muted">
                <Markdown text={g.body} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* CORS */}
      <section id="cors">
        <h2 className="text-[17px] font-semibold tracking-tight">浏览器直连与 CORS</h2>
        <div className="mt-3 card card-pad">
          <Markdown
            text={`本站没有后端，所有请求都由你的浏览器直接发往模型服务商。这带来了最好的隐私性，但也意味着：**只有开放了 CORS 的端点才能被测试**。

如果连通性检测提示「疑似 CORS 未放行」，可以按下面的顺序排查：

1. **确认 Base URL 正确**，且以 \`https://\` 开头。HTTPS 页面无法请求 \`http://\` 地址（\`http://localhost\` 除外）。
2. **本地服务需要显式放行跨域**：Ollama 设置环境变量 \`OLLAMA_ORIGINS\`；vLLM 启动时加 \`--allowed-origins\`；或在前面挂一层反向代理补上响应头。
3. **服务商未开放跨域**：这类端点只面向服务端调用。你可以自建一个中转（Cloudflare Worker、Nginx 均可），在服务商配置的「中转地址」里填入。

中转会让请求经过第三方，**请只填写你自己可控的地址**。填写后该服务商的卡片上会出现「经中转」标记，提醒你这条链路不再是纯直连。`}
          />
        </div>
      </section>

      {/* 服务商速查 */}
      <section id="providers">
        <h2 className="text-[17px] font-semibold tracking-tight">内置服务商速查表</h2>
        <div className="mt-3 card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2.5 font-medium">服务商</th>
                  <th className="px-3 py-2.5 font-medium">Base URL</th>
                  <th className="px-3 py-2.5 font-medium">关闭思维链写法</th>
                  <th className="px-3 py-2.5 font-medium">文档</th>
                </tr>
              </thead>
              <tbody>
                {PROVIDER_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{p.name}</div>
                      <div className="text-[11px] text-faint">{p.nameEn}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted break-all">{p.baseUrl}</td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted">{p.thinkingOff ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {p.docsUrl ? (
                        <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                          文档 <Icon name="external" size={11} />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-faint">
          表中信息随厂商更新可能变化，以各家官方文档为准；测试台的结论一律以实测响应为准。
        </p>
      </section>

      {/* 费用 */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-tight">费用与限流</h2>
        <div className="mt-3 card card-pad">
          <Markdown
            text={`测试会真实消耗你的 API 额度。几个控制成本的建议：

- 发起测试前，页面右侧会实时估算**总请求次数**（模型数 × 每模型请求数）。
- 性能测试的费用主要来自输出长度，可以调低「性能测试输出上限」；能力与格式测试的输出都很短。
- 缓存测试会发送 3 次长前缀请求，前缀规模直接决定输入费用，默认约 2400 tokens。
- 遇到 HTTP 429 时把「并发模型数」调到 1，并适当减少轮数。
- 建议先用便宜的小模型跑通全流程，确认配置无误后再测昂贵模型。`}
          />
        </div>
      </section>

      <p className="text-[13px] text-muted">
        对数据存储位置有疑问？请看 <Link to="/privacy" className="underline underline-offset-2">隐私与安全说明</Link>。
      </p>
    </div>
  )
}
