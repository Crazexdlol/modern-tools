'use client'

import { useState } from 'react'
import { LOSS_OF_USE_FAQS } from '@/lib/loss-of-use-faqs'

type CategoryFilter =
  | 'all'
  | 'basics'
  | 'qualification'
  | 'calculation'
  | 'jurisdiction'
  | 'rental-class'
  | 'duration'
  | 'total-loss'
  | 'commercial'
  | 'household'
  | 'documentation'

const CATEGORY_LABELS: Record<string, string> = {
  basics: 'Basics',
  qualification: 'Qualification',
  calculation: 'Calculation',
  jurisdiction: 'Jurisdiction',
  'rental-class': 'Rental Class',
  duration: 'Duration',
  'total-loss': 'Total Loss',
  commercial: 'Commercial',
  household: 'Household',
  documentation: 'Documentation',
}

export function LossOfUseFaqSection() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all')

  const filteredFaqs =
    activeFilter === 'all'
      ? LOSS_OF_USE_FAQS
      : LOSS_OF_USE_FAQS.filter((faq) => faq.category === activeFilter)

  const categories = [
    'basics',
    'qualification',
    'calculation',
    'jurisdiction',
    'rental-class',
    'duration',
    'total-loss',
    'commercial',
    'household',
    'documentation',
  ] as const

  return (
    <section className="py-20 bg-[color:var(--color-bg)]">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)] mb-2">
            Frequently asked questions
          </h2>
          <p className="text-base text-[color:var(--color-ink-muted)]">
            Find answers to common loss of use questions from carriers, vehicle owners, and attorneys.
          </p>
        </div>

        {/* Category filters */}
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveFilter('all')}
            className={`inline-flex items-center h-9 px-4 rounded-sm text-sm font-medium transition-colors ${
              activeFilter === 'all'
                ? 'bg-[color:var(--color-accent)] text-white'
                : 'bg-[color:var(--color-bg-elevated)] text-[color:var(--color-ink)] border border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-subtle)]'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`inline-flex items-center h-9 px-4 rounded-sm text-sm font-medium transition-colors ${
                activeFilter === cat
                  ? 'bg-[color:var(--color-accent)] text-white'
                  : 'bg-[color:var(--color-bg-elevated)] text-[color:var(--color-ink)] border border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-subtle)]'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* FAQ list */}
        <div className="space-y-3">
          {filteredFaqs.map((faq) => (
            <FaqItem
              key={faq.id}
              faq={faq}
              isExpanded={expandedId === faq.id}
              onToggle={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
            />
          ))}
        </div>

        {filteredFaqs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[color:var(--color-ink-muted)]">No FAQs found in this category.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function FaqItem({
  faq,
  isExpanded,
  onToggle,
}: {
  faq: (typeof LOSS_OF_USE_FAQS)[0]
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-[color:var(--color-bg-subtle)] transition-colors flex items-start justify-between gap-3"
      >
        <span className="text-sm font-semibold text-[color:var(--color-ink)]">{faq.question}</span>
        <svg
          className={`w-5 h-5 text-[color:var(--color-ink-muted)] shrink-0 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-5 py-4 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
          <p className="text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{faq.answer}</p>
        </div>
      )}
    </div>
  )
}
