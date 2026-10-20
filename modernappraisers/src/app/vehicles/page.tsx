import Link from 'next/link'
import { Container } from '@/components/container'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Property Types | Modern Appraisers',
  description: 'Modern Appraisers handles valuations and dispute resolution across every vehicle class: passenger vehicles, commercial trucks, trailers, marine vessels, exotic / luxury automobiles, motorcycles, RVs, buses, and specialty equipment.',
}

interface VehicleType {
  slug: string
  title: string
  sub: string
  body: string
  img: string
}

const VEHICLES: VehicleType[] = [
  {
    slug: 'passenger',
    title: 'Passenger Vehicles',
    sub: 'Sedans, SUVs, crossovers, hatchbacks',
    body: 'Everyday automobiles from economy sedans through full-size SUVs. The largest category of claims we handle, covering total loss ACV, diminished value, and cost-of-repair disputes.',
    img: '/vehicles/cars.jpg',
  },
  {
    slug: 'commercial-trucks',
    title: 'Commercial Trucks',
    sub: 'Semis, box trucks, heavy-duty pickups',
    body: 'Fleet and owner-operator commercial vehicles. ACV + loss-of-use calculations account for revenue downtime, specialized equipment, and commercial-grade valuation methodology.',
    img: '/vehicles/trucks.jpg',
  },
  {
    slug: 'trailers',
    title: 'Trailers',
    sub: 'Utility, cargo, travel trailers',
    body: 'Towed vehicles across every class. Common disputes involve storage charges, cargo-interior damage, and ACV on specialty or custom-built units.',
    img: '/vehicles/trailers.jpg',
  },
  {
    slug: 'marine',
    title: 'Marine',
    sub: 'Boats, yachts, personal watercraft',
    body: 'Marine vessels of every class, from PWCs through yachts. Valuation methodology adapts to the marine market, with comparables pulled from marine-specific sales channels.',
    img: '/vehicles/marine.jpg',
  },
  {
    slug: 'exotic',
    title: 'Exotic & Luxury',
    sub: 'Supercars, limited-production, premium',
    body: 'Ferrari, Lamborghini, Porsche, high-end BMW / Mercedes, limited-production vehicles. Standard valuation formulas break down for this class, market-based comparables research is critical.',
    img: '/vehicles/exotic.jpg',
  },
  {
    slug: 'classics',
    title: 'Classics',
    sub: 'Vintage, antique, muscle cars',
    body: 'Pre-1990s vintage, antique, and muscle cars. Valuation requires specialty-market research (Hagerty, Mecum, Barrett-Jackson comps), condition grading, and documented restoration history.',
    img: '/vehicles/classics.jpg',
  },
  {
    slug: 'motorcycles',
    title: 'Motorcycles',
    sub: 'Sport bikes, cruisers, touring, dual-sport',
    body: 'Motorcycle valuations require model-specific comp research. We handle total-loss ACV, DV, and cost-of-repair disputes across every motorcycle class.',
    img: '/vehicles/motorcycles.jpg',
  },
  {
    slug: 'rvs',
    title: 'RVs',
    sub: 'Class A, B, C motorhomes',
    body: 'Recreational vehicle valuations require specialty comp research and attention to interior build-out, mileage, and condition. We handle Class A, B, and C motorhomes.',
    img: '/vehicles/rvs.jpg',
  },
  {
    slug: 'buses',
    title: 'Buses',
    sub: 'City, school, coach, shuttle',
    body: 'Bus valuations for city transit, school districts, charter fleets, and shuttle operators. Specialized methodology for commercial-passenger vehicles.',
    img: '/vehicles/buses.webp',
  },
  {
    slug: 'specialty-equipment',
    title: 'Specialty Equipment',
    sub: 'Construction, farm, industrial',
    body: 'Excavators, loaders, forklifts, farm equipment, and industrial machinery. Valuation methodology adapts to the specialized equipment market and insurance context.',
    img: '/vehicles/equipment.jpg',
  },
]

export default function VehiclesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-12 sm:pt-20 pb-10 sm:pb-16 bg-[color:var(--color-bg)]">
        <Container>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-accent)] mb-4 sm:mb-5">
              Property Types
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-[color:var(--color-ink)] leading-[1.02]">
              If it has a value, we <span className="whitespace-nowrap">handle it.</span>
            </h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-lg leading-relaxed text-[color:var(--color-ink-muted)]">
              From daily drivers to commercial fleets to specialty equipment. We handle every loss type.
            </p>
          </div>
        </Container>
      </section>

      {/* 9-tile grid — denser now (4 cols on lg, 5 on xl) so tiles stay
          compact and the full set fits the viewport without big scroll. */}
      <section className="py-14 bg-[color:var(--color-bg)]">
        <Container>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {VEHICLES.map(v => (
              <VehicleTile key={v.slug} vehicle={v} />
            ))}
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[color:var(--color-bg-subtle)] border-t border-[color:var(--color-border)]">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[color:var(--color-ink)]">
              Different class of vehicle?
            </h2>
            <p className="mt-4 text-base text-[color:var(--color-ink-muted)]">
              Not sure if we handle your vehicle class? Call or submit the claim and we&apos;ll confirm within one business day.
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

function VehicleTile({ vehicle }: { vehicle: VehicleType }) {
  return (
    <article className="group bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-sm overflow-hidden hover:border-[color:var(--color-accent)] transition-colors">
      <div className="relative aspect-[2/1] bg-[color:var(--color-bg)] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={vehicle.img}
          alt={vehicle.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[color:var(--color-bg-elevated)] to-transparent pointer-events-none" />
      </div>
      <div className="p-3">
        <h3 className="text-sm font-bold text-[color:var(--color-ink)] leading-snug">{vehicle.title}</h3>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-accent)] truncate">{vehicle.sub}</p>
      </div>
    </article>
  )
}
