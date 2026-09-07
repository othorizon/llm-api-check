import type { CheckDef, CheckOutcome, Evidence, VariantResult } from '../lib/types'
import { extractJson, fmtInt, sleep } from '../lib/util'
import {
  EXTRACT_TOOL, FLAT_SCHEMA, NESTED_PROMPT, NESTED_SCHEMA, TIME_TOOL, WEATHER_TOOL,
  SHORT_ANSWER_SYSTEM, nonce, makeDigitImage, validateSchema,
} from './fixtures'
import { evidence, transportFailure } from './helpers'
import { THINKING_OFF_VARIANTS } from '../lib/thinking'

const REASONING_PROMPT =
  '一个水池有两个进水管和一个出水管。A 管单独 6 小时注满，B 管单独 4 小时注满，出水管单独 12 小时排空。' +
  '三管同时打开，多久注满？只需要给出最终结果，保留两位小数。'

function reasoningAmount(res: { reasoning: string; usage?: { reasoningTokens?: number } }): number {
  return res.usage?.reasoningTokens ?? Math.round(res.reasoning.length / 2)
}

export const CAPABILITY_CHECKS: CheckDef[] = [
  /* ============================ 推理 / 思维链 ============================ */
  {
    id: 'reasoning.presence',
    suite: 'capability',
    group: 'reasoning',
    title: '思维链输出',
    subtitle: '是否返回 reasoning / thinking 内容',
    weight: 1,
    doc: `检测模型在回答前是否产生并**回传**推理过程（Chain-of-Thought / reasoning content）。

会依次探测四种常见回传通道：
- \`message.reasoning_content\`（DeepSeek、通义千问、豆包、GLM 等国内主流）
- \`message.reasoning\`（部分聚合网关）
- \`message.reasoning_details\`（OpenRouter）
- 正文里的 \`<think>…</think>\` 标签（vLLM / SGLang / Ollama 自建常见）

同时读取 \`usage.completion_tokens_details.reasoning_tokens\` 作为思考量。注意：**不回传**思维链不等于模型内部没有推理（如 OpenAI o 系列只计费不回传）。`,
    async run(ctx) {
      ctx.progress('探测思维链输出')
      const res = await ctx.chat({
        messages: [{ role: 'user', content: REASONING_PROMPT }],
        stream: true,
        maxTokens: Math.max(ctx.options.maxTokens, 600),
        temperature: ctx.options.temperature,
      })
      const fail = transportFailure(res)
      if (fail) return fail
      if (!res.ok) {
        return { status: 'error', summary: `请求失败：${res.errorMessage}`, evidence: [evidence('请求失败', res)] }
      }
      const amount = reasoningAmount(res)
      const hasText = res.reasoning.trim().length > 0
      const hasTokens = (res.usage?.reasoningTokens ?? 0) > 0
      ctx.shared.set('reasoning.detected', hasText)
      ctx.shared.set('reasoning.channel', res.reasoningChannel)
      ctx.shared.set('reasoning.baseline', amount)

      if (hasText) {
        return {
          status: 'pass',
          summary: `返回思维链（通道 ${channelLabel(res.reasoningChannel)}，约 ${fmtInt(amount)} tokens）`,
          detail: res.timing.ttfrMs != null && res.timing.ttftMs != null
            ? `首个思考 token ${Math.round(res.timing.ttfrMs)} ms，首个正文 token ${Math.round(res.timing.ttftMs)} ms —— 正文前的思考耗时约 ${Math.round(res.timing.ttftMs - res.timing.ttfrMs)} ms。`
            : undefined,
          metrics: {
            '回传通道': channelLabel(res.reasoningChannel),
            'reasoning tokens': res.usage?.reasoningTokens ?? null,
            '思维链字符数': res.reasoning.length,
          },
          evidence: [evidence('思维链探测', res)],
        }
      }
      if (hasTokens) {
        return {
          status: 'partial',
          summary: `计费包含 ${fmtInt(res.usage?.reasoningTokens)} reasoning tokens，但内容不回传`,
          detail: '模型内部进行了推理，但 API 不返回思维链文本（OpenAI o 系列 / GPT-5 系列即为此行为）。',
          metrics: { 'reasoning tokens': res.usage?.reasoningTokens ?? null, '回传通道': '不回传' },
          evidence: [evidence('思维链探测', res)],
        }
      }
      return {
        status: 'unsupported',
        summary: '未观察到思维链输出',
        detail: '响应中没有 reasoning 字段、没有 <think> 标签，usage 也没有 reasoning_tokens。',
        evidence: [evidence('思维链探测', res)],
      }
    },
  },

  {
    id: 'reasoning.effort',
    suite: 'capability',
    group: 'reasoning',
    title: 'reasoning_effort 思考等级',
    subtitle: 'low / medium / high 是否被接受且生效',
    weight: 3,
    doc: `\`reasoning_effort\` 用于控制模型的思考预算。本项对 \`low\` / \`medium\` / \`high\` 各发一次相同请求：

- **接受**：HTTP 200，说明参数没有被拒绝；
- **生效**：\`high\` 的思考量（reasoning tokens）明显高于 \`low\`（差异 > 25% 视为生效）。

很多网关只是**忽略**未知参数而不报错，因此“接受”与“生效”必须分开判断。部分厂商用别名实现同一能力，例如豆包的 \`thinking.type\`、Qwen 的 \`enable_thinking\` + \`thinking_budget\`。`,
    async run(ctx) {
      const levels = ['low', 'medium', 'high'] as const
      const variants: VariantResult[] = []
      const ev: Evidence[] = []
      const amounts: Record<string, number> = {}
      let accepted = 0

      for (const level of levels) {
        if (ctx.signal.aborted) break
        ctx.progress(`reasoning_effort = ${level}`)
        const res = await ctx.chat({
          messages: [{ role: 'user', content: REASONING_PROMPT }],
          stream: true,
          maxTokens: Math.max(ctx.options.maxTokens, 600),
          temperature: ctx.options.temperature,
          extra: { reasoning_effort: level },
        })
        const t = transportFailure(res)
        if (t && t.status === 'error' && res.networkError) return t
        if (!res.ok) {
          variants.push({ id: level, label: `reasoning_effort: "${level}"`, status: 'unsupported', note: `HTTP ${res.httpStatus} · ${short(res.errorMessage)}` })
          ev.push(evidence(`effort=${level}（被拒绝）`, res))
          continue
        }
        accepted++
        const amount = reasoningAmount(res)
        amounts[level] = amount
        variants.push({ id: level, label: `reasoning_effort: "${level}"`, status: 'pass', note: `接受 · 思考量约 ${fmtInt(amount)} tokens` })
        ev.push(evidence(`effort=${level}`, res))
        await sleep(200, ctx.signal).catch(() => {})
      }

      if (!accepted) {
        return { status: 'unsupported', summary: '不支持 reasoning_effort 参数（请求被拒绝）', variants, evidence: ev }
      }
      const low = amounts.low ?? 0
      const high = amounts.high ?? 0
      const effective = low > 0 && high > 0 && Math.abs(high - low) / Math.max(low, high) > 0.25
      return {
        status: effective ? 'pass' : 'partial',
        summary: effective
          ? `支持且生效（low ≈ ${fmtInt(low)} → high ≈ ${fmtInt(high)} tokens）`
          : `参数被接受（${accepted}/3 个等级），但未观察到思考量随等级变化`,
        detail: effective ? undefined : '有可能是网关静默忽略了该参数，或该模型的思考预算不随 effort 改变。',
        variants,
        metrics: {
          'low 思考量': amounts.low ?? null,
          'medium 思考量': amounts.medium ?? null,
          'high 思考量': amounts.high ?? null,
        },
        evidence: ev,
      }
    },
  },

  {
    id: 'reasoning.disable',
    suite: 'capability',
    group: 'reasoning',
    title: '关闭思维链的传参方式',
    subtitle: '逐一探测各厂商的关闭写法',
    weight: 6,
    requires: ['reasoning.presence'],
    doc: `业界没有统一的“关闭思考”参数，本项把主流写法逐个试一遍，帮你确定该端点到底吃哪一种：

| 写法 | 常见于 |
| --- | --- |
| \`reasoning_effort: "minimal"\` | OpenAI GPT-5 系列 |
| \`reasoning_effort: "none"\` | 部分兼容网关 |
| \`thinking: { type: "disabled" }\` | 火山方舟豆包、GLM-4.5+ |
| \`enable_thinking: false\` | 通义千问 Qwen3、硅基流动 |
| \`chat_template_kwargs: { enable_thinking: false }\` | vLLM / SGLang 自建 |
| \`reasoning: { enabled: false }\` | OpenRouter |

判定：**HTTP 200 且本次响应不再产生思维链** 记为有效；只是不报错但仍在思考，记为“接受但未生效”；返回 4xx 记为不支持。

这里探测出的有效写法，可以直接拿到运行参数里作为性能测试「关闭思维链」对比条件所用的写法。`,
    async run(ctx) {
      const detected = ctx.shared.get('reasoning.detected') === true
      if (!detected) {
        return {
          status: 'skipped',
          summary: '该模型未观察到思维链输出，跳过关闭测试',
          detail: '「思维链输出」一项未检测到 reasoning 内容，关闭参数无从验证。',
          evidence: [],
        }
      }
      const attempts = THINKING_OFF_VARIANTS
      const variants: VariantResult[] = []
      const ev: Evidence[] = []
      let works = 0
      let accepted = 0

      for (const a of attempts) {
        if (ctx.signal.aborted) break
        ctx.progress(`尝试 ${a.label}`)
        const res = await ctx.chat({
          messages: [{ role: 'user', content: REASONING_PROMPT }],
          stream: true,
          maxTokens: Math.max(ctx.options.maxTokens, 512),
          temperature: ctx.options.temperature,
          extra: a.extra,
        })
        if (res.networkError === 'cors' || res.networkError === 'timeout') {
          const t = transportFailure(res)
          if (t) return t
        }
        if (!res.ok) {
          variants.push({ id: a.id, label: a.label, status: 'unsupported', note: `HTTP ${res.httpStatus} · ${short(res.errorMessage)}` })
          ev.push(evidence(a.label, res))
          continue
        }
        accepted++
        const amount = reasoningAmount(res)
        const silenced = res.reasoning.trim().length === 0 && (res.usage?.reasoningTokens ?? 0) === 0
        if (silenced) {
          works++
          variants.push({ id: a.id, label: a.label, status: 'pass', note: '生效：本次不再输出思维链' })
        } else {
          variants.push({ id: a.id, label: a.label, status: 'partial', note: `接受但未生效：仍有约 ${fmtInt(amount)} tokens 思考` })
        }
        ev.push(evidence(a.label, res))
        await sleep(200, ctx.signal).catch(() => {})
      }

      const okOnes = variants.filter((v) => v.status === 'pass').map((v) => v.label)
      if (works > 0) {
        return {
          status: 'pass',
          summary: `可关闭思维链，有效写法：${okOnes.join('、')}`,
          variants, evidence: ev,
          metrics: { '有效写法数': works, '被接受写法数': accepted, '尝试写法数': attempts.length },
        }
      }
      if (accepted > 0) {
        return {
          status: 'partial',
          summary: `${accepted} 种写法未报错，但思维链依旧输出`,
          detail: '这类端点通常会静默忽略未知参数，实际无法关闭思考。',
          variants, evidence: ev,
        }
      }
      return { status: 'unsupported', summary: '所有关闭写法均被拒绝，无法关闭思维链', variants, evidence: ev }
    },
  },

  /* ============================ 工具调用 ============================ */
  {
    id: 'tools.basic',
    suite: 'capability',
    group: 'tools',
    title: '工具调用（Function Calling）',
    subtitle: 'tools + tool_choice: auto',
    weight: 1,
    doc: `传入一个 \`get_weather\` 工具，并提出一个必须查询天气才能回答的问题，检查模型是否返回结构合法的 \`tool_calls\`。

判定：
- **通过**：返回 \`tool_calls\`，函数名正确，\`arguments\` 是可解析的 JSON 且包含必填参数；
- **部分**：接受了 \`tools\` 参数但本次没有发起调用，或参数 JSON 不合法；
- **不支持**：请求被 4xx 拒绝。`,
    async run(ctx) {
      ctx.progress('发起工具调用')
      const res = await ctx.chat({
        messages: [
          { role: 'system', content: SHORT_ANSWER_SYSTEM },
          { role: 'user', content: '杭州现在的天气怎么样？请用工具查询。' },
        ],
        stream: false,
        tools: [WEATHER_TOOL],
        tool_choice: 'auto',
        maxTokens: ctx.options.maxTokens,
        temperature: ctx.options.temperature,
      })
      const fail = transportFailure(res)
      if (fail) return fail
      if (!res.ok) {
        ctx.shared.set('tools.supported', false)
        return { status: 'unsupported', summary: `不支持 tools 参数：${short(res.errorMessage)}`, evidence: [evidence('工具调用', res)] }
      }
      const call = res.toolCalls[0]
      if (!call) {
        ctx.shared.set('tools.supported', true)
        return {
          status: 'partial',
          summary: '接受 tools 参数，但本次未发起工具调用',
          detail: '模型直接用文本回答了问题。可尝试提高温度以外的提示强度，或该模型工具调用倾向较弱。',
          evidence: [evidence('工具调用', res)],
        }
      }
      const parsed = extractJson(call.argumentsRaw)
      const nameOk = call.name === 'get_weather'
      const argsOk = !!parsed && typeof (parsed.value as any)?.city === 'string'
      ctx.shared.set('tools.supported', true)
      ctx.shared.set('tools.firstCall', { call, res })
      if (nameOk && argsOk) {
        return {
          status: 'pass',
          summary: `正常发起工具调用 get_weather(${String((parsed!.value as any).city)})`,
          metrics: { '工具调用数': res.toolCalls.length, 'finish_reason': res.finishReason ?? '—' },
          evidence: [evidence('工具调用', res)],
        }
      }
      return {
        status: 'partial',
        summary: nameOk ? 'arguments 不是合法 JSON 或缺少必填字段' : `调用了未定义的函数 ${call.name}`,
        evidence: [evidence('工具调用', res)],
      }
    },
  },

  {
    id: 'tools.required',
    suite: 'capability',
    group: 'tools',
    title: 'tool_choice: "required" 强制调用',
    subtitle: 'LangChain 结构化输出依赖此模式',
    weight: 1,
    requires: ['tools.basic'],
    doc: `传 \`tool_choice: "required"\`，要求模型**必须**调用工具、不得直接回答。

**为什么这项很关键 —— LangChain 场景说明：**
- \`ChatOpenAI(...).with_structured_output(Schema)\` 默认走 \`method="function_calling"\`：把你的 Pydantic / JSON Schema 包成一个工具，再用 \`tool_choice\` **强制**模型调用它。
- 不同版本会发出 \`tool_choice: "required"\`、\`"any"\`，或指名 \`{"type":"function","function":{"name":"Schema"}}\`。
- \`bind_tools(tools, tool_choice="any" | "required" | "工具名")\`、以及 LangGraph 中“该节点必须先调工具”的写法，同样落到这个模式。

若本项不支持，上述用法会直接 4xx；解决办法是改用 \`method="json_mode"\` / \`method="json_schema"\`，或退回 \`tool_choice: "auto"\` 并自行校验。`,
    async run(ctx) {
      if (ctx.shared.get('tools.supported') === false) {
        return { status: 'skipped', summary: '该端点不支持 tools 参数，跳过', evidence: [] }
      }
      const variants: VariantResult[] = []
      const ev: Evidence[] = []
      const msgs = [
        { role: 'user' as const, content: '李雷，29 岁，现居成都。' },
      ]
      // 1) tool_choice: "required"
      ctx.progress('tool_choice = required')
      const r1 = await ctx.chat({
        messages: msgs, stream: false, tools: [EXTRACT_TOOL], tool_choice: 'required',
        maxTokens: ctx.options.maxTokens, temperature: ctx.options.temperature,
      })
      const fail = transportFailure(r1)
      if (fail && r1.networkError) return fail
      ev.push(evidence('tool_choice: "required"', r1))
      const r1Ok = r1.ok && r1.toolCalls.length > 0
      variants.push({
        id: 'required',
        label: 'tool_choice: "required"',
        status: r1Ok ? 'pass' : r1.ok ? 'fail' : 'unsupported',
        note: r1Ok ? `已强制调用 ${r1.toolCalls[0].name}` : r1.ok ? '未报错但没有发起工具调用' : `HTTP ${r1.httpStatus} · ${short(r1.errorMessage)}`,
      })

      // 2) tool_choice: "any"（LangChain / Anthropic 风格别名）
      await sleep(200, ctx.signal).catch(() => {})
      ctx.progress('tool_choice = any')
      const r2 = await ctx.chat({
        messages: msgs, stream: false, tools: [EXTRACT_TOOL], tool_choice: 'any',
        maxTokens: ctx.options.maxTokens, temperature: ctx.options.temperature,
      })
      ev.push(evidence('tool_choice: "any"', r2))
      const r2Ok = r2.ok && r2.toolCalls.length > 0
      variants.push({
        id: 'any',
        label: 'tool_choice: "any"（别名）',
        status: r2Ok ? 'pass' : r2.ok ? 'partial' : 'unsupported',
        note: r2Ok ? '已强制调用' : r2.ok ? '未报错但没有发起工具调用' : `HTTP ${r2.httpStatus} · ${short(r2.errorMessage)}`,
      })

      const argsValid = r1Ok ? validateSchema(extractJson(r1.toolCalls[0].argumentsRaw)?.value, EXTRACT_TOOL.function.parameters).length === 0 : false
      if (r1Ok) {
        return {
          status: argsValid ? 'pass' : 'partial',
          summary: argsValid
            ? '支持强制工具调用，且参数完全符合 schema'
            : '支持强制工具调用，但参数未完全满足 schema',
          detail: r2Ok ? '同时兼容 `tool_choice: "any"` 别名。' : '`tool_choice: "any"` 别名不被支持，使用 LangChain 时请确认它发出的是 `required`。',
          variants, evidence: ev,
        }
      }
      if (r1.ok) {
        return { status: 'fail', summary: '参数被接受但未强制调用工具（required 语义未实现）', variants, evidence: ev }
      }
      return { status: 'unsupported', summary: `不支持 tool_choice: "required"：${short(r1.errorMessage)}`, variants, evidence: ev }
    },
  },

  {
    id: 'tools.named',
    suite: 'capability',
    group: 'tools',
    title: '指定函数调用',
    subtitle: 'tool_choice: { type: "function", function: { name } }',
    weight: 1,
    requires: ['tools.basic'],
    doc: `给出两个工具，但用 \`tool_choice\` 指名必须调用其中**不相关**的那一个（问天气，却指定调用 \`get_current_time\`），以此验证端点是否真正实现了“指名调用”而不是简单忽略。`,
    async run(ctx) {
      if (ctx.shared.get('tools.supported') === false) {
        return { status: 'skipped', summary: '该端点不支持 tools 参数，跳过', evidence: [] }
      }
      ctx.progress('指名工具调用')
      const res = await ctx.chat({
        messages: [{ role: 'user', content: '杭州现在天气怎么样？' }],
        stream: false,
        tools: [WEATHER_TOOL, TIME_TOOL],
        tool_choice: { type: 'function', function: { name: 'get_current_time' } },
        maxTokens: ctx.options.maxTokens,
        temperature: ctx.options.temperature,
      })
      const fail = transportFailure(res)
      if (fail && res.networkError) return fail
      if (!res.ok) {
        return { status: 'unsupported', summary: `不支持指名调用：${short(res.errorMessage)}`, evidence: [evidence('指名调用', res)] }
      }
      const called = res.toolCalls[0]?.name
      if (called === 'get_current_time') {
        return { status: 'pass', summary: '正确调用了指名的 get_current_time', evidence: [evidence('指名调用', res)] }
      }
      if (called) {
        return { status: 'fail', summary: `忽略了指名要求，实际调用了 ${called}`, evidence: [evidence('指名调用', res)] }
      }
      return { status: 'fail', summary: '未报错但没有发起任何工具调用', evidence: [evidence('指名调用', res)] }
    },
  },

  {
    id: 'tools.parallel',
    suite: 'capability',
    group: 'tools',
    title: '并行工具调用',
    subtitle: '单条响应内返回多个 tool_calls',
    weight: 1,
    requires: ['tools.basic'],
    doc: `提出一个需要查询两个城市天气的问题，观察模型是否在**一条**助手消息里返回两个 \`tool_calls\`（Parallel Function Calling）。

不支持并行不代表不能用工具，只是需要多轮往返，时延更高。`,
    async run(ctx) {
      if (ctx.shared.get('tools.supported') === false) {
        return { status: 'skipped', summary: '该端点不支持 tools 参数，跳过', evidence: [] }
      }
      ctx.progress('并行工具调用')
      const res = await ctx.chat({
        messages: [{ role: 'user', content: '同时查一下杭州和成都现在的天气，两个城市都要查。' }],
        stream: false,
        tools: [WEATHER_TOOL],
        tool_choice: 'auto',
        maxTokens: ctx.options.maxTokens,
        temperature: ctx.options.temperature,
      })
      const fail = transportFailure(res)
      if (fail && res.networkError) return fail
      if (!res.ok) {
        return { status: 'unsupported', summary: `请求被拒绝：${short(res.errorMessage)}`, evidence: [evidence('并行调用', res)] }
      }
      const n = res.toolCalls.length
      if (n >= 2) {
        return {
          status: 'pass',
          summary: `一次返回 ${n} 个工具调用`,
          metrics: { '工具调用数': n },
          evidence: [evidence('并行调用', res)],
        }
      }
      return {
        status: n === 1 ? 'partial' : 'fail',
        summary: n === 1 ? '一次只返回 1 个工具调用（需多轮串行）' : '未发起工具调用',
        metrics: { '工具调用数': n },
        evidence: [evidence('并行调用', res)],
      }
    },
  },

  {
    id: 'tools.roundtrip',
    suite: 'capability',
    group: 'tools',
    title: '工具结果回填',
    subtitle: '完整的 tool_calls → tool → answer 闭环',
    weight: 2,
    requires: ['tools.basic'],
    doc: `把上一步拿到的 \`tool_calls\` 连同一条 \`role: "tool"\` 的结果消息一起发回去，检查模型能否基于工具返回值给出最终答案。

这是 Agent 框架最基础的一次往返；若这里失败，说明该端点对 \`tool_call_id\` 的配对或 \`role: "tool"\` 消息的处理有问题。`,
    async run(ctx) {
      if (ctx.shared.get('tools.supported') === false) {
        return { status: 'skipped', summary: '该端点不支持 tools 参数，跳过', evidence: [] }
      }
      ctx.progress('第 1 步：取得工具调用')
      const first = await ctx.chat({
        messages: [{ role: 'user', content: '杭州现在气温多少度？请用工具查询后告诉我。' }],
        stream: false, tools: [WEATHER_TOOL], tool_choice: 'auto',
        maxTokens: ctx.options.maxTokens, temperature: ctx.options.temperature,
      })
      const fail = transportFailure(first)
      if (fail && first.networkError) return fail
      if (!first.ok || !first.toolCalls.length) {
        return {
          status: 'skipped',
          summary: '模型未发起工具调用，无法测试回填',
          evidence: [evidence('第 1 步', first)],
        }
      }
      const call = first.toolCalls[0]
      const magic = String(20 + Math.floor(Math.random() * 15))
      ctx.progress('第 2 步：回填工具结果')
      const second = await ctx.chat({
        messages: [
          { role: 'user', content: '杭州现在气温多少度？请用工具查询后告诉我。' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: call.argumentsRaw || '{}' } }],
          },
          { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ city: '杭州', temperature_c: Number(magic), condition: '多云' }) },
        ],
        stream: false, tools: [WEATHER_TOOL],
        maxTokens: ctx.options.maxTokens, temperature: ctx.options.temperature,
      })
      const ev = [evidence('第 1 步：工具调用', first), evidence('第 2 步：回填结果', second)]
      if (!second.ok) {
        return { status: 'fail', summary: `回填工具结果后请求失败：${short(second.errorMessage)}`, evidence: ev }
      }
      if (second.content.includes(magic)) {
        return { status: 'pass', summary: `正确采用工具返回值（${magic}°C）生成最终回答`, evidence: ev }
      }
      return {
        status: 'partial',
        summary: '接受了 tool 消息，但最终回答未引用工具返回值',
        evidence: ev,
      }
    },
  },

  /* ============================ 结构化输出 ============================ */
  {
    id: 'structured.json_object',
    suite: 'capability',
    group: 'structured',
    title: 'JSON 模式',
    subtitle: 'response_format: { type: "json_object" }',
    weight: 1,
    doc: `最基础的结构化输出：只保证输出是**合法 JSON**，不校验字段。对应 OpenAI 的 JSON mode。

注意：OpenAI 要求提示词中出现 “JSON” 字样，本测试已包含。`,
    async run(ctx) {
      ctx.progress('json_object 模式')
      const res = await ctx.chat({
        messages: [
          { role: 'system', content: '你只输出 JSON，不要任何解释文字。' },
          { role: 'user', content: '用 JSON 输出一个人物：姓名李雷、年龄 29、城市成都。字段名用 name / age / city。' },
        ],
        stream: false,
        response_format: { type: 'json_object' },
        maxTokens: ctx.options.maxTokens,
        temperature: ctx.options.temperature,
      })
      const fail = transportFailure(res)
      if (fail && res.networkError) return fail
      if (!res.ok) {
        return { status: 'unsupported', summary: `不支持 json_object：${short(res.errorMessage)}`, evidence: [evidence('json_object', res)] }
      }
      const parsed = extractJson(res.content)
      if (!parsed) {
        return { status: 'fail', summary: '接受参数但输出不是合法 JSON', evidence: [evidence('json_object', res)] }
      }
      const clean = res.content.trim().startsWith('{')
      return {
        status: clean ? 'pass' : 'partial',
        summary: clean ? '输出为合法 JSON' : '输出可解析出 JSON，但夹带了额外文字（如 Markdown 围栏）',
        evidence: [evidence('json_object', res)],
      }
    },
  },

  {
    id: 'structured.json_schema',
    suite: 'capability',
    group: 'structured',
    title: 'JSON Schema（非严格）',
    subtitle: 'response_format: json_schema，strict 未开启',
    weight: 1,
    doc: `传入扁平 schema（name / age / city），不开启 \`strict\`。服务端通常只把 schema 作为提示，不做约束解码，因此**能解析 + 字段齐全**即算通过。`,
    async run(ctx) {
      return runSchemaCheck(ctx, {
        label: 'json_schema（非严格）',
        schema: FLAT_SCHEMA,
        strict: false,
        prompt: '李雷，29 岁，现居成都。请按 schema 输出。',
        sharedKey: 'structured.schemaOk',
      })
    },
  },

  {
    id: 'structured.json_schema_strict',
    suite: 'capability',
    group: 'structured',
    title: 'JSON Schema（strict 严格模式）',
    subtitle: 'strict: true，约束解码',
    weight: 1,
    doc: `开启 \`strict: true\`。真正实现该模式的服务会使用**约束解码（constrained decoding）**，从根本上保证输出结构一定合法。

OpenAI 的 Structured Outputs 要求：所有属性都必须出现在 \`required\` 中，且对象必须声明 \`additionalProperties: false\`。测试用的 schema 已满足这些约束，因此 4xx 基本可判定为“不支持 strict”。`,
    async run(ctx) {
      const out = await runSchemaCheck(ctx, {
        label: 'json_schema（strict）',
        schema: FLAT_SCHEMA,
        strict: true,
        prompt: '李雷，29 岁，现居成都。请按 schema 输出。',
        sharedKey: 'structured.strictOk',
      })
      return out
    },
  },

  {
    id: 'structured.json_schema_nested',
    suite: 'capability',
    group: 'structured',
    title: 'JSON Schema（嵌套结构）',
    subtitle: '嵌套对象 + 数组 + enum',
    weight: 1,
    doc: `更接近真实业务的 schema：两层嵌套对象、对象数组、\`enum\` 取值约束、\`number\` 与 \`integer\` 区分。

很多“号称支持” json_schema 的端点在扁平 schema 上没问题，一到嵌套就退化成自由文本或漏字段 —— 这一项就是用来把它们区分出来的。若前一项 strict 可用，本项也会开启 strict。`,
    async run(ctx) {
      const strict = ctx.shared.get('structured.strictOk') === true
      return runSchemaCheck(ctx, {
        label: `json_schema（嵌套${strict ? ' · strict' : ''}）`,
        schema: NESTED_SCHEMA,
        strict,
        prompt: NESTED_PROMPT,
        name: 'order',
      })
    },
  },

  /* ============================ 视觉 ============================ */
  {
    id: 'vision.image',
    suite: 'capability',
    group: 'vision',
    title: '视觉理解（图片输入）',
    subtitle: 'content 数组 + image_url(base64)',
    weight: 1,
    doc: `在浏览器本地用 canvas 现场绘制一张写有**随机两位数**的 256×256 图片，以 \`data:image/png;base64,…\` 形式通过 \`image_url\` 传入，要求模型只回答这个数字。

- 图片在你的浏览器里生成，不经过任何服务器；
- 每次数字随机，可排除模型“猜中”或命中缓存；
- 若返回 4xx 说明端点不接受多模态 content；200 但读错数字，说明该模型没有视觉能力（或未开启）。`,
    async run(ctx) {
      ctx.progress('生成测试图片')
      const { dataUrl, answer } = await makeDigitImage()
      const res = await ctx.chat({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '图中是一个两位数。只回答这个数字本身，不要任何其它文字。' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        stream: false,
        maxTokens: 64,
        temperature: 0,
      })
      const fail = transportFailure(res)
      if (fail && res.networkError) return fail
      const ev = [evidence('视觉理解', res, `图片中的正确答案：${answer}`)]
      if (!res.ok) {
        return { status: 'unsupported', summary: `不接受图片输入：${short(res.errorMessage)}`, evidence: ev }
      }
      const digits = res.content.replace(/\D+/g, ' ').trim().split(/\s+/)
      if (digits.includes(answer)) {
        return { status: 'pass', summary: `正确识别图片中的数字 ${answer}`, evidence: ev }
      }
      return {
        status: 'fail',
        summary: `接受了图片但识别错误（正确答案 ${answer}，模型回答「${short(res.content, 40)}」）`,
        detail: '端点没有拒绝多模态请求，但模型无法真正读取图像内容。',
        evidence: ev,
      }
    },
  },
]

