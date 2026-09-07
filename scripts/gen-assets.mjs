import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Canvas, hex } from './png.mjs'
import { drawText, textWidth } from './font.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pub = path.join(root, 'public')
fs.mkdirSync(pub, { recursive: true })

const BG = hex('#0b0d11')
const PANEL = hex('#151922')
const LINE = hex('#252c38')
const BRAND = hex('#837cff')
const OK = hex('#3dc585')
const WARN = hex('#e8a838')
const INFO = hex('#60a5fa')
const WHITE = hex('#ffffff')

/* --------------------------- Open Graph 卡片 --------------------------- */
function ogImage() {
  const c = new Canvas(1200, 630)
  c.fill(BG)

  // 网格背景
  for (let x = 0; x < 1200; x += 40) c.rect(x, 0, 1, 630, LINE, 0.35)
  for (let y = 0; y < 630; y += 40) c.rect(0, y, 1200, 1, LINE, 0.35)

  // 品牌光晕
  for (let r = 320; r > 0; r -= 4) c.circle(210, 315, r, BRAND, 0.006)

  // 左侧仪表标志
  c.roundRect(110, 215, 200, 200, 44, PANEL, 1)
  c.roundRect(110, 215, 200, 200, 44, BRAND, 0.14)
  c.ring(210, 330, 62, 12, LINE, 1, 160, 380)
  c.ring(210, 330, 62, 12, BRAND, 1, 160, 285)
  c.circle(210, 330, 9, WHITE, 0.9)
  // 指针
  for (let t = 0; t < 58; t++) {
    const a = (218 * Math.PI) / 180
    c.circle(210 + Math.cos(a) * t, 330 + Math.sin(a) * t, 3.2, WHITE, 0.9)
  }

  // 右侧文字排版
  const X = 392
  drawText(c, 'BROWSER-SIDE', X, 132, 3.4, BRAND, 0.95, 1.6)
  drawText(c, 'NO SERVER', X + textWidth('BROWSER-SIDE ', 3.4, 1.6), 132, 3.4, hex('#7b8494'), 1, 1.6)
  drawText(c, 'WHICH LLM', X, 186, 7.6, WHITE, 0.97, 1.1)
  drawText(c, 'I CAN USE', X, 262, 7.6, WHITE, 0.97, 1.1)
  drawText(c, 'LATENCY / CAPABILITY / FORMAT', X, 344, 3.2, hex('#9aa3b0'), 1, 1.4)

  // 结果条形图
  const bars = [
    { y: 400, w: 560, color: OK },
    { y: 442, w: 400, color: BRAND },
    { y: 484, w: 480, color: INFO },
    { y: 526, w: 280, color: WARN },
  ]
  for (const b of bars) {
    c.roundRect(X, b.y, 636, 26, 13, PANEL, 1)
    c.roundRect(X, b.y, b.w, 26, 13, b.color, 0.92)
  }

  fs.writeFileSync(path.join(pub, 'og.png'), c.toPNG())
}

/* ------------------------------ 应用图标 ------------------------------ */
function icon(size) {
  const c = new Canvas(size, size)
  const s = size / 192
  c.fill(BG)
  c.roundRect(0, 0, size, size, 42 * s, hex('#4f46e5'), 1)
  c.ring(size / 2, size / 2 + 10 * s, 54 * s, 12 * s, WHITE, 0.28, 160, 380)
  c.ring(size / 2, size / 2 + 10 * s, 54 * s, 12 * s, WHITE, 0.95, 160, 290)
  c.circle(size / 2, size / 2 + 10 * s, 9 * s, WHITE, 1)
  for (let t = 0; t < 48 * s; t++) {
    const a = (222 * Math.PI) / 180
    c.circle(size / 2 + Math.cos(a) * t, size / 2 + 10 * s + Math.sin(a) * t, 3.6 * s, WHITE, 1)
  }
  return c.toPNG()
}

fs.writeFileSync(path.join(pub, 'icon-192.png'), icon(192))
fs.writeFileSync(path.join(pub, 'icon-512.png'), icon(512))
ogImage()

/* ------------------------------- favicon ------------------------------ */
fs.writeFileSync(
  path.join(pub, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#4f46e5"/>
  <g fill="none" stroke="#fff" stroke-linecap="round" stroke-width="5">
    <path d="M16 40a16 16 0 1 1 32 0" opacity=".45"/>
    <path d="M16 40a16 16 0 0 1 8-13.9"/>
    <path d="m32 40 9-11"/>
  </g>
  <circle cx="32" cy="40" r="3.6" fill="#fff"/>
</svg>
`,
)

fs.writeFileSync(
  path.join(pub, 'site.webmanifest'),
  JSON.stringify(
    {
      name: '大模型能力与性能测试台',
      short_name: 'LLM 测试台',
      description: '浏览器端的 LLM 能力、性能与 API 兼容性测试工具，数据只存本地。',
      start_url: '/',
      display: 'standalone',
      background_color: '#0b0d11',
      theme_color: '#4f46e5',
      lang: 'zh-CN',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    null,
    2,
  ),
)

console.log('✓ 已生成静态资源：og.png, icon-192.png, icon-512.png, favicon.svg, site.webmanifest')
