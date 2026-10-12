import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = 'inline-flex items-center justify-center h-10 px-5 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-2'
  const variants: Record<Variant, string> = {
    primary:   'bg-[color:var(--color-ink)] text-white hover:bg-black',
    secondary: 'bg-white text-[color:var(--color-ink)] border border-[color:var(--color-border-strong)] hover:border-[color:var(--color-ink)]',
    ghost:     'bg-transparent text-[color:var(--color-ink)] hover:bg-[color:var(--color-bg-subtle)]',
  }
  return <button type={type} className={cn(base, variants[variant], className)} {...rest} />
}
