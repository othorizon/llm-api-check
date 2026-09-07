/**
 * 本地 Mock 的 OpenAI 兼容服务，用于开发调试测试台本身（不参与线上构建）。
 *
 *   node dev/mock-llm-server.mjs [port]
 *
 * 提供几个行为各异的模型：
 *   mock-basic      普通模型：无思维链，支持工具与 json_schema
 *   mock-reasoner   推理模型：返回 reasoning_content，支持 reasoning_effort 与 enable_thinking:false
 *   mock-strict     严格端点：拒绝多条 system / 非交替轮次 / 残缺 tool 消息 / json_schema strict
 *   mock-slow       慢速模型：首 token 与吐字都很慢，用于验证语音评级
 */
import http from 'node:http'

const port = Number(process.argv[2] || 8787)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const MODELS = ['mock-basic', 'mock-reasoner', 'mock-strict', 'mock-slow']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rand = (a, b) => a + Math.random() * (b - a)

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return end(res, 204, {}, '')

  const url = new URL(req.url, `http://localhost:${port}`)
  if (url.pathname.endsWith('/models')) {
    return end(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify({
      object: 'list',
      data: MODELS.map((id) => ({ id, object: 'model', owned_by: 'mock' })),
    }))
  }
  if (!url.pathname.endsWith('/chat/completions')) return end(res, 404, {}, 'not found')

  const body = JSON.parse(await readBody(req))
  const model = String(body.model || 'mock-basic')
  const strict = model === 'mock-strict'
  const slow = model === 'mock-slow'
  const reasoner = model === 'mock-reasoner'

  const bad = validate(body, { strict, reasoner })
  if (bad) return end(res, 400, { 'Content-Type': 'application/json' }, JSON.stringify({ error: { message: bad, type: 'invalid_request_error' } }))

  const plan = respond(body, { strict, reasoner })
  const promptTokens = estimate(JSON.stringify(body.messages))
  const cached = shouldCache(body) ? Math.floor(promptTokens * 0.8) : 0

  if (body.stream) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const id = `chatcmpl-${Math.random().toString(36).slice(2)}`
    const send = (delta, extra = {}) =>
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`)

    await sleep(cached ? rand(40, 90) : slow ? rand(1400, 2200) : rand(120, 300))
    send({ role: 'assistant', content: '' })

    if (plan.reasoning) {
      for (const piece of chunks(plan.reasoning, 12)) {
        send({ reasoning_content: piece })
        await sleep(slow ? rand(60, 110) : rand(8, 22))
      }
    }
    if (plan.toolCalls) {
      send({ tool_calls: plan.toolCalls.map((t, i) => ({ index: i, id: t.id, type: 'function', function: { name: t.name, arguments: '' } })) })
      for (let i = 0; i < plan.toolCalls.length; i++) {
        for (const piece of chunks(plan.toolCalls[i].args, 16)) {
          send({ tool_calls: [{ index: i, function: { arguments: piece } }] })
          await sleep(rand(5, 15))
        }
      }
    }
    for (const piece of chunks(plan.content, 6)) {
      send({ content: piece })
      await sleep(slow ? rand(70, 130) : rand(10, 26))
    }
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: plan.toolCalls ? 'tool_calls' : 'stop' }] })}\n\n`)
    if (body.stream_options?.include_usage) {
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [], usage: usage(promptTokens, plan, cached) })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  await sleep(cached ? rand(60, 120) : slow ? rand(2200, 3200) : rand(300, 700))
  end(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify({
    id: `chatcmpl-${Math.random().toString(36).slice(2)}`,
    object: 'chat.completion',
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: plan.content,
        ...(plan.reasoning ? { reasoning_content: plan.reasoning } : {}),
        ...(plan.toolCalls ? { tool_calls: plan.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })) } : {}),
      },
      finish_reason: plan.toolCalls ? 'tool_calls' : 'stop',
    }],
    usage: usage(promptTokens, plan, cached),
  }))
})

/* ----------------------------- 行为实现 ----------------------------- */

function validate(body, { strict, reasoner }) {
  const msgs = body.messages ?? []
  if (!msgs.length) return 'messages 不能为空'
  if (!reasoner && body.reasoning_effort) return `Unsupported parameter: 'reasoning_effort' is not supported with this model.`
  if (body.thinking && !reasoner) return `Unsupported parameter: 'thinking'.`
  if (strict) {
    const roles = msgs.map((m) => m.role)
    if (roles.filter((r) => r === 'system').length > 1) return 'Only one system message is allowed.'
    if (roles.indexOf('system') > 0) return 'system message must be the first message.'
    if (roles.includes('developer')) return `Invalid value for 'role': 'developer'.`
    for (let i = 1; i < roles.length; i++) {
      if (roles[i] === roles[i - 1] && (roles[i] === 'user' || roles[i] === 'assistant')) {
        return 'Roles must alternate between user and assistant.'
      }
    }
    if (roles[roles.length - 1] === 'assistant') return 'The last message must be from user or tool.'
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role === 'tool') {
        const prev = msgs[i - 1]
        if (!prev?.tool_calls?.length) return `Messages with role 'tool' must be a response to a preceding message with 'tool_calls'.`
      }
      if (msgs[i].tool_calls?.length) {
        const next = msgs[i + 1]
        if (next?.role !== 'tool') return `An assistant message with 'tool_calls' must be followed by tool messages.`
      }
    }
    if (body.response_format?.json_schema?.strict) return `'strict' is not supported for response_format.json_schema.`
  }
  return null
}

