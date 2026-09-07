import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const SITE = (process.env.VITE_SITE_URL || readEnvSiteUrl() || 'https://which-llm-i-can-use.pages.dev').replace(/\/$/, '')

function readEnvSiteUrl() {
  try {
    const m = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^VITE_SITE_URL=(.+)$/m)
    return m?.[1]?.trim()
  } catch {
    return null
  }
}

/* -------------------------------------------------------------- */
/* 从测试注册表读取真实的测试项，作为 /docs 的静态可抓取内容        */
/* -------------------------------------------------------------- */

async function loadRegistry() {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    return await server.ssrLoadModule('/src/tests/index.ts')
  } finally {
    await server.close()
  }
}

const { SUITES, GROUPS, ALL_CHECKS } = await loadRegistry()

/* -------------------------------------------------------------- */
/* 路由与页面元信息                                                */
/* -------------------------------------------------------------- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ROUTES = [
  {
    path: '/',
    index: true,
    priority: '1.0',
    title: '大模型能力与性能测试台｜TTFT、token/s、工具调用与消息格式兼容性实测',
    desc: null, // 沿用 index.html 中的描述
    shell: null, // 沿用 index.html 中的首屏
  },
  {
    path: '/docs',
    index: true,
    priority: '0.9',
    title: '测试项说明与术语表｜LLM 能力与性能测试台',
    desc: `逐项说明本站 ${ALL_CHECKS.length} 个测试用例的请求构造与判定标准，并解释 TTFT、ITL、Prompt Caching、reasoning_effort、tool_choice required、JSON Schema strict 等术语的含义。`,
    shell: docsShell,
  },
  {
    path: '/privacy',
    index: true,
    priority: '0.8',
    title: '隐私与数据安全说明｜LLM 能力与性能测试台',
    desc: '本站没有后端接口，不收集任何数据。API Key、模型配置与测试结果只保存在浏览器本地存储；所有测试请求由浏览器直接发往你填写的模型服务商。',
    shell: privacyShell,
  },
  {
    path: '/models',
    index: false,
    title: '模型与服务商配置｜LLM 能力与性能测试台',
    desc: '添加 OpenAI 兼容端点与待测模型。支持 OpenAI、DeepSeek、通义千问、豆包、MiniMax、GLM、Kimi、OpenRouter、Ollama、vLLM 等预设。',
    shell: () => simpleShell('模型与服务商', '在这里添加 OpenAI 兼容端点与待测模型。配置只保存在你的浏览器本地。'),
  },
  {
    path: '/run',
    index: false,
    title: '发起测试｜LLM 能力与性能测试台',
    desc: '选择模型与测试项，由浏览器直接向各服务商发起请求，实时查看进度。',
    shell: () => simpleShell('发起测试', '选择模型与测试项后开始运行，所有请求由当前浏览器直接发出。'),
  },
  {
    path: '/results',
    index: false,
    title: '测试结果｜LLM 能力与性能测试台',
    desc: '性能指标对比、能力支持矩阵与消息格式兼容性结果，可导出 JSON 或 Markdown。',
    shell: () => simpleShell('测试结果', '查看性能对比、能力矩阵与消息格式兼容性结果。结果保存在本机。'),
  },
]

/* -------------------------------------------------------------- */
/* 静态首屏内容                                                    */
/* -------------------------------------------------------------- */

const WRAP = (inner) =>
  `<div style="max-width:820px;margin:0 auto;padding:48px 20px;font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.65;color:#10141a">${inner}<p style="color:#8d95a1;font-size:13px;margin-top:28px">正在加载应用…（需要启用 JavaScript）</p></div>`

function simpleShell(title, desc) {
  return WRAP(
    `<h1 style="font-size:28px;margin:0 0 12px">${esc(title)}</h1>` +
      `<p style="color:#5b6470;margin:0 0 20px">${esc(desc)}</p>` +
      `<p style="color:#5b6470"><a href="/">返回首页</a> · <a href="/docs">测试项说明</a> · <a href="/privacy">隐私与安全</a></p>`,
  )
}

