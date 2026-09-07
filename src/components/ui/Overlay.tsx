import * as React from "react";
import { Dialog as RDialog, Popover as RPopover, Tooltip as RTooltip } from "radix-ui";
import { X, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Dialog({ open, onOpenChange, title, description, children, className, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <RDialog.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-0 shadow-2xl focus:outline-none", wide ? "max-w-3xl" : "max-w-lg", className)}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <RDialog.Title className="text-base font-semibold tracking-tight">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-1 text-sm text-ink-2">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RDialog.Description>}
            </div>
            <RDialog.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </RDialog.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Slide-over panel for details. */
export function Drawer({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <RDialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <RDialog.Title className="text-base font-semibold tracking-tight">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-1 text-sm text-ink-2">{description}</RDialog.Description> : <RDialog.Description className="sr-only">Details</RDialog.Description>}
            </div>
            <RDialog.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Popover({ trigger, children, className, align = "start" }: { trigger: React.ReactNode; children: React.ReactNode; className?: string; align?: "start" | "center" | "end" }) {
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align={align} sideOffset={6} collisionPadding={12} className={cn("z-50 w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-4 text-sm shadow-xl focus:outline-none", className)}>
          {children}
          <RPopover.Arrow className="fill-surface stroke-border" />
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

/** Small (i) button opening an explanatory popover. */
export function InfoPopover({ title, what, why, labels, children }: { title?: React.ReactNode; what?: React.ReactNode; why?: React.ReactNode; labels: { what: string; why: string }; children?: React.ReactNode }) {
  return (
    <Popover
      trigger={
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" aria-label="Info">
          <Info className="h-3.5 w-3.5" />
        </button>
      }
    >
      {title ? <div className="mb-2 font-semibold">{title}</div> : null}
      {what ? (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{labels.what}</div>
          <p className="leading-6 text-ink-2">{what}</p>
        </div>
      ) : null}
      {why ? (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{labels.why}</div>
          <p className="leading-6 text-ink-2">{why}</p>
        </div>
      ) : null}
      {children}
    </Popover>
  );
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <RTooltip.Provider delayDuration={200}>{children}</RTooltip.Provider>;
}
export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs leading-5 text-ink shadow-lg">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
