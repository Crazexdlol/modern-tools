import { cn } from '@/lib/cn'

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('w-full px-5 sm:px-8 md:px-12 lg:px-16', className)}>{children}</div>
}