function docsShell() {
  const parts = [
    `<h1 style="font-size:28px;margin:0 0 12px">测试项说明与术语表</h1>`,
    `<p style="color:#5b6470;margin:0 0 24px">本站共 ${ALL_CHECKS.length} 个测试用例，分属三个套件。下面列出每一项测试的名称与它实际发送的请求形态。</p>`,
  ]
  for (const suite of SUITES) {
    parts.push(`<h2 style="font-size:20px;margin:28px 0 6px">${esc(suite.title)}</h2>`)
    parts.push(`<p style="color:#5b6470;margin:0 0 12px">${esc(suite.desc)}</p>`)
    for (const group of GROUPS.filter((g) => g.suite === suite.id)) {
      const list = ALL_CHECKS.filter((c) => c.group === group.id)
      if (!list.length) continue
      parts.push(`<h3 style="font-size:16px;margin:18px 0 4px">${esc(group.title)}</h3>`)
      parts.push(`<p style="color:#8d95a1;margin:0 0 8px;font-size:14px">${esc(group.desc)}</p>`)
      parts.push('<ul style="color:#5b6470;margin:0 0 12px;padding-left:20px">')
      for (const c of list) {
        const summary = firstSentence(c.doc)
        parts.push(
          `<li style="margin-bottom:6px"><strong style="color:#10141a">${esc(c.title)}</strong>` +
            (c.subtitle ? `<span style="color:#8d95a1"> — ${esc(c.subtitle)}</span>` : '') +
            (summary ? `<br><span style="font-size:14px">${esc(summary)}</span>` : '') +
            '</li>',
        )
      }
      parts.push('</ul>')
    }
  }
  parts.push(`<p style="color:#5b6470;margin-top:24px"><a href="/">返回首页</a> · <a href="/privacy">隐私与安全说明</a></p>`)
  return WRAP(parts.join(''))
}

function privacyShell() {
  return WRAP(
    [
      '<h1 style="font-size:28px;margin:0 0 12px">隐私与数据安全</h1>',
      '<p style="color:#5b6470;margin:0 0 16px">这是一个没有服务器的工具。你的 API Key、模型配置和测试结果全部保存在这台设备的浏览器里；所有测试请求由浏览器直接发往你自己填写的模型服务商。</p>',
      '<h2 style="font-size:18px;margin:24px 0 8px">我们不做什么</h2>',
      '<ul style="color:#5b6470;margin:0;padding-left:20px">',
      '<li>没有后端接口：整站是纯静态资源，页面加载完成后浏览器与本站不再有任何请求。</li>',
      '<li>没有埋点与统计：不接入任何分析脚本、广告 SDK 或第三方追踪器，不写 Cookie。</li>',
      '<li>不经手你的密钥：API Key 只作为 Authorization 头发往你填写的模型端点。</li>',
      '<li>不上传测试结果：结果只写入本机，分享需由你主动导出。</li>',
      '</ul>',
      '<h2 style="font-size:18px;margin:24px 0 8px">本机存了什么</h2>',
      '<ul style="color:#5b6470;margin:0;padding-left:20px">',
      '<li>服务商配置（名称、Base URL、请求头、可选中转地址）——localStorage</li>',
      '<li>API Key ——可选择存 localStorage 或仅当前标签页有效的 sessionStorage</li>',
      '<li>模型列表与最近 25 次测试记录 ——localStorage</li>',
      '<li>界面设置（主题、勾选项、运行参数）——localStorage</li>',
      '</ul>',
      '<p style="color:#5b6470;margin-top:16px">页面内提供导出备份、仅清除测试记录、清空全部数据等操作。项目开源，可自行部署核对源码中的每一处网络请求。</p>',
      '<p style="color:#5b6470;margin-top:20px"><a href="/">返回首页</a> · <a href="/docs">测试项说明</a></p>',
    ].join(''),
  )
}

