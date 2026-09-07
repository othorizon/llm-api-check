import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Field({ label, hint, error, children, className, htmlFor, right }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string; right?: React.ReactNode }) {
  const autoId = React.useId();
  // Associate the label with the first form control child unless an explicit id is given.
  let controlId = htmlFor;
  const kids = React.Children.toArray(children);
  const rendered = kids.map((child, i) => {
    if (controlId || !React.isValidElement(child)) return child;
    const el = child as React.ReactElement<{ id?: string }>;
    if (i === 0 && (el.type === Input || el.type === Select || el.type === Textarea || typeof el.type === "string")) {
      controlId = el.props.id ?? autoId;
      return el.props.id ? el : React.cloneElement(el, { id: controlId });
    }
    return child;
  });
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={controlId ?? autoId} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {right}
      </div>
      {rendered}
      {error ? <p className="text-xs text-critical-ink">{error}</p> : hint ? <p className="text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase = "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputBase, "h-9", className)} {...props} />;
});
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputBase, "min-h-[80px] leading-6", className)} {...props} />;
});
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23898781%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8", className)} {...props}>
      {children}
    </select>
  );
});
