import Link from 'next/link'
import Image from 'next/image'
import type { StateContent } from '@/data/state-types'

// Deterministic hue from the state name — simple sum-of-char-codes mod 360.
// Produces a consistent per-state gradient when no real hero image exists.
function hueFromName(name: string): number {
  let sum = 0
  for (const ch of name) sum = (sum + ch.charCodeAt(0)) % 360
  return sum
}

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
        <div className="absolute inset-0 bg-black/35" aria-hidden />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center text-white px-6">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm md:text-base max-w-2xl">
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

  const hue = hueFromName(state.name)
  const gradient = `linear-gradient(135deg, hsl(${hue}, 55%, 28%) 0%, hsl(${(hue + 40) % 360}, 60%, 42%) 100%)`

  return (
    <section
      className="relative w-full h-[360px] md:h-[460px] overflow-hidden flex flex-col items-center justify-center text-center text-white px-6"
      style={{ background: gradient }}
    >
      <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm md:text-base max-w-2xl">
        Independent, documented vehicle appraisals and dispute-resolution services.
      </p>
      <Link
        href="/submitaclaim"
        className="mt-6 inline-block bg-[color:var(--color-accent)] hover:brightness-110 text-white font-semibold px-6 py-3 rounded-md"
      >
        Submit a Claim
      </Link>
    </section>
  )
}
