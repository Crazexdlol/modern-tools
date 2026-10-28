import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-jersey',
  name: 'New Jersey',
  abbreviation: 'NJ',
  heroImage: null,
  intro:
    "Newark, Jersey City, Paterson, Trenton, Edison, and the Shore communities — Modern Appraisers works all of it. New Jersey's density means a lot of claims cross through fast. We produce total loss ACV reports, diminished value documentation after repairs, cost of repair reviews on disputed estimates, and valuations covering classics, exotics, specialty vehicles, and commercial units. The written appraisals we deliver are built for the back and forth of appraisal clause and settlement work with carriers.",
  majorCities: ['Newark', 'Jersey City', 'Paterson', 'Trenton'],
  relatedStates: ['new-york', 'pennsylvania', 'delaware'],
  seo: {
    title: 'Auto Appraisal Services in New Jersey | Modern Appraisers',
    description: 'Independent vehicle appraisals in New Jersey. ACV, diminished value, cost of repair, and appraisal clause support in Newark, Jersey City, Paterson, Trenton.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
