// Scrolling marquee of insurance carrier logos used to display the firm's
// client base. Pure CSS animation (no JS) — the logos list is rendered twice
// back-to-back, and the track is translated -50% over the loop duration so
// the second copy slides into view just as the first copy exits. Pauses on
// hover so a visitor can read a specific logo.

import { Container } from './container'

interface Carrier {
  name: string
  file: string
  // Per-logo size tuning. Some logos (GEICO wordmark) read best wider; some
  // (AAA badge) read best as a square. Height is uniform via the row's h-10
  // class — this adjusts the horizontal padding each slot occupies.
  slotClass?: string
}

const CARRIERS: Carrier[] = [
  { name: 'GEICO',             file: '/logos/insurance/geico.png',             slotClass: 'w-28' },
  { name: 'State Farm',        file: '/logos/insurance/state-farm.png',        slotClass: 'w-32' },
  { name: 'Allstate',          file: '/logos/insurance/allstate.png',          slotClass: 'w-36' },
  { name: 'Progressive',       file: '/logos/insurance/progressive.svg',       slotClass: 'w-36' },
  { name: 'The Hartford',      file: '/logos/insurance/hartford.svg',          slotClass: 'w-32' },
  { name: 'AAA',               file: '/logos/insurance/aaa.png',               slotClass: 'w-20' },
  { name: 'Travelers',         file: '/logos/insurance/travelers.png',         slotClass: 'w-32' },
  { name: 'Country Financial', file: '/logos/insurance/country-financial.png', slotClass: 'w-32' },
  { name: 'Westfield',         file: '/logos/insurance/westfield.png',         slotClass: 'w-32' },
  { name: 'First Chicago',     file: '/logos/insurance/first-chicago.png',     slotClass: 'w-28' },
  { name: 'Bluefire',          file: '/logos/insurance/bluefire.png',          slotClass: 'w-28' },
  { name: 'Bristol West',      file: '/logos/insurance/bristol-west.png',      slotClass: 'w-16' },
]

export function CarriersMarquee() {
  return (
    <section className="py-8 bg-[color:var(--color-bg-subtle)] border-y border-[color:var(--color-border)]">
      <Container>
        <div className="text-center mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-[color:var(--color-ink)]">
            Trusted across the industry
          </h2>
        </div>
      </Container>

      {/* The marquee itself is full-bleed (outside the Container) so the row
          runs edge-to-edge of the viewport. */}
      <div className="group relative overflow-hidden">
        {/* Edge fades so logos melt into the section background on both sides */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[color:var(--color-bg-subtle)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[color:var(--color-bg-subtle)] to-transparent" />

        <div className="flex w-max animate-carriers-marquee group-hover:[animation-play-state:paused]">
          {/* Render the list twice back-to-back. The animation translates
              -50% over the loop, so the second copy is exactly where the
              first one started — the hand-off is invisible. */}
          <MarqueeRow />
          <MarqueeRow />
        </div>
      </div>
    </section>
  )
}

function MarqueeRow() {
  return (
    <ul className="flex shrink-0 items-center gap-14 pr-14" aria-hidden={false}>
      {CARRIERS.map(c => (
        <li
          key={c.name}
          className={`${c.slotClass ?? 'w-28'} flex items-center justify-center shrink-0`}
          title={c.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.file}
            alt={c.name}
            className="h-8 w-auto max-w-full object-contain opacity-80 hover:opacity-100 transition-opacity"
            loading="lazy"
          />
        </li>
      ))}
    </ul>
  )
}
