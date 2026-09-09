// Paints an ImageDoc (see image-model.ts) onto a canvas: a dark brand card with the session's
// verdicts, the site name and URL, and a QR code of the home page. Everything is drawn with the
// 2D API — no DOM snapshots, no external fonts, so it works under the site's strict CSP.
import qrcode from "qrcode-generator";
import type { CapStatus } from "@/lib/caps/types";
import type { Grade } from "@/lib/perf/types";
import { IMAGE_LAYOUT, type ImageBadge, type ImageCell, type ImageColumn, type ImageDoc, type ImageModel, type ImageSection, type Tone } from "./image-model";

const FONT_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const FONT_MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

const { pad: PAD, panelPad: PANEL_PAD } = IMAGE_LAYOUT;
const CELL_PAD = 12;
const ROW_PAD = 10;
/** Canvas area budget: iOS Safari refuses larger bitmaps. */
const MAX_PIXELS = 16_000_000;

// Dark palette, mirroring the `.dark` tokens in styles.css.
const BG = "#0d0d0d";
const PANEL = "rgba(24, 24, 23, 0.94)";
const PANEL_2 = "rgba(255, 255, 255, 0.045)";
const LINE = "rgba(255, 255, 255, 0.09)";
const LINE_STRONG = "rgba(255, 255, 255, 0.2)";
const INK = "#ffffff";
const INK_2 = "#c3c2b7";
const MUTED = "#8b8a84";
const ACCENT_INK = "#86b6ef";
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

