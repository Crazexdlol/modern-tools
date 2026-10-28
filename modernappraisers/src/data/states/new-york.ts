import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-york',
  name: 'New York',
  abbreviation: 'NY',
  heroImage: null,
  intro:
    "New York runs two totally different claims markets: NYC and the five boroughs, and everything else — Buffalo, Rochester, Syracuse, Albany, the Hudson Valley, and the Finger Lakes. Modern Appraisers works both. Our scope includes total loss ACV, diminished value documentation after repairs, cost of repair reviews when the estimate and the carrier's offer don't match, and valuations covering classics, exotics, specialty, and commercial vehicles. The written appraisals we produce are built to carry in appraisal clause and settlement work.",
  majorCities: ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse'],
  relatedStates: ['vermont', 'connecticut', 'new-jersey', 'pennsylvania'],
  seo: {
    title: 'Auto Appraisal Services in New York | Modern Appraisers',
    description: 'Independent vehicle appraisals in New York. ACV, diminished value, cost of repair, and appraisal clause support in NYC, Buffalo, Rochester, Albany, Syracuse.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
