import * as React from "react";
import { Tabs as RTabs } from "radix-ui";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { copyText } from "@/lib/utils/download";

export function CodeBlock({ code, className, maxHeight = 360, copyLabel = "Copy" }: { code: string; className?: string; maxHeight?: number; copyLabel?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className={cn("relative rounded-lg border border-border bg-surface-2", className)}>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-ink-2 hover:text-ink"
        aria-label={copyLabel}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copyLabel}
      </button>
      <pre className="mono overflow-auto p-3 pr-20 text-[12px] leading-5 text-ink" style={{ maxHeight }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <div className="text-base font-semibold">{title}</div>
      {hint ? <div className="mt-1 max-w-md text-sm text-ink-2">{hint}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Tabs({ value, onValueChange, items, className }: { value: string; onValueChange: (v: string) => void; items: { value: string; label: React.ReactNode }[]; className?: string }) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List className="inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1">
        {items.map((it) => (
          <RTabs.Trigger key={it.value} value={it.value} className="rounded-md px-3 py-1 text-sm text-ink-2 transition-colors data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            {it.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
    </RTabs.Root>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function SectionTitle({ title, subtitle, right }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Kv({ items, className }: { items: { k: React.ReactNode; v: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm", className)}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <dt className="text-muted">{it.k}</dt>
          <dd className="tnum min-w-0 break-words text-ink">{it.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export const SERIES_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
export function seriesColor(i: number) {
  return `var(${SERIES_VARS[i % SERIES_VARS.length]})`;
}
export function SeriesDot({ index, className }: { index: number; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={{ background: seriesColor(index) }} aria-hidden />;
}