const TONES: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "rgba(12, 163, 12, 0.18)", fg: "#4ed14e" },
  warning: { bg: "rgba(250, 178, 25, 0.18)", fg: "#fac75c" },
  serious: { bg: "rgba(236, 131, 90, 0.18)", fg: "#f2a284" },
  critical: { bg: "rgba(208, 59, 59, 0.18)", fg: "#ee7777" },
  accent: { bg: "rgba(57, 135, 229, 0.2)", fg: "#86b6ef" },
  neutral: { bg: "rgba(255, 255, 255, 0.09)", fg: "#c3c2b7" },
  muted: { bg: "rgba(255, 255, 255, 0.06)", fg: "#8b8a84" },
};
const STATUS_TONE: Record<CapStatus, Tone> = { pass: "good", partial: "warning", fail: "critical", unsupported: "serious", error: "critical", skipped: "muted", na: "muted" };
/** Lucide-style icons on a 24-unit grid. */
const STATUS_ICON: Record<CapStatus, { d: string; dash?: number[] }> = {
  pass: { d: "M5 12l5 5L20 7" },
  partial: { d: "M5 12h14" },
  fail: { d: "M18 6L6 18M6 6l12 12" },
  unsupported: { d: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM5.6 5.6l12.8 12.8" },
  error: { d: "M12 3.5L2.5 20h19L12 3.5zM12 9.5v4.5M12 17.5v.01" },
  skipped: { d: "M5 4l10 8-10 8V4zM19 5v14" },
  na: { d: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", dash: [3.5, 3.5] },
};
const GRADE_TONE = (g: Grade | null): Tone => (g === "A" || g === "B" ? "good" : g === "C" ? "warning" : g === "D" ? "serious" : g === "F" ? "critical" : "muted");

const LOGO_CHECK_1 = "M6 19h4.6l2-6 3 10";
const LOGO_CHECK_2 = "M15.6 23 26 10";

interface TextStyle {
  size: number;
  weight?: number;
  color?: string;
  mono?: boolean;
  align?: CanvasTextAlign;
  /** Letter spacing in px (ignored by browsers without canvas letterSpacing). */
  spacing?: number;
}

const SUB: TextStyle = { size: 12, color: MUTED };
const NOTE: TextStyle = { size: 13, color: MUTED };
const TITLE: TextStyle = { size: 16, weight: 600, color: INK };
const HEAD: TextStyle = { size: 11, weight: 600, color: MUTED, spacing: 0.5 };

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

/** Splits text into wrap units: words keep their trailing space or hyphen, CJK characters stand alone. */
function tokens(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    if (CJK.test(ch)) {
      if (buf) out.push(buf);
      buf = "";
      out.push(ch);
    } else if (ch === " " || ch === "-") {
      out.push(buf + ch);
      buf = "";
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

class Painter {
  /** When set, nothing is drawn: layout passes use it to measure. */
  dry = false;
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly scale: number,
  ) {}

  private font(st: TextStyle) {
    this.ctx.font = `${st.weight ?? 400} ${st.size}px ${st.mono ? FONT_MONO : FONT_SANS}`;
    if ("letterSpacing" in this.ctx) this.ctx.letterSpacing = `${st.spacing ?? 0}px`;
  }
  measure(text: string, st: TextStyle): number {
    this.font(st);
    return this.ctx.measureText(text).width;
  }
  /** Draws one line vertically centred on `cy`. */
  text(text: string, x: number, cy: number, st: TextStyle) {
    if (this.dry || !text) return;
    this.font(st);
    this.ctx.fillStyle = st.color ?? INK;
    this.ctx.textAlign = st.align ?? "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, x, cy);
  }
  ellipsis(text: string, maxWidth: number, st: TextStyle): string {
    if (this.measure(text, st) <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.measure(text.slice(0, mid).trimEnd() + "…", st) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + "…";
  }
  wrap(text: string, maxWidth: number, st: TextStyle, maxLines = Infinity): string[] {
    if (!text) return [];
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const tok of tokens(para)) {
        const candidate = line + tok;
        if (!line || this.measure(candidate.trimEnd(), st) <= maxWidth) line = candidate;
        else {
          lines.push(line.trimEnd());
          line = tok.trimStart();
        }
        // A single unit wider than the line (long URL, model id) is broken by character.
        while (this.measure(line.trimEnd(), st) > maxWidth && line.length > 1) {
          let n = line.length - 1;
          while (n > 1 && this.measure(line.slice(0, n), st) > maxWidth) n--;
          lines.push(line.slice(0, n));
          line = line.slice(n);
        }
      }
      lines.push(line.trimEnd());
    }
    if (lines.length > maxLines) {
      const cut = lines.slice(0, maxLines);
      cut[maxLines - 1] = this.ellipsis(cut[maxLines - 1] + "…", maxWidth, st);
      return cut;
    }
    return lines;
  }
  rect(x: number, y: number, w: number, h: number, fill: string | null, r = 0, stroke?: string) {
    if (this.dry) return;
    const c = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.arcTo(x + w, y, x + w, y + rr, rr);
    c.lineTo(x + w, y + h - rr);
    c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    c.lineTo(x + rr, y + h);
    c.arcTo(x, y + h, x, y + h - rr, rr);
    c.lineTo(x, y + rr);
    c.arcTo(x, y, x + rr, y, rr);
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.stroke();
    }
  }
  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1) {
    if (this.dry) return;
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  circle(cx: number, cy: number, r: number, fill: string) {
    if (this.dry) return;
    const c = this.ctx;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  }
  /** Strokes an SVG path defined on a `unit`-sized grid, scaled into a `size` box at (x, y). */
  path(d: string, x: number, y: number, size: number, unit: number, opts: { stroke: string; width: number; dash?: number[] }) {
    if (this.dry) return;
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.scale(size / unit, size / unit);
    c.strokeStyle = opts.stroke;
    c.lineWidth = opts.width;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (opts.dash) c.setLineDash(opts.dash);
    c.stroke(new Path2D(d));
    c.restore();
  }
  /** Elliptical radial glow. */
  glow(cx: number, cy: number, rx: number, ry: number, color: string) {
    if (this.dry) return;
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = g;
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }
  /** Rounds a logical coordinate to the device pixel grid (crisp QR modules). */
  snap(v: number) {
    return Math.round(v * this.scale) / this.scale;
  }
}

function seriesColor(i: number) {
  return SERIES[i % SERIES.length];
}

function logo(p: Painter, x: number, y: number, size: number, variant: "light" | "dark" = "light") {
  const light = variant === "light";
  p.rect(x, y, size, size, light ? "#ffffff" : "#0b0b0b", size * 0.22);
  p.path(LOGO_CHECK_1, x, y, size, 32, { stroke: light ? "#0b0b0b" : "#ffffff", width: 3 });
  p.path(LOGO_CHECK_2, x, y, size, 32, { stroke: light ? "#16a34a" : "#22c55e", width: 3 });
}

/** Colour dot + label; returns the width used. */
function modelLabel(p: Painter, x: number, cy: number, model: ImageModel, maxWidth: number, st: TextStyle = { size: 15, weight: 600, color: INK }): number {
  p.circle(x + 5, cy, 5, seriesColor(model.index));
  const text = p.ellipsis(model.label, maxWidth - 16, st);
  p.text(text, x + 16, cy, st);
  return 16 + p.measure(text, st);
}

function pill(p: Painter, x: number, cy: number, status: CapStatus, label: string, maxWidth: number): number {
  const st: TextStyle = { size: 12, weight: 600 };
  const tone = TONES[STATUS_TONE[status]];
  const text = p.ellipsis(label, maxWidth - 34, st);
  const w = 8 + 12 + 5 + p.measure(text, st) + 9;
  p.rect(x, cy - 11, w, 22, tone.bg, 11);
  const icon = STATUS_ICON[status];
  p.path(icon.d, x + 8, cy - 6, 12, 24, { stroke: tone.fg, width: 2.6, dash: icon.dash });
  p.text(text, x + 25, cy, { ...st, color: tone.fg });
  return w;
}

const BADGE: TextStyle = { size: 12, weight: 500 };
function badgeWidth(p: Painter, text: string, mono?: boolean) {
  return p.measure(text, { ...BADGE, mono }) + 18;
}
function badge(p: Painter, x: number, cy: number, text: string, tone: Tone, mono?: boolean): number {
  const w = badgeWidth(p, text, mono);
  p.rect(x, cy - 11, w, 22, TONES[tone].bg, 11);
  p.text(text, x + 9, cy, { ...BADGE, mono, color: TONES[tone].fg });
  return w;
}

function gradeBox(p: Painter, x: number, cy: number, grade: Grade | null, score: number | null) {
  const tone = TONES[GRADE_TONE(grade)];
  const big: TextStyle = { size: 20, weight: 700, color: tone.fg };
  const small: TextStyle = { size: 12, weight: 500, color: tone.fg };
  const letter = grade ?? "–";
  const lw = p.measure(letter, big);
  const sw = score != null ? p.measure(String(score), small) : 0;
  const w = 10 + lw + (sw ? 6 + sw : 0) + 10;
  p.rect(x, cy - 17, w, 34, tone.bg, 8);
  p.text(letter, x + 10, cy, big);
  if (score != null) p.text(String(score), x + 10 + lw + 6, cy + 2, small);
}

type TableSection = Extract<ImageSection, { type: "table" }>;
type HighlightsSection = Extract<ImageSection, { type: "highlights" }>;
type BarsSection = Extract<ImageSection, { type: "bars" }>;

interface PreparedCell {
  height: number;
  draw: (x: number, y: number) => void;
}

function prepareCell(p: Painter, cell: ImageCell, maxW: number): PreparedCell {
  switch (cell.kind) {
    case "text": {
      const main: TextStyle = { size: 15, weight: cell.strong ? 600 : 400, mono: cell.mono, color: cell.tone ? TONES[cell.tone].fg : cell.strong ? INK : INK_2 };
      const sub: TextStyle = { ...SUB, mono: cell.subMono };
      const mainLines = cell.text ? (cell.wrap ? p.wrap(cell.text, maxW, main, 3) : [p.ellipsis(cell.text, maxW, main)]) : [];
      const subLines = cell.sub ? (cell.wrap ? p.wrap(cell.sub, maxW, sub, 4) : [p.ellipsis(cell.sub, maxW, sub)]) : [];
      return {
        height: mainLines.length * 20 + subLines.length * 17,
        draw: (x, y) => {
          let cy = y;
          for (const l of mainLines) {
            p.text(l, x, cy + 10, main);
            cy += 20;
          }
          for (const l of subLines) {
            p.text(l, x, cy + 8.5, sub);
            cy += 17;
          }
        },
      };
    }
    case "model":
      return {
        height: 20 + 17,
        draw: (x, y) => {
          modelLabel(p, x, y + 10, cell.model, maxW);
          p.text(p.ellipsis(cell.model.provider, maxW - 16, SUB), x + 16, y + 20 + 8.5, SUB);
        },
      };
    case "pill": {
      const subLines = cell.sub ? p.wrap(cell.sub, maxW, SUB, 2) : [];
      return {
        height: 22 + (subLines.length ? 4 + subLines.length * 17 : 0),
        draw: (x, y) => {
          pill(p, x, y + 11, cell.status, cell.label, maxW);
          let cy = y + 22 + 4;
          for (const l of subLines) {
            p.text(l, x, cy + 8.5, SUB);
            cy += 17;
          }
        },
      };
    }
    case "badge":
      return { height: 22, draw: (x, y) => void badge(p, x, y + 11, p.ellipsis(cell.text, maxW - 18, BADGE), cell.tone) };
    case "grade":
      return { height: 34, draw: (x, y) => gradeBox(p, x, y + 17, cell.grade, cell.score) };
  }
}

function sectionHeader(p: Painter, title: string | undefined, hint: string | undefined, x: number, y0: number, w: number): number {
  let y = y0;
  if (title) {
    p.text(p.ellipsis(title, w, TITLE), x, y + 11, TITLE);
    y += 22;
  }
  if (hint) {
    if (title) y += 4;
    for (const l of p.wrap(hint, w, NOTE)) {
      p.text(l, x, y + 9, NOTE);
      y += 18;
    }
  }
  if (title || hint) y += 12;
  return y - y0;
}

function columnGeometry(columns: ImageColumn[], x0: number, w: number) {
  const fixed = columns.reduce((a, c) => a + (c.width ?? 0), 0);
  const growTotal = columns.reduce((a, c) => a + (c.width ? 0 : (c.grow ?? 1)), 0);
  const xs: number[] = [];
  const ws: number[] = [];
  let x = x0;
  for (const c of columns) {
    const cw = c.width ?? ((w - fixed) * (c.grow ?? 1)) / Math.max(1, growTotal);
    xs.push(x);
    ws.push(cw);
    x += cw;
  }
  return { xs, ws };
}

function tableSection(p: Painter, s: TableSection, x0: number, y0: number, w: number): number {
  let y = y0 + sectionHeader(p, s.title, s.hint, x0, y0, w);
  const { xs, ws } = columnGeometry(s.columns, x0, w);
  // Captions wrap onto a second line rather than being cut off; everything sits on the header's bottom edge.
  const captions = s.columns.map((c, i) => (c.model ? [] : p.wrap(c.label.toUpperCase(), ws[i] - CELL_PAD * 2, HEAD, 2)));
  const headH = 20 + Math.max(1, ...captions.map((l) => l.length)) * 14;
  s.columns.forEach((c, i) => {
    const inner = ws[i] - CELL_PAD * 2;
    if (c.model) modelLabel(p, xs[i] + CELL_PAD, y + headH - 10 - 7, c.model, inner, { size: 13, weight: 600, color: INK });
    else captions[i].forEach((l, li) => p.text(l, xs[i] + CELL_PAD, y + headH - 10 - 7 - (captions[i].length - 1 - li) * 14, HEAD));
  });
  y += headH;
  p.line(x0, y, x0 + w, y, LINE_STRONG);
  for (let ri = 0; ri < s.rows.length; ri++) {
    const row = s.rows[ri];
    if (row.kind === "group") {
      p.rect(x0, y, w, 28, PANEL_2);
      p.text(p.ellipsis(row.label.toUpperCase(), w - CELL_PAD * 2, HEAD), x0 + CELL_PAD, y + 14, HEAD);
      y += 28;
      continue;
    }
    const cells = row.cells.map((cell, i) => prepareCell(p, cell, ws[i] - CELL_PAD * 2));
    const rowH = Math.max(20, ...cells.map((c) => c.height)) + ROW_PAD * 2;
    cells.forEach((c, i) => c.draw(xs[i] + CELL_PAD, y + ROW_PAD));
    y += rowH;
    const next = s.rows[ri + 1];
    if (!next) break;
    // A continuation row (same model, next cache condition) keeps the model cell visually joined.
    const from = next.kind === "row" && next.continues ? xs[1] ?? x0 : x0;
    p.line(from, y, x0 + w, y, LINE);
  }
  if (s.notes?.length) {
    y += 12;
    for (const n of s.notes)
      for (const l of p.wrap(n, w, NOTE)) {
        p.text(l, x0, y + 9, NOTE);
        y += 18;
      }
  }
  return y - y0;
}

interface FlowBadge extends ImageBadge {
  x: number;
  y: number;
}

function highlightsSection(p: Painter, s: HighlightsSection, x0: number, y0: number, w: number): number {
  let y = y0 + sectionHeader(p, s.title, undefined, x0, y0, w);
  const cols = s.items.length > 1 ? 2 : 1;
  const gap = 16;
  const cw = (w - gap * (cols - 1)) / cols;
  const inner = cw - 28;
  const items = s.items.map((it) => {
    const flow: FlowBadge[] = [];
    let bx = 0;
    let by = 0;
    for (const b of it.badges) {
      const text = p.ellipsis(b.text, inner - 18, { ...BADGE, mono: b.mono });
      const bw = badgeWidth(p, text, b.mono);
      if (bx > 0 && bx + bw > inner) {
        bx = 0;
        by += 28;
      }
      flow.push({ ...b, text, x: bx, y: by });
      bx += bw + 6;
    }
    const bodyH = flow.length ? by + 22 : 17;
    return { model: it.model, flow, height: 14 + 22 + 8 + bodyH + 14 };
  });
  for (let i = 0; i < items.length; i += cols) {
    const rowItems = items.slice(i, i + cols);
    const h = Math.max(...rowItems.map((x) => x.height));
    rowItems.forEach((item, j) => {
      const x = x0 + j * (cw + gap);
      p.rect(x, y, cw, h, PANEL_2, 10, LINE);
      modelLabel(p, x + 14, y + 14 + 11, item.model, inner);
      const top = y + 14 + 22 + 8;
      if (!item.flow.length) p.text(s.empty, x + 14, top + 8.5, SUB);
      for (const b of item.flow) badge(p, x + 14 + b.x, top + b.y + 11, b.text, b.tone, b.mono);
    });
    y += h + gap;
  }
  return y - gap - y0;
}

function barsSection(p: Painter, s: BarsSection, x0: number, y0: number, w: number): number {
  const n = s.groups.length;
  const gap = 32;
  const gw = (w - gap * (n - 1)) / n;
  const label: TextStyle = { size: 13, color: INK_2 };
  let maxH = 0;
  s.groups.forEach((g, gi) => {
    const x = x0 + gi * (gw + gap);
    let y = y0 + sectionHeader(p, g.title, undefined, x, y0, gw);
    const labelW = Math.min(240, gw * 0.42);
    const valueW = 96;
    const trackX = x + labelW + 12;
    const trackW = gw - labelW - 12 - valueW - 12;
    const max = Math.max(1e-9, ...g.items.map((i) => i.value ?? 0));
    for (const it of g.items) {
      const cy = y + 15;
      p.circle(x + 5, cy, 5, seriesColor(it.model.index));
      p.text(p.ellipsis(it.label, labelW - 16, label), x + 16, cy, label);
      p.rect(trackX, cy - 5, trackW, 10, "rgba(255, 255, 255, 0.07)", 5);
      if (it.value != null) p.rect(trackX, cy - 5, Math.max(4, (it.value / max) * trackW), 10, seriesColor(it.model.index), 5);
      p.text(it.display, x + gw, cy, { size: 13, weight: 600, align: "right", color: it.value == null ? MUTED : INK });
      y += 30;
    }
    maxH = Math.max(maxH, y - y0);
  });
  return maxH;
}

function section(p: Painter, s: ImageSection, x: number, y: number, w: number): number {
  if (s.type === "table") return tableSection(p, s, x, y, w);
  if (s.type === "highlights") return highlightsSection(p, s, x, y, w);
  return barsSection(p, s, x, y, w);
}

function qr(p: Painter, x: number, y: number, size: number, url: string) {
  p.rect(x, y, size, size, "#ffffff", 14);
  if (p.dry) return;
  // Level H survives the brand mark covering the centre (~9 % of the modules; H tolerates 30 %).
  const code = qrcode(0, "H");
  code.addData(url);
  code.make();
  const n = code.getModuleCount();
  const quiet = 12;
  const cell = (size - quiet * 2) / n;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!code.isDark(r, c)) continue;
      const x1 = p.snap(x + quiet + c * cell);
      const x2 = p.snap(x + quiet + (c + 1) * cell);
      const y1 = p.snap(y + quiet + r * cell);
      const y2 = p.snap(y + quiet + (r + 1) * cell);
      p.rect(x1, y1, x2 - x1, y2 - y1, "#0b0b0b");
    }
  const mark = Math.round(size * 0.2);
  const mx = x + (size - mark) / 2;
  const my = y + (size - mark) / 2;
  p.rect(mx - 4, my - 4, mark + 8, mark + 8, "#ffffff", 7);
  logo(p, mx, my, mark, "dark");
}

