import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "accent" | "good" | "warning" | "serious" | "critical" | "outline";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent/10 text-accent-ink",
  good: "bg-good/12 text-good-ink",
  warning: "bg-warning/15 text-warning-ink",
  serious: "bg-serious/15 text-serious-ink",
  critical: "bg-critical/12 text-critical-ink",
  outline: "border border-border text-ink-2",
};
export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", tones[tone], className)} {...props} />;
}
