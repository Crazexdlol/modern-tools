import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'california',
  name: 'California',
  abbreviation: 'CA',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters throughout California — from the Los Angeles basin and San Diego to the San Francisco Bay Area, Sacramento, and the Central Valley. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our independent, written appraisals support drivers, attorneys, body shops, and claims professionals in appraisal-clause proceedings, insurance settlement negotiations, and litigation across the state.",
  majorCities: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose'],
  relatedStates: ['oregon', 'nevada', 'arizona'],
  seo: {
    title: 'Auto Appraisal Services in California | Modern Appraisers',
    description: 'Independent vehicle appraisals in California. ACV, diminished value, cost-of-repair, and appraisal clause support across Los Angeles, San Francisco, San Diego, Sacramento.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
