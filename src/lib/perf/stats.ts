import type { Stats } from "./types";

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function summarize(values: (number | null | undefined)[]): Stats | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.length > 1 ? v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1) : 0;
  return { n: v.length, min: v[0], max: v[v.length - 1], mean, p50: percentile(v, 0.5), p90: percentile(v, 0.9), p95: percentile(v, 0.95), stdev: Math.sqrt(variance) };
}

export function median(values: (number | null | undefined)[]): number | null {
  const s = summarize(values);
  return s ? s.p50 : null;
}

/** Piecewise-linear interpolation through sorted [x, y] points; clamps outside the range. */
export function interp(x: number, points: [number, number][]): number {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}
