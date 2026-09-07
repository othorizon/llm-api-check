export function fmtMs(ms: number | null | undefined, digits = 0): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(digits)} ms`;
}
export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}
export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}
export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
export function fmtDate(ts: number, locale?: string): string {
  try {
    return new Date(ts).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return new Date(ts).toISOString();
  }
}
export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
export function safeJson(v: unknown, max = 4000): string {
  try {
    const s = JSON.stringify(v, null, 2);
    return s.length > max ? s.slice(0, max) + `\n… (${s.length - max} more chars)` : s;
  } catch {
    return String(v);
  }
}
