import Link from 'next/link'
import type { StateMeta } from '@/data/state-types'

export function StateCard({ state }: { state: StateMeta }) {
  return (
    <Link
      href={`/states/${state.slug}`}
      className="block rounded-lg border border-black/10 hover:border-[color:var(--color-accent)] p-4 transition-colors bg-white"
    >
      <div className="text-xs font-semibold text-[color:var(--color-ink-muted)] mb-1">{state.abbreviation}</div>
      <div className="text-base font-semibold text-[color:var(--color-ink)]">{state.name}</div>
    </Link>
  )
}