function firstSentence(doc) {
  const line = String(doc)
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('|') && !l.startsWith('#'))
  if (!line) return ''
  const plain = line.replace(/[`*]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  return plain.length > 160 ? `${plain.slice(0, 158)}…` : plain
}

/* -------------------------------------------------------------- */
/* 结构化数据                                                      */
/* -------------------------------------------------------------- */

const FAQ = [
  ['我的 API Key 会被上传吗？', '不会。本站是纯静态页面，没有任何后端接口。API Key 保存在浏览器的 localStorage（可切换为仅当前标签页有效的 sessionStorage），仅用于在你的浏览器里向模型服务商发起请求。'],
  ['测试结果保存在哪里？', '保存在浏览器本地，最多保留最近 25 次测试记录，可导出为 JSON 备份，导出时默认剔除 API Key。'],
  ['支持哪些模型服务商？', '任何实现 OpenAI Chat Completions 规范的端点都能接入，内置 OpenAI、DeepSeek、通义千问、豆包、MiniMax、GLM、Kimi、硅基流动、OpenRouter、Groq、xAI、Gemini 兼容层、Ollama、vLLM 等预设。'],
  ['为什么有的服务商连不上？', '浏览器直连需要目标服务返回 CORS 响应头。部分服务商只面向服务端调用，此时可自建中转地址，或改用本地部署的模型。'],
  ['多轮测试会不会命中缓存导致数据虚高？', '不会。性能测试每一轮都会在提示词最前面注入随机 run-id 破坏前缀；只有专门的缓存测试项才会复用完全相同的长前缀并单独报告命中率。'],
]

function jsonLd(route) {
  const blocks = []
  if (route.path === '/') {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: '大模型能力与性能测试台',
      alternateName: 'which-llm-i-can-use',
      url: `${SITE}/`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any (Web Browser)',
      browserRequirements: 'Requires JavaScript',
      inLanguage: 'zh-CN',
      description:
        '浏览器端的 LLM 测试台：实测 TTFT、输出 token/s、Prompt Cache 加速，验证思维链、工具调用、结构化输出、视觉理解与消息格式兼容性。数据只存本地。',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: ALL_CHECKS.map((c) => c.title),
    })
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    })
  }
  if (route.path === '/docs') {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: '大模型 API 测试项说明与术语表',
      description: route.desc,
      inLanguage: 'zh-CN',
      url: `${SITE}/docs`,
      articleSection: SUITES.map((s) => s.title),
    })
  }
  return blocks
}

/* -------------------------------------------------------------- */
/* 生成页面                                                        */
/* -------------------------------------------------------------- */

const baseHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const inlineHashes = new Set()

for (const route of ROUTES) {
  let html = baseHtml
  const url = route.path === '/' ? `${SITE}/` : `${SITE}${route.path}`

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(route.title)}</title>`)
  if (route.desc) {
    html = html.replace(
      /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
      `$1${esc(route.desc)}$2`,
    )
    html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(route.desc)}$2`)
    html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(route.desc)}$2`)
  }
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(route.title)}$2`)
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(route.title)}$2`)
  if (!route.index) {
    html = html.replace(/(<meta name="robots" content=")[^"]*(")/, '$1noindex,follow$2')
  }
  if (route.shell) {
    const before = html
    html = html.replace(/<!--seo-shell-->[\s\S]*?<!--\/seo-shell-->/, `<!--seo-shell-->${route.shell()}<!--/seo-shell-->`)
    if (html === before) throw new Error(`未能替换 ${route.path} 的静态首屏，请检查 index.html 中的 seo-shell 标记`)
  }

  const ld = jsonLd(route)
  if (ld.length) {
    const scripts = ld
      .map((b) => {
        const body = JSON.stringify(b)
        inlineHashes.add(sha256(body))
        return `<script type="application/ld+json">${body}</script>`
      })
      .join('\n    ')
    html = html.replace('</head>', `    ${scripts}\n  </head>`)
  }

  // 语言备用声明
  html = html.replace('</head>', `    <link rel="alternate" hreflang="zh-CN" href="${url}" />\n    <link rel="alternate" hreflang="x-default" href="${url}" />\n  </head>`)

  const out = route.path === '/' ? path.join(dist, 'index.html') : path.join(dist, route.path.slice(1), 'index.html')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, html)
}

// 真正的 404 页面：不加载应用，避免 soft-404（否则前端路由会渲染出概览页）
fs.writeFileSync(
  path.join(dist, '404.html'),
  `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>页面不存在｜LLM 能力与性能测试台</title>
    <meta name="robots" content="noindex,follow" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body style="margin:0;background:#f9fafb;color:#10141a;font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
    <main style="max-width:520px;margin:0 auto;padding:96px 20px;line-height:1.65">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;color:#8d95a1">404</p>
      <h1 style="margin:0 0 12px;font-size:26px">页面不存在</h1>
      <p style="margin:0 0 24px;color:#5b6470">这个地址没有对应的页面，可能是链接有误或已经变更。</p>
      <p style="margin:0;color:#5b6470">
        <a href="/" style="color:#4f46e5">返回首页</a> ·
        <a href="/docs" style="color:#4f46e5">测试项说明</a> ·
        <a href="/privacy" style="color:#4f46e5">隐私与安全</a>
      </p>
    </main>
  </body>
</html>
`,
)

function sha256(s) {
  return `sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}`
}

/* -------------------------------------------------------------- */
/* robots / sitemap / headers                                      */
/* -------------------------------------------------------------- */

const today = new Date().toISOString().slice(0, 10)
const indexed = ROUTES.filter((r) => r.index)

fs.writeFileSync(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexed
  .map(
    (r) => `  <url>
    <loc>${r.path === '/' ? `${SITE}/` : `${SITE}${r.path}`}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`,
)

fs.writeFileSync(
  path.join(dist, 'robots.txt'),
  `User-agent: *
Allow: /
Disallow: /run
Disallow: /results
Disallow: /models

Sitemap: ${SITE}/sitemap.xml
`,
)

const csp = [
  "default-src 'self'",
  `script-src 'self' ${Array.from(inlineHashes).map((h) => `'${h}'`).join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // 用户可填写任意模型端点，因此必须放开 connect-src
  'connect-src *',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

fs.writeFileSync(
  path.join(dist, '_headers'),
  `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: ${csp}

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.png
  Cache-Control: public, max-age=604800

/sitemap.xml
  Cache-Control: public, max-age=3600
`,
)

console.log(`✓ 已生成 ${ROUTES.length} 个静态页面、sitemap.xml、robots.txt、_headers、404 页面（站点地址：${SITE}）`)
