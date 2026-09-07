/** Generates a small synthetic probe image in the browser (canvas). */
export interface ProbeImage {
  dataUrl: string;
  color: { en: string; zh: string; hex: string };
  shape: "circle" | "square" | "triangle";
  number: number;
}

const COLORS = [
  { en: "red", zh: "红", hex: "#e53935" },
  { en: "blue", zh: "蓝", hex: "#1e88e5" },
  { en: "green", zh: "绿", hex: "#43a047" },
  { en: "yellow", zh: "黄", hex: "#fdd835" },
  { en: "purple", zh: "紫", hex: "#8e24aa" },
  { en: "orange", zh: "橙", hex: "#fb8c00" },
];
const SHAPES: ProbeImage["shape"][] = ["circle", "square", "triangle"];

export function drawProbe(canvas: HTMLCanvasElement, color: (typeof COLORS)[number], shape: ProbeImage["shape"], number: number) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color.hex;
  const cx = w / 2;
  const cy = h * 0.36;
  const r = w * 0.2;
  ctx.beginPath();
  if (shape === "circle") ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (shape === "square") ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.lineTo(cx - r, cy + r);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.font = `bold ${Math.round(h * 0.28)}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), cx, h * 0.78);
}

export function makeProbeImage(): ProbeImage | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const number = 10 + Math.floor(Math.random() * 89);
    drawProbe(canvas, color, shape, number);
    return { dataUrl: canvas.toDataURL("image/png"), color, shape, number };
  } catch {
    return null;
  }
}

/** The static probe shipped in /assets/vision-probe.png (blue circle, number 42). */
export const STATIC_PROBE = { path: "/assets/vision-probe.png", color: COLORS[1], shape: "circle" as const, number: 42 };

export const SHAPE_WORDS: Record<ProbeImage["shape"], string[]> = {
  circle: ["circle", "round", "圆"],
  square: ["square", "rectangle", "方", "正方"],
  triangle: ["triangle", "三角"],
};
