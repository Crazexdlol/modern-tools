import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'delaware',
  name: 'Delaware',
  abbreviation: 'DE',
  heroImage: null,
  intro:
    "Modern Appraisers works vehicle appraisal matters throughout Delaware — Wilmington, Dover, Newark, and the coastal communities. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation after post-collision repairs, cost-of-repair reviews for disputed estimates, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims teams in appraisal-clause proceedings, settlement negotiations, and litigation across the state.",
  majorCities: ['Wilmington', 'Dover', 'Newark'],
  relatedStates: ['pennsylvania', 'new-jersey', 'maryland'],
  seo: {
    title: 'Auto Appraisal Services in Delaware | Modern Appraisers',
    description: 'Independent vehicle appraisals in Delaware. ACV, diminished value, cost-of-repair, and appraisal clause support across Wilmington, Dover, and Newark.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
