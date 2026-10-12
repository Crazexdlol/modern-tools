import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'danger'

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-[color:var(--color-bg-subtle)] text-[color:var(--color-ink-muted)] border-[color:var(--color-border)]',
    accent:  'bg-sky-50 text-[color:var(--color-accent-ink)] border-sky-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    danger:  'bg-red-50 text-red-800 border-red-200',
  }
  return <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full border text-xs font-semibold', tones[tone], className)}>{children}</span>
}
