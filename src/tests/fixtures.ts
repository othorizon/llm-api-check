import { nonce } from '../lib/util'

/* ------------------------------------------------------------------ */
/* 工具定义                                                            */
/* ------------------------------------------------------------------ */

export const WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: '查询指定城市当前的天气情况',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称，例如：杭州' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: '温度单位' },
      },
      required: ['city'],
    },
  },
}

export const TIME_TOOL = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description: '获取某个时区的当前时间',
    parameters: {
      type: 'object',
      properties: { timezone: { type: 'string', description: 'IANA 时区名，例如 Asia/Shanghai' } },
      required: ['timezone'],
    },
  },
}

/** 用于 tool_choice=required 的“抽取型”工具，模拟 LangChain 结构化输出 */
export const EXTRACT_TOOL = {
  type: 'function',
  function: {
    name: 'record_person',
    description: '把用户描述中的人物信息记录下来',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '姓名' },
        age: { type: 'integer', description: '年龄' },
        city: { type: 'string', description: '所在城市' },
      },
      required: ['name', 'age', 'city'],
      additionalProperties: false,
    },
  },
}

/* ------------------------------------------------------------------ */
/* JSON Schema                                                         */
/* ------------------------------------------------------------------ */

export const FLAT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
    city: { type: 'string' },
  },
  required: ['name', 'age', 'city'],
  additionalProperties: false,
}

export const NESTED_SCHEMA = {
  type: 'object',
  properties: {
    order_id: { type: 'string' },
    customer: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        contact: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          required: ['email', 'phone'],
          additionalProperties: false,
        },
      },
      required: ['name', 'contact'],
      additionalProperties: false,
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          qty: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'shipped', 'cancelled'] },
        },
        required: ['sku', 'qty', 'status'],
        additionalProperties: false,
      },
    },
    total: { type: 'number' },
  },
  required: ['order_id', 'customer', 'items', 'total'],
  additionalProperties: false,
}

export const NESTED_PROMPT =
  '请把下面这段话整理成结构化订单数据：订单 A-10086，客户张伟，邮箱 zhangwei@example.com，电话 13800000000；' +
  '购买了 SKU-1（2 件，已发货）和 SKU-7（1 件，待发货）；总金额 358.5 元。'

/* ------------------------------------------------------------------ */
/* 轻量 JSON Schema 校验（覆盖测试用到的子集）                          */
/* ------------------------------------------------------------------ */

export function validateSchema(value: unknown, schema: any, path = '$'): string[] {
  const errs: string[] = []
  if (!schema || typeof schema !== 'object') return errs
  const t = schema.type
  if (t === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return [`${path} 期望 object，实际 ${describe(value)}`]
    }
    const obj = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errs.push(`${path}.${key} 缺失（required）`)
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}))
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) errs.push(`${path}.${key} 是多余字段（additionalProperties:false）`)
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj) errs.push(...validateSchema(obj[key], sub, `${path}.${key}`))
    }
    return errs
  }
  if (t === 'array') {
    if (!Array.isArray(value)) return [`${path} 期望 array，实际 ${describe(value)}`]
    value.forEach((v, i) => errs.push(...validateSchema(v, schema.items, `${path}[${i}]`)))
    return errs
  }
  if (t === 'string') {
    if (typeof value !== 'string') errs.push(`${path} 期望 string，实际 ${describe(value)}`)
    else if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errs.push(`${path} 取值 "${value}" 不在 enum ${JSON.stringify(schema.enum)} 内`)
    }
    return errs
  }
  if (t === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) errs.push(`${path} 期望 integer，实际 ${describe(value)}`)
    return errs
  }
  if (t === 'number') {
    if (typeof value !== 'number') errs.push(`${path} 期望 number，实际 ${describe(value)}`)
    return errs
  }
  if (t === 'boolean') {
    if (typeof value !== 'boolean') errs.push(`${path} 期望 boolean，实际 ${describe(value)}`)
    return errs
  }
  return errs
}

function describe(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/* ------------------------------------------------------------------ */
/* 视觉测试图片（浏览器端 canvas 现场生成，不加载外部资源）              */
/* ------------------------------------------------------------------ */

export async function makeDigitImage(): Promise<{ dataUrl: string; answer: string }> {
  const answer = String(10 + Math.floor(Math.random() * 90))
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 canvas，无法生成视觉测试图片')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#111111'
  ctx.font = 'bold 150px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(answer, size / 2, size / 2 + 6)
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, size - 8, size - 8)
  return { dataUrl: canvas.toDataURL('image/png'), answer }
}

/* ------------------------------------------------------------------ */
/* 长前缀（用于 Prompt Cache 测试，必须逐字节稳定）                      */
/* ------------------------------------------------------------------ */

const WORDS = [
  'system', 'policy', 'document', 'section', 'clause', 'revision', 'baseline', 'operator',
  'threshold', 'latency', 'capacity', 'schedule', 'inventory', 'compliance', 'reference',
  'parameter', 'workflow', 'checkpoint', 'validation', 'deployment', 'aggregate', 'namespace',
]

/** 用线性同余伪随机数生成确定性文本，保证多次调用完全一致 */
export function stablePrefix(approxTokens: number): string {
  let seed = 20240917
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const targetWords = Math.max(64, Math.round(approxTokens * 0.78))
  const out: string[] = ['INTERNAL OPERATIONS HANDBOOK — REFERENCE COPY (do not summarise).']
  let sentence: string[] = []
  for (let i = 0; i < targetWords; i++) {
    sentence.push(WORDS[Math.floor(rand() * WORDS.length)])
    if (sentence.length >= 12) {
      out.push(`Clause ${out.length}: ${sentence.join(' ')}.`)
      sentence = []
    }
  }
  if (sentence.length) out.push(`Clause ${out.length}: ${sentence.join(' ')}.`)
  return out.join('\n')
}

/* ------------------------------------------------------------------ */
/* 性能测试提示词                                                      */
/* ------------------------------------------------------------------ */

const PERF_TOPICS = [
  '城市地铁的早高峰调度', '家庭厨房的收纳方法', '海边小镇的清晨', '如何挑选一双跑鞋',
  '雨季的屋顶维护', '图书馆的选址考量', '露营时的饮水处理', '老照片的数字化整理',
  '社区花园的轮作安排', '长途骑行的补给策略', '手冲咖啡的水温控制', '旧木家具的翻新',
]

export interface PerfPrompt {
  system: string
  user: string
  tag: string
}

/** 每轮都在提示词最前面注入随机标识，确保前缀缓存无法命中 */
export function perfPrompt(round: number, randomize: boolean): PerfPrompt {
  const tag = randomize ? nonce(12) : 'FIXEDRUN0000'
  const topic = PERF_TOPICS[(randomize ? Math.floor(Math.random() * PERF_TOPICS.length) : 0) % PERF_TOPICS.length]
  return {
    tag,
    system: `[run-id ${tag}-${round}] 你是一名写作助手，请直接输出正文，不要寒暄、不要使用列表或标题。`,
    user: `[run-id ${tag}-${round}] 请写一段关于「${topic}」的说明文字，约 200 字，一段话写完。`,
  }
}

export const SHORT_ANSWER_SYSTEM = '你是一个严格遵循指令的助手，回答尽量简短。'

export { nonce }
