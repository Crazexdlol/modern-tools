import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { STATES } from '@/data/states/_index'
import { StatePage } from '@/components/states/state-page'

export async function generateStaticParams() {
  return STATES.map(s => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  if (!STATES.some(s => s.slug === slug)) return { title: 'State not found' }
  const mod = await import(`@/data/states/${slug}`)
  const content = mod.default
  return {
    title: content.seo.title,
    description: content.seo.description,
    alternates: { canonical: `/states/${slug}` },
  }
}

export default async function StatePageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!STATES.some(s => s.slug === slug)) notFound()
  const mod = await import(`@/data/states/${slug}`)
  return <StatePage state={mod.default} />
}
