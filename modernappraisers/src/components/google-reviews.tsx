import { Container } from '@/components/container'

function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

// Google Reviews section for the home page. Currently in empty-state mode
// because Modern Appraisers' Google Business Profile hasn't been set up yet.
//
// To go live with real reviews:
//   1. Set up Google Business Profile at business.google.com
//   2. Get the Place ID from https://developers.google.com/maps/documentation/places/web-service/place-id
//   3. Replace GOOGLE_WRITE_REVIEW_URL and GOOGLE_PROFILE_URL below with the real URLs
//   4. (Optional, later) wire Google Places API to auto-pull reviews into REVIEWS array
//
// Once reviews start coming in, hand-add them to the REVIEWS array below.

interface Review {
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  text: string
  date: string  // e.g. "2 months ago"
}

const REVIEWS: Review[] = [
  // Add real reviews here as they come in, e.g.:
  // { author: 'Jane D.', rating: 5, text: 'Fast, thorough, defensible report.', date: '1 month ago' },
]

// Placeholder until a Google Business Profile exists. Google will route users
// to the Modern Appraisers listing if/when it exists; otherwise it falls
// through to a generic search. Swap for the real write-review URL once GBP
// is live: https://search.google.com/local/writereview?placeid=<PLACE_ID>
const GOOGLE_WRITE_REVIEW_URL = 'https://www.google.com/search?q=Modern+Appraisers+Las+Vegas+reviews'
const GOOGLE_PROFILE_URL = 'https://www.google.com/search?q=Modern+Appraisers+Las+Vegas'

export function GoogleReviews() {
  const hasReviews = REVIEWS.length > 0
  const averageRating = hasReviews
    ? REVIEWS.reduce((sum, r) => sum + r.rating, 0) / REVIEWS.length
    : 0

  return (
    <section className="py-14 sm:py-20 bg-[color:var(--color-bg)]">
      <Container>
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
            Client Reviews
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[color:var(--color-ink)] leading-[1.1]">
            What our clients say
          </h2>

          {hasReviews ? (
            <>
              <div className="mt-5 flex items-center justify-center gap-3">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${i <= Math.round(averageRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`}
                    />
                  ))}
                </div>
                <span className="text-base font-semibold text-[color:var(--color-ink)]">
                  {averageRating.toFixed(1)} on Google &middot; {REVIEWS.length} review{REVIEWS.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
                {REVIEWS.slice(0, 3).map((r, i) => (
                  <div key={i} className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm p-6">
                    <div className="flex items-center gap-0.5 mb-3">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`}
                        />
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed text-[color:var(--color-ink)]">&ldquo;{r.text}&rdquo;</p>
                    <p className="mt-4 text-xs text-[color:var(--color-ink-muted)]">
                      <span className="font-semibold text-[color:var(--color-ink)]">{r.author}</span> &middot; {r.date}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
                <a
                  href={GOOGLE_PROFILE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-11 px-6 rounded-sm border-2 border-[color:var(--color-accent)] text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)] hover:text-white transition-colors"
                >
                  See all reviews on Google
                </a>
                <a
                  href={GOOGLE_WRITE_REVIEW_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-11 px-6 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] transition-colors"
                >
                  Leave a review
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="mt-6 text-base leading-relaxed text-[color:var(--color-ink-muted)] max-w-2xl mx-auto">
                We&apos;re building our Google reviews one client at a time. If we&apos;ve worked with you,
                a short review goes a long way in helping other claimants find independent, defensible representation.
              </p>
              <div className="mt-8">
                <a
                  href={GOOGLE_WRITE_REVIEW_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-12 px-7 rounded-sm bg-[color:var(--color-accent)] text-white text-sm font-semibold hover:bg-[color:var(--color-accent-ink)] transition-colors"
                >
                  Leave a Google review
                </a>
              </div>
            </>
          )}
        </div>
      </Container>
    </section>
  )
}
