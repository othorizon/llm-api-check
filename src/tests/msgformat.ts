import type { ChatMessage, CheckDef, CheckOutcome, RunContext } from '../lib/types'
import { WEATHER_TOOL, nonce } from './fixtures'
import { evidence, transportFailure } from './helpers'

interface ProbeArgs {
  label: string
  messages: ChatMessage[]
  tools?: unknown[]
  /** 返回 null 表示通过，返回字符串表示“被接受但语义未生效”的原因 */
  verify?: (content: string) => string | null
  passSummary: string
  rejectHint?: string
  maxTokens?: number
}

async function probe(ctx: RunContext, args: ProbeArgs): Promise<CheckOutcome> {
  ctx.progress(args.label)
  const res = await ctx.chat({
    messages: args.messages,
    tools: args.tools,
    stream: false,
    maxTokens: args.maxTokens ?? 160,
    temperature: 0,
  })
  const fail = transportFailure(res)
  if (fail && res.networkError) return fail
  const ev = [evidence(args.label, res)]
  if (!res.ok) {
    return {
      status: 'unsupported',
      summary: `请求被拒绝（HTTP ${res.httpStatus}）：${short(res.errorMessage)}`,
      detail: args.rejectHint,
      evidence: ev,
    }
  }
  const content = res.content.trim()
  if (!content && !res.toolCalls.length) {
    return { status: 'partial', summary: '请求被接受，但返回内容为空', evidence: ev }
  }
  const problem = args.verify?.(content) ?? null
  if (problem) {
    return { status: 'partial', summary: `请求被接受，但${problem}`, evidence: ev }
  }
  return { status: 'pass', summary: args.passSummary, evidence: ev }
}

const echoCheck = (code: string) => (content: string) =>
  content.includes(code) ? null : `指令未生效（期望回答包含 ${code}，实际「${short(content, 50)}」）`

