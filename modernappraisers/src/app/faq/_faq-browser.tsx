'use client'
import { useMemo, useState } from 'react'
import type { FaqEntry, FaqTopic } from '@/lib/faq-content'
import { TOPIC_LABELS, TOPIC_ORDER } from '@/lib/faq-content'

// Client-side FAQ browser:
// - Primary row: All + 5 topics + Other (Other = basics + commercial, no sub-filters)
// - Free-text search across question + answer
// - Collapsible accordion per entry
// - Deep-link friendly: #faq-xyz expands that entry on load

// Topics surfaced in the primary row. Everything else collapses into "Other".
const PRIMARY_TOPICS: FaqTopic[] = ['acv', 'dv', 'cost-of-repair', 'loss-of-use', 'storage']
const OTHER_TOPICS: FaqTopic[] = TOPIC_ORDER.filter(t => !PRIMARY_TOPICS.includes(t))

type ActiveFilter = FaqTopic | 'all' | 'other'

export function FaqBrowser({ faqs }: { faqs: FaqEntry[] }) {
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const otherCount = faqs.filter(f => OTHER_TOPICS.includes(f.topic)).length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return faqs.filter(f => {
      if (activeFilter === 'other') {
        if (!OTHER_TOPICS.includes(f.topic)) return false
      } else if (activeFilter !== 'all' && f.topic !== activeFilter) return false
      if (!q) return true
      return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    })
  }, [faqs, activeFilter, query])

  // Group filtered results by topic for scannability. 'all' groups across
  // every topic, 'other' groups across just the hidden topics, a single
  // topic filter yields a single section.
  const groups = useMemo(() => {
    if (activeFilter === 'all') {
      return TOPIC_ORDER
        .map(topic => ({ topic, items: filtered.filter(f => f.topic === topic) }))
        .filter(g => g.items.length > 0)
    }
    if (activeFilter === 'other') {
      return OTHER_TOPICS
        .map(topic => ({ topic, items: filtered.filter(f => f.topic === topic) }))
        .filter(g => g.items.length > 0)
    }
    return [{ topic: activeFilter, items: filtered }]
  }, [filtered, activeFilter])

  return (
    <div>
      {/* Filter row: All + 5 primary topics + Other (Other filters to
          everything not in the primary set, no sub-buttons). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        <TopicCard
          active={activeFilter === 'all'}
          label="All Topics"
          count={faqs.length}
          onClick={() => setActiveFilter('all')}
        />
        {PRIMARY_TOPICS.map(topic => {
          const count = faqs.filter(f => f.topic === topic).length
          const active = activeFilter === topic
          return (
            <TopicCard
              key={topic}
              active={active}
              label={TOPIC_LABELS[topic]}
              count={count}
              onClick={() => setActiveFilter(active ? 'all' : topic)}
            />
          )
        })}
        <TopicCard
          active={activeFilter === 'other'}
          label="Other"
          count={otherCount}
          onClick={() => setActiveFilter(activeFilter === 'other' ? 'all' : 'other')}
        />
      </div>

      {/* Search input */}
      <div className="relative mb-8">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search questions and answers…"
          className="w-full h-12 pl-11 pr-4 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/40 focus:border-[color:var(--color-accent)]"
        />
        <svg
          viewBox="0 0 24 24"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[color:var(--color-ink-soft)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-[color:var(--color-ink-muted)] text-sm">
          No questions match your search. Try broader terms or switch tabs.
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(group => (
            <div key={group.topic} id={`topic-${group.topic}`}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4">
                {TOPIC_LABELS[group.topic]} <span className="text-[color:var(--color-ink-soft)]">· {group.items.length}</span>
              </h2>
              <div className="space-y-2">
                {group.items.map(item => (
                  <FaqRow
                    key={item.id}
                    item={item}
                    open={openId === item.id}
                    onToggle={() => setOpenId(prev => (prev === item.id ? null : item.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TopicCard({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'block rounded-sm px-5 py-5 text-center bg-[color:var(--color-accent)] border-2 border-[color:var(--color-accent)] transition-colors'
          : 'block rounded-sm px-5 py-5 text-center bg-[color:var(--color-bg-elevated)] border-2 border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors'
      }
    >
      <div className={active ? 'text-3xl font-bold tracking-tight text-white tabular-nums leading-none' : 'text-3xl font-bold tracking-tight text-[color:var(--color-accent)] tabular-nums leading-none'}>{count}</div>
      <div className={active ? 'mt-2 text-xs font-semibold text-white leading-tight' : 'mt-2 text-xs font-semibold text-[color:var(--color-ink)] leading-tight'}>{label}</div>
    </button>
  )
}

function FaqRow({ item, open, onToggle }: { item: FaqEntry; open: boolean; onToggle: () => void }) {
  return (
    <article
      id={item.id}
      className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm overflow-hidden scroll-mt-24"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-6 text-left p-5 hover:bg-[color:var(--color-bg-subtle)] transition-colors"
        aria-expanded={open}
      >
        <h3 className="text-base font-semibold text-[color:var(--color-ink)] leading-snug">{item.question}</h3>
        <svg
          viewBox="0 0 24 24"
          className={`shrink-0 w-5 h-5 text-[color:var(--color-accent)] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
          {item.answer}
        </div>
      )}
    </article>
  )
}
