import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'utah',
  name: 'Utah',
  abbreviation: 'UT',
  heroImage: null,
  intro:
    "Salt Lake City and the Wasatch Front produce most of the Utah volume we see. Provo, Ogden, St. George, and the smaller mountain communities round it out. Modern Appraisers prepares total loss ACV reports, diminished value documentation after repairs, cost of repair review on contested estimates, and valuations covering classics, specialty units, recreational and off road vehicles, and commercial fleets. Our written appraisals carry weight in appraisal clause work and in the settlement conversations that go with it.",
  majorCities: ['Salt Lake City', 'West Valley City', 'Provo', 'Ogden'],
  relatedStates: ['idaho', 'wyoming', 'colorado', 'new-mexico', 'arizona', 'nevada'],
  seo: {
    title: 'Auto Appraisal Services in Utah | Modern Appraisers',
    description: 'Independent vehicle appraisals in Utah. ACV, diminished value, cost of repair, and appraisal clause support in Salt Lake City, Provo, Ogden, West Valley City.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
