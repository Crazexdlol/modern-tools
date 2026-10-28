import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-jersey',
  name: 'New Jersey',
  abbreviation: 'NJ',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters across New Jersey — Newark, Jersey City, Paterson, Trenton, Edison, and the shore communities. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiation, and litigation across every county in the state.",
  majorCities: ['Newark', 'Jersey City', 'Paterson', 'Trenton'],
  relatedStates: ['new-york', 'pennsylvania', 'delaware'],
  seo: {
    title: 'Auto Appraisal Services in New Jersey | Modern Appraisers',
    description: 'Independent vehicle appraisals in New Jersey. ACV, diminished value, cost-of-repair, and appraisal clause support — Newark, Jersey City, Paterson, Trenton.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
