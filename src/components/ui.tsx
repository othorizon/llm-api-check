import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { classNames } from '../lib/util'
import { Icon, type IconName } from './icons'
import type { CheckStatus } from '../lib/types'

/* ------------------------------- 状态 ------------------------------- */

const STATUS_META: Record<CheckStatus, { label: string; tone: string; icon: IconName; dot: string }> = {
  pass: { label: '支持', tone: 'text-ok bg-ok/10 border-ok/25', icon: 'check', dot: 'bg-ok' },
  partial: { label: '部分支持', tone: 'text-warn bg-warn/10 border-warn/25', icon: 'alert', dot: 'bg-warn' },
  fail: { label: '未通过', tone: 'text-bad bg-bad/10 border-bad/25', icon: 'x', dot: 'bg-bad' },
  unsupported: { label: '不支持', tone: 'text-muted bg-raised border-line', icon: 'minus', dot: 'bg-faint' },
  error: { label: '出错', tone: 'text-bad bg-bad/10 border-bad/25', icon: 'alert', dot: 'bg-bad' },
  skipped: { label: '已跳过', tone: 'text-faint bg-raised border-line', icon: 'minus', dot: 'bg-faint' },
  running: { label: '进行中', tone: 'text-info bg-info/10 border-info/25', icon: 'clock', dot: 'bg-info' },
  pending: { label: '等待中', tone: 'text-faint bg-raised border-line', icon: 'clock', dot: 'bg-faint' },
}

export function StatusPill({ status, size = 'md' }: { status: CheckStatus; size?: 'sm' | 'md' }) {
  const m = STATUS_META[status]
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap',
        m.tone,
        size === 'sm' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs',
        status === 'running' && 'animate-pulse',
      )}
    >
      <Icon name={m.icon} size={size === 'sm' ? 11 : 12} strokeWidth={2.4} />
      {m.label}
    </span>
  )
}

export function StatusDot({ status, title }: { status: CheckStatus; title?: string }) {
  const m = STATUS_META[status]
  return (
    <span
      title={title ?? m.label}
      className={classNames('inline-block h-2 w-2 rounded-full', m.dot, status === 'running' && 'animate-pulse')}
    />
  )
}

/* ------------------------------- 按钮 ------------------------------- */

type ButtonProps = {
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  children?: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ variant = 'ghost', size = 'md', icon, children, className, ...rest }: ButtonProps) {
  return (
    <button
      className={classNames(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'subtle' && 'btn-subtle',
        variant === 'danger' && 'btn-danger',
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'btn-lg',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  )
}

/* ------------------------------- 表单 ------------------------------- */

export function Field({
  label, hint, children, required, action,
}: { label: string; hint?: ReactNode; children: ReactNode; required?: boolean; action?: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">
          {label}
          {required && <span className="text-bad ml-0.5">*</span>}
        </span>
        {action}
      </div>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Toggle({
  checked, onChange, label, hint, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={classNames('flex items-start gap-3', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={classNames(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-line',
        )}
      >
        <span
          className={classNames(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-ink leading-5">{label}</span>
        {hint && <span className="block text-xs text-faint mt-0.5 leading-relaxed">{hint}</span>}
      </span>
    </label>
  )
}

export function Checkbox({
  checked, indeterminate, onChange, label, disabled,
}: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <label className={classNames('inline-flex items-center gap-2', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[15px] w-[15px] rounded border-line text-brand focus:ring-brand/30 focus:ring-2 accent-[rgb(var(--c-brand))]"
      />
      {label && <span className="text-sm text-ink select-none">{label}</span>}
    </label>
  )
}

/* ------------------------------- 弹层 ------------------------------- */

export function Modal({
  open, onClose, title, children, footer, width = 'max-w-2xl',
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className={classNames('relative w-full card shadow-pop animate-fade-in my-auto', width)}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} className="btn btn-subtle btn-sm -mr-1" aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open, onClose, title, subtitle, children,
}: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[min(680px,100vw)] bg-surface border-l border-line shadow-pop flex flex-col animate-slide-in">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold truncate">{title}</h2>
            {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="btn btn-subtle btn-sm -mr-1 shrink-0" aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

/** 点击触发的浮层，用于术语解释 */
export function Popover({
  trigger, children, width = 380, label,
}: { trigger?: ReactNode; children: ReactNode; width?: number; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const w = Math.min(width, window.innerWidth - 24)
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12))
    const below = window.innerHeight - r.bottom
    const top = below > 260 ? r.bottom + 8 : Math.max(12, r.top - 8 - Math.min(360, below + r.height))
    setPos({ top, left })
  }, [width])

  useLayoutEffect(() => {
    if (!open) return
    place()
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if ((t as HTMLElement)?.closest?.(`[data-pop="${id}"]`)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, id])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label ?? '查看说明'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={classNames(
          'inline-flex items-center justify-center rounded text-faint hover:text-brand transition-colors align-middle',
          open && 'text-brand',
        )}
      >
        {trigger ?? <Icon name="info" size={14} />}
      </button>
      {open && pos
        ? createPortal(
            <div
              data-pop={id}
              role="dialog"
              style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 24) }}
              className="fixed z-[60] card shadow-pop p-4 max-h-[min(420px,70vh)] overflow-y-auto animate-fade-in"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/* ------------------------------- 其它 ------------------------------- */

export function EmptyState({
  icon = 'layers', title, desc, action,
}: { icon?: IconName; title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-raised text-faint">
        <Icon name={icon} size={20} />
      </div>
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        {desc && <div className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">{desc}</div>}
      </div>
      {action}
    </div>
  )
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={classNames('btn btn-subtle btn-sm', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        } catch { /* clipboard 不可用 */ }
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={13} />
      {done ? '已复制' : '复制'}
    </button>
  )
}

/* ------------------------------- Toast ------------------------------ */

interface ToastItem { id: string; text: string; tone: 'ok' | 'bad' | 'info' }
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setItems((v) => [...v, { id, text, tone }])
    setTimeout(() => setItems((v) => v.filter((i) => i.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            className={classNames(
              'pointer-events-auto w-full rounded-lg border px-3.5 py-2.5 text-[13px] shadow-pop animate-fade-in bg-surface',
              i.tone === 'ok' && 'border-ok/30 text-ok',
              i.tone === 'bad' && 'border-bad/30 text-bad',
              i.tone === 'info' && 'border-line text-ink',
            )}
          >
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
