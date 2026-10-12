import { cn } from '@/lib/cn'

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn('bg-white border border-[color:var(--color-border)] rounded-[10px] shadow-[0_1px_2px_rgb(0_0_0_/_0.05)]', className)} {...rest} />
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...rest} />
}
