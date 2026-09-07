import { Checkbox as RCheckbox, Switch as RSwitch } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import * as React from "react";

export function Switch({ checked, onCheckedChange, id, disabled, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean; className?: string }) {
  return (
    <RSwitch.Root id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} className={cn("relative h-5 w-9 shrink-0 rounded-full border border-transparent bg-border-strong transition-colors data-[state=checked]:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50", className)}>
      <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
}

export function Checkbox({ checked, onCheckedChange, id, disabled, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean; className?: string }) {
  return (
    <RCheckbox.Root id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onCheckedChange(v === true)} className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-strong bg-surface data-[state=checked]:border-ink data-[state=checked]:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50", className)}>
      <RCheckbox.Indicator>
        <Check className="h-3 w-3 text-bg" strokeWidth={3} />
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
}

export function CheckRow({ checked, onCheckedChange, label, hint, disabled, right }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean; right?: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className={cn("flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2", disabled && "opacity-60")}>
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
      <label htmlFor={id} className="flex-1 cursor-pointer select-none">
        <div className="text-sm font-medium leading-5">{label}</div>
        {hint ? <div className="text-xs leading-5 text-muted">{hint}</div> : null}
      </label>
      {right}
    </div>
  );
}
