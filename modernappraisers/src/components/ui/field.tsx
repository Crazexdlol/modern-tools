import { cn } from '@/lib/cn'

export function Field({ label, hint, error, children, required, className }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-sm font-semibold text-[color:var(--color-ink)] mb-1.5">
        {label}{required && <span className="text-[color:var(--color-danger)] ml-0.5">*</span>}
      </span>
      {children}
      {hint && !error && <span className="block mt-1 text-xs text-[color:var(--color-ink-soft)]">{hint}</span>}
      {error && <span className="block mt-1 text-xs text-[color:var(--color-danger)]">{error}</span>}
    </label>
  )
}