function background(p: Painter, w: number, h: number) {
  p.rect(0, 0, w, h, BG);
  p.glow(w * 0.85, 120, 620, 360, "rgba(57, 135, 229, 0.34)");
  p.glow(w * 0.08, h - 60, 540, 300, "rgba(27, 175, 122, 0.24)");
}

/** Lays the document out top to bottom; returns the total height. Draws only when the painter is not dry. */
function layout(doc: ImageDoc, p: Painter, totalHeight: number): number {
  const W = doc.width;
  const CW = W - PAD * 2;
  if (!p.dry) background(p, W, totalHeight);
  let y = PAD;

  // Header: brand on the left, kind badge + date on the right.
  logo(p, PAD, y, 44);
  p.text(doc.brand.name, PAD + 58, y + 22, { size: 24, weight: 700, color: INK, spacing: -0.3 });
  const dateSt: TextStyle = { size: 14, color: MUTED, align: "right" };
  p.text(doc.date, W - PAD, y + 22, dateSt);
  const kindSt: TextStyle = { size: 12, weight: 600 };
  const kindW = p.measure(doc.kind, kindSt) + 20;
  const kindX = W - PAD - p.measure(doc.date, dateSt) - 14 - kindW;
  p.rect(kindX, y + 10, kindW, 24, TONES.accent.bg, 12);
  p.text(doc.kind, kindX + 10, y + 22, { ...kindSt, color: TONES.accent.fg });
  y += 44 + 36;

  // Title, models, configuration.
  const titleSt: TextStyle = { size: 40, weight: 700, color: INK, spacing: -0.8 };
  for (const l of p.wrap(doc.title, CW, titleSt)) {
    p.text(l, PAD, y + 25, titleSt);
    y += 50;
  }
  y += 8;
  const labelSt: TextStyle = { size: 17, weight: 600, color: INK };
  const providerSt: TextStyle = { size: 14, color: MUTED };
  const lineH = 30;
  let x = PAD;
  for (const m of doc.models) {
    const label = p.ellipsis(m.label, CW - 16, labelSt);
    const lw = p.measure(label, labelSt);
    const provider = p.ellipsis(m.provider, Math.max(0, CW - 16 - lw - 8), providerSt);
    const pw = provider ? 8 + p.measure(provider, providerSt) : 0;
    const itemW = 16 + lw + pw;
    if (x > PAD && x + itemW > W - PAD) {
      x = PAD;
      y += lineH;
    }
    p.circle(x + 5, y + lineH / 2, 5, seriesColor(m.index));
    p.text(label, x + 16, y + lineH / 2, labelSt);
    if (provider) p.text(provider, x + 16 + lw + 8, y + lineH / 2 + 1, providerSt);
    x += itemW + 28;
  }
  y += lineH + 8;
  const summarySt: TextStyle = { size: 14, color: INK_2 };
  for (const s of doc.summary)
    for (const l of p.wrap(s, CW, summarySt)) {
      p.text(l, PAD, y + 11, summarySt);
      y += 22;
    }
  y += 26;

  // Sections, each in its own panel. Measure first so the panel can be painted under the content.
  for (const s of doc.sections) {
    const wasDry = p.dry;
    p.dry = true;
    const h = section(p, s, PAD + PANEL_PAD, y + PANEL_PAD, CW - PANEL_PAD * 2);
    p.dry = wasDry;
    p.rect(PAD, y, CW, h + PANEL_PAD * 2, PANEL, 16, LINE);
    if (!p.dry) section(p, s, PAD + PANEL_PAD, y + PANEL_PAD, CW - PANEL_PAD * 2);
    y += h + PANEL_PAD * 2 + 20;
  }

  // Footer: brand, tagline, URL and the QR code.
  y += 6;
  p.line(PAD, y, W - PAD, y, LINE_STRONG);
  y += 32;
  const QR = 156;
  const qx = W - PAD - QR;
  qr(p, qx, y, QR, doc.brand.url);
  const leftW = CW - QR - 48;
  logo(p, PAD, y, 36);
  p.text(doc.brand.name, PAD + 48, y + 18, { size: 20, weight: 700, color: INK, spacing: -0.2 });
  let ly = y + 36 + 12;
  const taglineSt: TextStyle = { size: 15, color: INK_2 };
  for (const l of p.wrap(doc.brand.tagline, leftW, taglineSt)) {
    p.text(l, PAD, ly + 11, taglineSt);
    ly += 22;
  }
  ly += 6;
  p.text(doc.brand.host, PAD, ly + 12, { size: 20, weight: 600, color: ACCENT_INK });
  ly += 30 + 8;
  for (const l of p.wrap(doc.brand.generated, leftW, NOTE)) {
    p.text(l, PAD, ly + 9, NOTE);
    ly += 18;
  }
  const scanSt: TextStyle = { size: 12, color: MUTED, align: "center" };
  let sy = y + QR + 10;
  for (const l of p.wrap(doc.brand.scan, QR + 40, scanSt)) {
    p.text(l, qx + QR / 2, sy + 8, scanSt);
    sy += 16;
  }
  return Math.max(ly, sy) + PAD;
}

function chooseScale(w: number, h: number): number {
  const s = 2;
  if (w * h * s * s <= MAX_PIXELS) return s;
  return Math.max(1, Math.floor(Math.sqrt(MAX_PIXELS / (w * h)) * 4) / 4);
}

/** Renders the document to a fresh canvas (2× resolution where the canvas budget allows). */
export function renderSessionImage(doc: ImageDoc): HTMLCanvasElement {
  const scratch = document.createElement("canvas");
  const measureCtx = scratch.getContext("2d");
  if (!measureCtx) throw new Error("canvas unsupported");
  const dryRun = new Painter(measureCtx, 1);
  dryRun.dry = true;
  const height = Math.ceil(layout(doc, dryRun, 0));
  const scale = chooseScale(doc.width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.scale(scale, scale);
  layout(doc, new Painter(ctx, scale), height);
  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"));
}
