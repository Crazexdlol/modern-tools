import { cn } from '@/lib/cn'

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full h-10 px-3 rounded-md bg-white border border-[color:var(--color-border-strong)] text-sm text-[color:var(--color-ink)]',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}
