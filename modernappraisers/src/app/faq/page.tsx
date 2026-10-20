import { Container } from '@/components/container'
import { FaqBrowser } from './_faq-browser'
import { FAQS } from '@/lib/faq-content'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'FAQ | Modern Appraisers',
  description: '400+ answers covering insurance basics, first-party vs third-party claims, Actual Cash Value, Diminished Value, Cost of Repair disputes, Loss of Use, Storage charges, and commercial-vehicle appraisals.',
}

// Google deprecated most FAQPage rich-result rendering in Aug 2023, but the
// schema is still parsed by Google (for the narrow surface area where they
// do still show it), by Bing, and by every AI answer engine (ChatGPT,
// Perplexity, AI Overviews). Including it is zero-downside.
//
// We serialize the full FAQ set into FAQPage JSON-LD so the crawler sees
// every Q&A even if the user never clicks a tab.

export default function FaqPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  }

  return (
    <main>
      {/* JSON-LD structured data for search engines + AI answer engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {/* Hero, centered */}
      <section className="pt-12 sm:pt-20 pb-8 sm:pb-10 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] text-[color:var(--color-accent)]">
              Frequently Asked Questions
            </h1>
          </div>
        </Container>
      </section>

      {/* Interactive FAQ browser (client component) */}
      <section className="py-10 sm:py-16 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-5xl mx-auto">
            <FaqBrowser faqs={FAQS} />
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">
              Didn&apos;t find your answer?
            </h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">
              Call us or submit the claim and we&apos;ll follow up within one business day with specifics on your claim.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/submitaclaim" className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)]">Submit a Claim</Link>
              <a href="tel:+17023215930" className="inline-flex items-center h-12 px-7 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors">Call (702) 321-5930</a>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}
