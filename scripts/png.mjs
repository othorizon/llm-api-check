import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** 简单的 RGBA 画布 */
export class Canvas {
  constructor(width, height) {
    this.w = width
    this.h = height
    this.data = new Uint8Array(width * height * 4)
  }

  set(x, y, [r, g, b], a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return
    const i = (y * this.w + x) * 4
    const d = this.data
    const na = Math.min(1, a)
    d[i] = Math.round(d[i] * (1 - na) + r * na)
    d[i + 1] = Math.round(d[i + 1] * (1 - na) + g * na)
    d[i + 2] = Math.round(d[i + 2] * (1 - na) + b * na)
    d[i + 3] = Math.round(Math.min(255, d[i + 3] + 255 * na))
  }

  fill(color) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, color, 1)
  }

  rect(x0, y0, w, h, color, a = 1) {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.w, x0 + w); x++) this.set(x, y, color, a)
    }
  }

  /** 抗锯齿圆角矩形 */
  roundRect(x0, y0, w, h, r, color, a = 1) {
    for (let y = Math.floor(y0) - 1; y < y0 + h + 1; y++) {
      for (let x = Math.floor(x0) - 1; x < x0 + w + 1; x++) {
        const d = roundRectDistance(x + 0.5, y + 0.5, x0, y0, w, h, r)
        const cov = coverage(d)
        if (cov > 0) this.set(x, y, color, a * cov)
      }
    }
  }

  circle(cx, cy, radius, color, a = 1) {
    for (let y = Math.floor(cy - radius) - 1; y <= cy + radius + 1; y++) {
      for (let x = Math.floor(cx - radius) - 1; x <= cx + radius + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius
        const cov = coverage(d)
        if (cov > 0) this.set(x, y, color, a * cov)
      }
    }
  }

  ring(cx, cy, radius, thickness, color, a = 1, fromDeg = 0, toDeg = 360) {
    const from = (fromDeg * Math.PI) / 180
    const to = (toDeg * Math.PI) / 180
    for (let y = Math.floor(cy - radius - thickness) - 1; y <= cy + radius + thickness + 1; y++) {
      for (let x = Math.floor(cx - radius - thickness) - 1; x <= cx + radius + thickness + 1; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        const dist = Math.hypot(dx, dy)
        const d = Math.abs(dist - radius) - thickness / 2
        const cov = coverage(d)
        if (cov <= 0) continue
        let ang = Math.atan2(dy, dx)
        if (ang < 0) ang += Math.PI * 2
        if (ang < from || ang > to) continue
        this.set(x, y, color, a * cov)
      }
    }
  }

  toPNG() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h)
    let p = 0
    for (let y = 0; y < this.h; y++) {
      raw[p++] = 0
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4
        raw[p++] = this.data[i]
        raw[p++] = this.data[i + 1]
        raw[p++] = this.data[i + 2]
        raw[p++] = this.data[i + 3]
      }
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(this.w, 0)
    ihdr.writeUInt32BE(this.h, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  }
}

function roundRectDistance(px, py, x0, y0, w, h, r) {
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const qx = Math.abs(px - cx) - (w / 2 - r)
  const qy = Math.abs(py - cy) - (h / 2 - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function coverage(d) {
  if (d <= -0.5) return 1
  if (d >= 0.5) return 0
  return 0.5 - d
}

export const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
]
