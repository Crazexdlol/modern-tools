import { cn } from '@/lib/cn'

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full min-h-[96px] px-3 py-2 rounded-md bg-white border border-[color:var(--color-border-strong)] text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-soft)] resize-y',
        'focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]',
        className,
      )}
      {...rest}
    />
  )
}
