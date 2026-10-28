import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'california',
  name: 'California',
  abbreviation: 'CA',
  heroImage: null,
  intro:
    "California is the biggest vehicle market in the country, and the claims that come out of it are rarely simple. Modern Appraisers covers it from the LA basin and San Diego up through the Bay Area, Sacramento, and the Central Valley. Our scope: total loss ACV, diminished value, cost of repair disputes, and valuations for exotics, classics, and commercial fleets. When the carrier's figure doesn't reflect what the vehicle was actually worth, our written appraisal is the one you bring to the appraisal clause.",
  majorCities: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose'],
  relatedStates: ['oregon', 'nevada', 'arizona'],
  seo: {
    title: 'Auto Appraisal Services in California | Modern Appraisers',
    description: 'Independent vehicle appraisals in California. ACV, diminished value, cost of repair, and appraisal clause support in Los Angeles, San Francisco, San Diego, Sacramento.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