/* ------------------------------------------------------------------ */

interface SchemaCheckArgs {
  label: string
  schema: any
  strict: boolean
  prompt: string
  name?: string
  sharedKey?: string
}

async function runSchemaCheck(ctx: Parameters<CheckDef['run']>[0], args: SchemaCheckArgs): Promise<CheckOutcome> {
  ctx.progress(args.label)
  const res = await ctx.chat({
    messages: [
      { role: 'system', content: `你只输出符合 schema 的 JSON。会话标识 ${nonce(6)}。` },
      { role: 'user', content: args.prompt },
    ],
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: { name: args.name ?? 'person', schema: args.schema, ...(args.strict ? { strict: true } : {}) },
    },
    maxTokens: Math.max(ctx.options.maxTokens, 512),
    temperature: ctx.options.temperature,
  })
  const fail = transportFailure(res)
  if (fail && res.networkError) return fail
  const ev = [evidence(args.label, res)]
  if (!res.ok) {
    if (args.sharedKey) ctx.shared.set(args.sharedKey, false)
    return { status: 'unsupported', summary: `不支持该写法：${short(res.errorMessage)}`, evidence: ev }
  }
  const parsed = extractJson(res.content)
  if (!parsed) {
    if (args.sharedKey) ctx.shared.set(args.sharedKey, false)
    return { status: 'fail', summary: '参数被接受，但输出不是合法 JSON', evidence: ev }
  }
  const errors = validateSchema(parsed.value, args.schema)
  const clean = res.content.trim().startsWith('{')
  if (!errors.length) {
    if (args.sharedKey) ctx.shared.set(args.sharedKey, true)
    return {
      status: clean ? 'pass' : 'partial',
      summary: clean ? '输出完全符合 schema' : '内容符合 schema，但夹带了额外文字',
      metrics: { '字段校验': '全部通过' },
      evidence: ev,
    }
  }
  if (args.sharedKey) ctx.shared.set(args.sharedKey, false)
  return {
    status: 'partial',
    summary: `输出是 JSON，但有 ${errors.length} 处不符合 schema`,
    detail: errors.slice(0, 6).map((e) => `· ${e}`).join('\n'),
    metrics: { '字段校验': `${errors.length} 处不符` },
    evidence: ev,
  }
}

function channelLabel(c: string | null): string {
  switch (c) {
    case 'reasoning_content': return 'message.reasoning_content'
    case 'reasoning': return 'message.reasoning'
    case 'reasoning_details': return 'message.reasoning_details'
    case 'think_tag': return '<think> 标签'
    default: return '未知'
  }
}

function short(s: string | undefined, n = 120): string {
  if (!s) return ''
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}
