import Link from 'next/link'
import Image from 'next/image'
import type { StateContent } from '@/data/state-types'

export function StateHero({ state }: { state: StateContent }) {
  const title = `Auto Appraisal Services in ${state.name}`

  if (state.heroImage) {
    return (
      <section className="relative w-full h-[360px] md:h-[460px] overflow-hidden">
        <Image
          src={state.heroImage.url}
          alt={`${state.name} landscape`}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/50" aria-hidden />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center text-white px-6">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm md:text-base max-w-2xl text-white/80">
            Independent, documented vehicle appraisals and dispute-resolution services.
          </p>
          <Link
            href="/submitaclaim"
            className="mt-6 inline-block bg-[color:var(--color-accent)] hover:brightness-110 text-white font-semibold px-6 py-3 rounded-md"
          >
            Submit a Claim
          </Link>
        </div>
      </section>
    )
  }

  // Dark placeholder hero. Matches the site's dark theme consistently rather
  // than inventing random per-state hues. Pending Phase 2 pilot photos.
  return (
    <section className="relative w-full h-[360px] md:h-[460px] overflow-hidden flex flex-col items-center justify-center text-center text-white px-6 bg-[color:var(--color-bg)]">
      <div
        className="absolute inset-0 opacity-70"
        aria-hidden
        style={{
          background:
            'radial-gradient(circle at 20% 30%, rgba(37,99,235,0.25), transparent 55%), radial-gradient(circle at 85% 70%, rgba(37,99,235,0.18), transparent 60%), linear-gradient(180deg, #0a0a0a 0%, #141414 100%)',
        }}
      />
      <div className="relative z-10 flex flex-col items-center">
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm md:text-base max-w-2xl text-white/70">
          Independent, documented vehicle appraisals and dispute-resolution services.
        </p>
        <Link
          href="/submitaclaim"
          className="mt-6 inline-block bg-[color:var(--color-accent)] hover:brightness-110 text-white font-semibold px-6 py-3 rounded-md"
        >
          Submit a Claim
        </Link>
      </div>
    </section>
  )
}
