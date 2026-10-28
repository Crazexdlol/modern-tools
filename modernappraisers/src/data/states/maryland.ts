import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'maryland',
  name: 'Maryland',
  abbreviation: 'MD',
  heroImage: null,
  intro:
    "Baltimore, the DC commuter belt around Silver Spring and Germantown, and Chesapeake coastal counties all generate serious claims volume. Modern Appraisers handles Maryland work across the state, including Columbia and Annapolis plus the Eastern Shore communities. We produce total loss ACV, diminished value documentation, cost of repair reviews, and valuations covering classics, specialty units, and commercial vehicles. Written appraisals that carry weight in appraisal clause proceedings and settlement conversations.",
  majorCities: ['Baltimore', 'Columbia', 'Germantown', 'Silver Spring', 'Annapolis'],
  relatedStates: ['pennsylvania', 'delaware', 'virginia', 'west-virginia'],
  seo: {
    title: 'Auto Appraisal Services in Maryland | Modern Appraisers',
    description: 'Independent vehicle appraisals in Maryland. ACV, diminished value, cost of repair, and appraisal clause support in Baltimore, Columbia, Silver Spring, Annapolis.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
