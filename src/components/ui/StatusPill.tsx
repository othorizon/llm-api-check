import { AlertTriangle, Ban, Check, CircleDashed, Loader2, Minus, SkipForward, X } from "lucide-react";
import type { CapStatus } from "@/lib/caps/types";
import { cn } from "@/lib/utils/cn";

export type PillStatus = CapStatus | "running" | "pending";

const styles: Record<PillStatus, { cls: string; Icon: typeof Check }> = {
  pass: { cls: "bg-good/12 text-good-ink", Icon: Check },
  partial: { cls: "bg-warning/15 text-warning-ink", Icon: Minus },
  fail: { cls: "bg-critical/12 text-critical-ink", Icon: X },
  unsupported: { cls: "bg-serious/15 text-serious-ink", Icon: Ban },
  error: { cls: "bg-critical/12 text-critical-ink", Icon: AlertTriangle },
  skipped: { cls: "bg-surface-2 text-muted", Icon: SkipForward },
  na: { cls: "bg-surface-2 text-muted", Icon: CircleDashed },
  running: { cls: "bg-accent/10 text-accent-ink", Icon: Loader2 },
  pending: { cls: "bg-surface-2 text-muted", Icon: CircleDashed },
};

export function StatusPill({ status, label, className, compact }: { status: PillStatus; label: string; className?: string; compact?: boolean }) {
  const s = styles[status];
  const Icon = s.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full font-medium", compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs", s.cls, className)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  );
}

export function GradeBadge({ grade, score }: { grade: "A" | "B" | "C" | "D" | "F" | null; score: number | null }) {
  const tone = grade === "A" ? "bg-good/12 text-good-ink" : grade === "B" ? "bg-good/12 text-good-ink" : grade === "C" ? "bg-warning/15 text-warning-ink" : grade === "D" ? "bg-serious/15 text-serious-ink" : grade === "F" ? "bg-critical/12 text-critical-ink" : "bg-surface-2 text-muted";
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 rounded-md px-2 py-1", tone)}>
      <span className="text-lg font-semibold leading-none">{grade ?? "–"}</span>
      {score != null ? <span className="tnum text-xs opacity-80">{score}</span> : null}
    </span>
  );
}
