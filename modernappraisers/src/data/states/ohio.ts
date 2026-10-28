import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'ohio',
  name: 'Ohio',
  abbreviation: 'OH',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters across Ohio — Columbus, Cleveland, Cincinnati, Toledo, Akron, Dayton, and the smaller markets throughout the state. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair reviews for disputed estimates, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals in appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  relatedStates: ['michigan', 'indiana', 'kentucky', 'west-virginia', 'pennsylvania'],
  seo: {
    title: 'Auto Appraisal Services in Ohio | Modern Appraisers',
    description: 'Independent vehicle appraisals in Ohio. ACV, diminished value, cost-of-repair, and appraisal clause support — Columbus, Cleveland, Cincinnati, Toledo, Akron.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