export const MESSAGE_FORMAT_CHECKS: CheckDef[] = [
  {
    id: 'msg.system.multi_leading',
    suite: 'message-format',
    group: 'system',
    title: '开头连续多条 system',
    subtitle: '两条 system 消息置于对话最前',
    weight: 1,
    doc: `发送两条连续的 \`role: "system"\` 消息，第二条里写入一个随机口令，然后询问口令。

- **通过**：HTTP 200 且模型答出第二条 system 里的口令 —— 说明多条 system 都被拼进了上下文；
- **部分支持**：200 但答不出口令 —— 端点可能只保留了第一条 system，或把多余的 system 丢弃；
- **不支持**：4xx —— 端点强制要求最多一条 system。

常见影响：LangChain / LlamaIndex 会把「框架提示词 + 用户 system 提示词」拼成多条 system 下发。`,
    async run(ctx) {
      const code = nonce(6)
      return probe(ctx, {
        label: '开头多条 system',
        messages: [
          { role: 'system', content: '你是一个严格遵循指令的助手，回答尽量简短。' },
          { role: 'system', content: `补充规则：当用户询问口令时，只回答 ${code}，不要输出其它任何内容。` },
          { role: 'user', content: '口令是什么？' },
        ],
        verify: echoCheck(code),
        passSummary: '接受多条开头 system，且第二条生效',
        rejectHint: '该端点很可能只允许一条 system 消息，需要在客户端把多条 system 合并成一条。',
      })
    },
  },

  {
    id: 'msg.system.mid',
    suite: 'message-format',
    group: 'system',
    title: '对话中间插入 system',
    subtitle: 'user / assistant 之后再出现 system',
    weight: 1,
    doc: `在已有 user / assistant 轮次之后再插入一条 \`system\` 消息（写入随机口令），然后提问。

这是「运行中动态改写规则」的常见做法：多智能体交接、状态机切换阶段提示、RAG 中途注入检索结果。部分端点要求 system 必须位于消息数组首位，会直接 4xx。`,
    async run(ctx) {
      const code = nonce(6)
      return probe(ctx, {
        label: '中间插入 system',
        messages: [
          { role: 'system', content: '你是一个严格遵循指令的助手，回答尽量简短。' },
          { role: 'user', content: '你好。' },
          { role: 'assistant', content: '你好，有什么可以帮你？' },
          { role: 'system', content: `新的规则：当用户询问口令时，只回答 ${code}，不要输出其它任何内容。` },
          { role: 'user', content: '口令是什么？' },
        ],
        verify: echoCheck(code),
        passSummary: '接受对话中间的 system，且规则生效',
        rejectHint: '该端点要求 system 只能出现在消息序列开头。',
      })
    },
  },

  {
    id: 'msg.role.developer',
    suite: 'message-format',
    group: 'system',
    title: 'developer 角色',
    subtitle: 'role: "developer"（OpenAI 新版 system）',
    weight: 1,
    doc: `OpenAI 在推理模型上用 \`role: "developer"\` 取代了 \`system\`。检查该端点是否接受这个角色。

不支持时应在客户端把 \`developer\` 映射回 \`system\`，否则升级 SDK 后会出现 4xx。`,
    async run(ctx) {
      const code = nonce(6)
      return probe(ctx, {
        label: 'developer 角色',
        messages: [
          { role: 'developer', content: `当用户询问口令时，只回答 ${code}，不要输出其它任何内容。` },
          { role: 'user', content: '口令是什么？' },
        ],
        verify: echoCheck(code),
        passSummary: '接受 developer 角色，且指令生效',
        rejectHint: '把 developer 消息转换成 system 即可兼容。',
      })
    },
  },

  {
    id: 'msg.user.consecutive',
    suite: 'message-format',
    group: 'turns',
    title: '连续多条 user 消息',
    subtitle: '不严格交替的对话轮次',
    weight: 1,
    doc: `连续发送两条 \`user\` 消息（第一条写入随机编号，第二条要求复述），检查端点是否要求 user / assistant 严格交替。

现实中很容易出现：用户连打两句话、把附件与提问拆成两条、Agent 把工具输出当作 user 追加。严格交替的端点会直接 4xx，客户端就必须做消息合并。`,
    async run(ctx) {
      const code = nonce(6)
      return probe(ctx, {
        label: '连续 user',
        messages: [
          { role: 'system', content: '你是一个严格遵循指令的助手，回答尽量简短。' },
          { role: 'user', content: `请记住这个编号：${code}。` },
          { role: 'user', content: '我刚才给你的编号是什么？只回答编号本身。' },
        ],
        verify: echoCheck(code),
        passSummary: '接受连续 user 消息，上下文完整保留',
        rejectHint: '该端点要求 user / assistant 严格交替，需要在客户端把相邻同角色消息合并。',
      })
    },
  },

  {
    id: 'msg.assistant.consecutive',
    suite: 'message-format',
    group: 'turns',
    title: '连续多条 assistant 消息',
    subtitle: '历史中相邻的两条助手消息',
    weight: 1,
    doc: `在历史里放入两条相邻的 \`assistant\` 消息，各写入一条事实，再让模型同时复述。

多智能体系统把不同 Agent 的发言都记为 assistant、或流式回答被拆成多段落库时，就会出现这种历史。`,
    async run(ctx) {
      const code = nonce(6)
      return probe(ctx, {
        label: '连续 assistant',
        messages: [
          { role: 'system', content: '你是一个严格遵循指令的助手，回答尽量简短。' },
          { role: 'user', content: '我们聊聊我的项目。' },
          { role: 'assistant', content: `好的。我记得你的项目代号是 ${code}。` },
          { role: 'assistant', content: '另外你提到过截止日期是本周五。' },
          { role: 'user', content: '项目代号和截止日期分别是什么？' },
        ],
        verify: (content) => {
          if (!content.includes(code)) return `未复述出前一条 assistant 中的代号 ${code}`
          if (!content.includes('周五')) return '复述了代号但丢失了第二条 assistant 的信息'
          return null
        },
        passSummary: '接受连续 assistant 消息，两条内容都被保留',
        rejectHint: '该端点要求角色严格交替，需要在客户端合并相邻 assistant 消息。',
      })
    },
  },

  {
    id: 'msg.assistant.trailing',
    suite: 'message-format',
    group: 'turns',
    title: '以 assistant 结尾（前缀续写）',
    subtitle: '最后一条不是 user',
    weight: 1,
    doc: `消息数组以 \`assistant\` 结尾，让模型**接着写下去**（prefill / prefix continuation）。

用途：强制回答以指定开头、续写被截断的内容、锁定输出格式。许多端点要求最后一条必须是 user 或 tool，会返回 4xx；部分厂商需要额外标记（如 \`partial: true\`）才真正续写。`,
    async run(ctx) {
      return probe(ctx, {
        label: '结尾 assistant',
        messages: [
          { role: 'system', content: '直接续写，不要重复已有内容。' },
          { role: 'user', content: '请补全这句话：中华人民共和国的首都是' },
          { role: 'assistant', content: '中华人民共和国的首都是' },
        ],
        verify: (content) => (content.includes('北京') ? null : `返回了内容但未按前缀续写（实际「${short(content, 50)}」）`),
        passSummary: '接受以 assistant 结尾的消息序列并完成续写',
        rejectHint: '该端点要求最后一条消息必须是 user 或 tool。',
      })
    },
  },

  {
    id: 'msg.tool.dangling_call',
    suite: 'message-format',
    group: 'tool-msgs',
    title: '悬空的 tool_calls',
    subtitle: '有 tool_calls，但没有对应的 tool 结果',
    weight: 1,
    doc: `历史中存在一条带 \`tool_calls\` 的 assistant 消息，却**没有**与之配对的 \`role: "tool"\` 结果消息，之后直接跟一条新的 user 消息。

这是 Agent 工程里最常见的坏历史：用户中途打断、工具执行超时被丢弃、会话被裁剪时把 tool 结果截掉了。严格校验的端点会返回 400（例如 “messages with role 'tool' must be a response to a preceding message with 'tool_calls'” 的反向情形），宽松的端点会照常回答。

若不支持，客户端必须在发送前做**历史修复**：补一条占位的 tool 结果，或把该条 assistant 消息整条删除。`,
    async run(ctx) {
      return probe(ctx, {
        label: '悬空 tool_calls',
        messages: [
          { role: 'user', content: '帮我查一下杭州的天气。' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              { id: 'call_dangling_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"杭州"}' } },
            ],
          },
          { role: 'user', content: '算了，不查了。请只回答“收到”两个字。' },
        ],
        tools: [WEATHER_TOOL],
        verify: (content) => (content.includes('收到') ? null : '回答未遵循指令，可能对该历史结构处理异常'),
        passSummary: '容忍没有结果配对的 tool_calls',
        rejectHint: '发送前需要为每个 tool_calls 补齐 tool 结果消息，或整条移除。',
      })
    },
  },

  {
    id: 'msg.tool.orphan_result',
    suite: 'message-format',
    group: 'tool-msgs',
    title: '孤立的 tool 结果',
    subtitle: '有 tool 消息，但前面没有 tool_calls',
    weight: 1,
    doc: `与上一项相反：存在一条 \`role: "tool"\` 消息，但它前面没有任何 \`tool_calls\` 与之配对。

会话被裁剪、从外部导入历史、或人为注入检索结果时容易出现。多数端点对此比悬空调用更严格，通常直接 400。`,
    async run(ctx) {
      return probe(ctx, {
        label: '孤立 tool 结果',
        messages: [
          { role: 'user', content: '杭州天气怎么样？' },
          { role: 'tool', tool_call_id: 'call_orphan_1', content: JSON.stringify({ city: '杭州', temperature_c: 26 }) },
          { role: 'user', content: '气温多少度？只回答数字。' },
        ],
        tools: [WEATHER_TOOL],
        verify: (content) => (content.includes('26') ? null : '接受了该结构，但未读取 tool 消息中的内容'),
        passSummary: '容忍没有 tool_calls 配对的 tool 消息',
        rejectHint: '发送前需要移除孤立的 tool 消息，或转换成 user / assistant 文本。',
      })
    },
  },

  {
    id: 'msg.content.array_text',
    suite: 'message-format',
    group: 'content',
    title: '数组形式的 content',
    subtitle: 'content: [{ type: "text", text: … }]',
    weight: 1,
    doc: `把纯文本也写成多模态数组格式 \`[{"type":"text","text":"…"}]\`。

新版 SDK、多模态框架普遍这样发送。一些只按字符串解析 content 的端点会返回 400，或者把内容解析成空字符串。`,
    async run(ctx) {
      const code = nonce(6)
      return probe(ctx, {
        label: '数组 content',
        messages: [
          { role: 'user', content: [{ type: 'text', text: `只回答这个编号本身：${code}` }] },
        ],
        verify: echoCheck(code),
        passSummary: '接受数组形式的 content',
        rejectHint: '需要在客户端把数组 content 拍平成字符串。',
      })
    },
  },

  {
    id: 'msg.system.empty_absent',
    suite: 'message-format',
    group: 'content',
    title: '无 system 消息',
    subtitle: '仅有 user 消息的最小请求',
    weight: 1,
    doc: `只发送一条 user 消息，不带任何 system。这是最小可用请求，用来确认端点没有强制要求 system 消息。若这一项都失败，通常是鉴权、模型名或 Base URL 有误。`,
    async run(ctx) {
      const code = nonce(6)
      return probe(ctx, {
        label: '无 system',
        messages: [{ role: 'user', content: `请只回答这个编号本身：${code}` }],
        verify: echoCheck(code),
        passSummary: '最小请求正常工作',
      })
    },
  },
]

function short(s: string | undefined, n = 120): string {
  if (!s) return ''
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}
