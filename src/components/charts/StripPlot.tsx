import * as React from "react";
import { seriesColor } from "@/components/ui/Misc";

export interface StripRow {
  label: string;
  index: number;
  values: { v: number; title: string }[];
  median: number | null;
}

function niceTicks(max: number, count = 5): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Horizontal strip (dot) plot: one row per series, dots per run, a tick at the median. */
export function StripPlot({ rows, format, ariaLabel }: { rows: StripRow[]; format: (v: number) => string; ariaLabel: string }) {
  const [hover, setHover] = React.useState<{ x: number; y: number; text: string } | null>(null);
  const labelW = 150;
  const rowH = 30;
  const padR = 16;
  const width = 720;
  const height = rows.length * rowH + 28;
  const all = rows.flatMap((r) => r.values.map((x) => x.v));
  const maxV = all.length ? Math.max(...all) : 1;
  const ticks = niceTicks(maxV);
  const domainMax = ticks[ticks.length - 1] || maxV || 1;
  const plotW = width - labelW - padR;
  const x = (v: number) => labelW + (v / domainMax) * plotW;
  return (
    <div className="relative w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={x(tk)} x2={x(tk)} y1={4} y2={rows.length * rowH} stroke="var(--grid)" strokeWidth={1} />
            <text x={x(tk)} y={rows.length * rowH + 18} textAnchor="middle" fontSize={11} fill="var(--muted)" className="tnum">
              {format(tk)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = i * rowH + rowH / 2;
          return (
            <g key={r.label + i}>
              <text x={labelW - 12} y={cy + 4} textAnchor="end" fontSize={12} fill="var(--ink-2)">
                {r.label.length > 20 ? r.label.slice(0, 19) + "…" : r.label}
              </text>
              <circle cx={labelW - 4} cy={cy} r={3.5} fill={seriesColor(r.index)} />
              {r.median != null ? <rect x={x(r.median) - 1} y={cy - 9} width={2} height={18} fill="var(--ink)" opacity={0.85} /> : null}
              {r.values.map((pt, j) => (
                <circle
                  key={j}
                  cx={x(pt.v)}
                  cy={cy}
                  r={5}
                  fill={seriesColor(r.index)}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    const sx = rect.width / width;
                    setHover({ x: x(pt.v) * sx, y: cy * sx, text: pt.title });
                  }}
                >
                  <title>{pt.title}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {hover ? (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-lg" style={{ left: hover.x, top: hover.y }}>
          {hover.text}
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal bar chart: one bar per series, value label at the tip. */
export function BarChart({ rows, format, ariaLabel }: { rows: { label: string; index: number; value: number | null; title?: string }[]; format: (v: number) => string; ariaLabel: string }) {
  const labelW = 150;
  const rowH = 30;
  const barH = 18;
  const width = 720;
  const padR = 70;
  const height = rows.length * rowH + 28;
  const maxV = Math.max(0, ...rows.map((r) => r.value ?? 0));
  const ticks = niceTicks(maxV);
  const domainMax = ticks[ticks.length - 1] || maxV || 1;
  const plotW = width - labelW - padR;
  const x = (v: number) => labelW + (v / domainMax) * plotW;
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={ariaLabel}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={x(tk)} x2={x(tk)} y1={4} y2={rows.length * rowH} stroke="var(--grid)" strokeWidth={1} />
            <text x={x(tk)} y={rows.length * rowH + 18} textAnchor="middle" fontSize={11} fill="var(--muted)" className="tnum">
              {format(tk)}
            </text>
          </g>
        ))}
        <line x1={labelW} x2={labelW} y1={4} y2={rows.length * rowH} stroke="var(--border-strong)" strokeWidth={1} />
        {rows.map((r, i) => {
          const cy = i * rowH + rowH / 2;
          const v = r.value ?? 0;
          const w = Math.max(0, x(v) - labelW);
          return (
            <g key={r.label + i}>
              <text x={labelW - 12} y={cy + 4} textAnchor="end" fontSize={12} fill="var(--ink-2)">
                {r.label.length > 20 ? r.label.slice(0, 19) + "…" : r.label}
              </text>
              <circle cx={labelW - 4} cy={cy} r={3.5} fill={seriesColor(r.index)} />
              {r.value != null ? (
                <>
                  <path d={`M${labelW},${cy - barH / 2} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v${barH - 8} a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} z`} fill={seriesColor(r.index)}>
                    <title>{r.title ?? `${r.label}: ${format(v)}`}</title>
                  </path>
                  <text x={x(v) + 8} y={cy + 4} fontSize={12} fill="var(--ink)" className="tnum">
                    {format(v)}
                  </text>
                </>
              ) : (
                <text x={labelW + 8} y={cy + 4} fontSize={12} fill="var(--muted)">
                  —
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
