import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-york',
  name: 'New York',
  abbreviation: 'NY',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters across New York — from the five boroughs of New York City and Long Island out to Buffalo, Rochester, Syracuse, Albany, and the Hudson Valley. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, exotic, and commercial vehicles. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse'],
  relatedStates: ['vermont', 'connecticut', 'new-jersey', 'pennsylvania'],
  seo: {
    title: 'Auto Appraisal Services in New York | Modern Appraisers',
    description: 'Independent vehicle appraisals in New York. ACV, diminished value, cost-of-repair, and appraisal clause support — NYC, Buffalo, Rochester, Albany, Syracuse.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
