import { cn } from '@/lib/cn'

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full h-10 px-3 rounded-md bg-white border border-[color:var(--color-border-strong)] text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-soft)]',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]',
        className,
      )}
      {...rest}
    />
  )
}