function respond(body, { strict, reasoner }) {
  const msgs = body.messages ?? []
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
  const text = flatten(lastUser?.content)
  const systemText = msgs.filter((m) => m.role === 'system' || m.role === 'developer').map((m) => flatten(m.content)).join('\n')
  const history = msgs.map((m) => flatten(m.content)).join('\n')

  const thinkingOff =
    body.enable_thinking === false ||
    body.thinking?.type === 'disabled' ||
    body.reasoning_effort === 'minimal' ||
    body.chat_template_kwargs?.enable_thinking === false
  const effort = body.reasoning_effort ?? 'medium'
  const reasoning = reasoner && !thinkingOff
    ? '让我想想。'.repeat({ low: 4, medium: 14, high: 40 }[effort] ?? 14)
    : ''

  // 工具结果回填
  const toolMsg = msgs.find((m) => m.role === 'tool')
  if (toolMsg) {
    const t = flatten(toolMsg.content)
    const m = t.match(/"temperature_c"\s*:\s*(\d+)/)
    if (m) return { content: `杭州现在 ${m[1]} 摄氏度，多云。`, reasoning }
    if (/26/.test(t)) return { content: '26', reasoning }
  }

  // 工具调用
  if (body.tools?.length) {
    const forced = body.tool_choice === 'required' || body.tool_choice === 'any' || typeof body.tool_choice === 'object'
    const named = typeof body.tool_choice === 'object' ? body.tool_choice.function?.name : null
    const wantsWeather = /天气|气温/.test(text)
    if (forced || wantsWeather) {
      const toolNames = body.tools.map((t) => t.function?.name)
      const name = named ?? (wantsWeather && toolNames.includes('get_weather') ? 'get_weather' : toolNames[0])
      const parallel = /同时|两个城市|杭州和成都/.test(text) && name === 'get_weather' && !strict
      const args = name === 'get_weather' ? '{"city":"杭州","unit":"celsius"}'
        : name === 'get_current_time' ? '{"timezone":"Asia/Shanghai"}'
          : '{"name":"李雷","age":29,"city":"成都"}'
      const calls = [{ id: 'call_mock_1', name, args }]
      if (parallel) calls.push({ id: 'call_mock_2', name, args: '{"city":"成都","unit":"celsius"}' })
      return { content: '', reasoning, toolCalls: calls }
    }
  }

  // 结构化输出
  const rf = body.response_format
  if (rf?.type === 'json_schema') {
    const props = Object.keys(rf.json_schema?.schema?.properties ?? {})
    if (props.includes('order_id')) {
      return {
        content: JSON.stringify({
          order_id: 'A-10086',
          customer: { name: '张伟', contact: { email: 'zhangwei@example.com', phone: '13800000000' } },
          items: [
            { sku: 'SKU-1', qty: 2, status: 'shipped' },
            { sku: 'SKU-7', qty: 1, status: 'pending' },
          ],
          total: 358.5,
        }),
        reasoning,
      }
    }
    return { content: JSON.stringify({ name: '李雷', age: 29, city: '成都' }), reasoning }
  }
  if (rf?.type === 'json_object') {
    return { content: JSON.stringify({ name: '李雷', age: 29, city: '成都' }), reasoning }
  }

  // 视觉
  if (Array.isArray(lastUser?.content) && lastUser.content.some((p) => p.type === 'image_url')) {
    return { content: '42', reasoning }
  }

  // 指令跟随：复述口令 / 编号
  const codes = [...`${systemText}\n${history}`.matchAll(/\b([A-Z0-9]{6})\b/g)].map((m) => m[1])
  if (codes.length && /口令|编号/.test(text)) {
    const wanted = codes[codes.length - 1]
    return { content: strict ? wanted : codes.join(' '), reasoning }
  }
  if (/代号和截止日期/.test(text)) {
    const code = codes[0] ?? 'UNKNOWN'
    return { content: `项目代号是 ${code}，截止日期是本周五。`, reasoning }
  }
  if (/补全这句话|续写/.test(text) || msgs[msgs.length - 1]?.role === 'assistant') {
    return { content: '北京。', reasoning }
  }
  if (/收到/.test(text)) return { content: '收到', reasoning }
  if (/第一个英文单词/.test(text)) return { content: 'INTERNAL', reasoning }
  if (codes.length) return { content: codes[codes.length - 1], reasoning }

  const n = Math.max(40, Math.min(400, body.max_tokens ?? body.max_completion_tokens ?? 200))
  return { content: `这是一段用于性能测试的模拟输出。${'内容填充。'.repeat(Math.ceil(n / 12))}`.slice(0, n * 2), reasoning }
}

function shouldCache(body) {
  const first = body.messages?.[0]
  return typeof first?.content === 'string' && first.content.includes('INTERNAL OPERATIONS HANDBOOK')
}

function usage(promptTokens, plan, cached) {
  const completion = estimate(plan.content) + estimate(plan.reasoning)
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completion,
    total_tokens: promptTokens + completion,
    prompt_tokens_details: { cached_tokens: cached },
    ...(plan.reasoning ? { completion_tokens_details: { reasoning_tokens: estimate(plan.reasoning) } } : {}),
  }
}

/* ------------------------------- 工具 ------------------------------- */

const flatten = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p?.text ?? '').join('') : '')
const estimate = (s) => Math.max(1, Math.round((s || '').length / 2))
function* chunks(s, size) {
  for (let i = 0; i < (s || '').length; i += size) yield s.slice(i, i + size)
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => resolve(b || '{}'))
    req.on('error', reject)
  })
}
function end(res, status, headers, body) {
  res.writeHead(status, { ...CORS, ...headers })
  res.end(body)
}

server.listen(port, () => {
  console.log(`Mock OpenAI 兼容服务已启动：http://localhost:${port}/v1`)
  console.log(`可用模型：${MODELS.join(', ')}`)
})
