// Shared types for the States We Serve feature. Phase 1: non-legal content
// only. The legalSections / citations / verified fields exist in the type
// so Phase 2 can populate them additively without a type change.

export type ImageLicense = 'CC0' | 'CC-BY-4.0' | 'CC-BY-SA-4.0' | 'PD-US' | 'PD-US-no-notice'

export interface HeroImage {
  url: string                 // public path, e.g. "/states/nevada.jpg"
  sourcePageUrl: string       // Wikimedia Commons file-info page
  author: string
  license: ImageLicense
  attribution: string         // exact credit line to render
  verifiedAt: string          // ISO date YYYY-MM-DD, hand-written per state
}

export interface StateMeta {
  slug: string                // "nevada"
  name: string                // "Nevada"
  abbreviation: string        // "NV"
}

export interface StateContent extends StateMeta {
  heroImage: HeroImage | null
  intro: string               // 60-100 words, NON-LEGAL
  majorCities: string[]       // 2-5 cities named in intro
  relatedStates: string[]     // 4-6 neighbor slugs, hand-picked (MA/RI filtered at render time)
  seo: {
    title: string
    description: string       // 140-160 chars target
  }
  // Phase 2 placeholders — always null/false/empty in Phase 1
  legalSections: null
  citations: readonly never[]
  verified: false
  verifiedAt: null
  verifiedBy: null
}
