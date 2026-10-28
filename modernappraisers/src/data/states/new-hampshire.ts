import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-hampshire',
  name: 'New Hampshire',
  abbreviation: 'NH',
  heroImage: null,
  intro:
    "Manchester, Nashua, Concord, and Dover handle most of the volume we see out of New Hampshire. The coastal communities and the White Mountains round it out. Modern Appraisers prepares total loss ACV reports, diminished value documentation after repairs, cost of repair reviews when the estimate's being pushed back on, and valuations covering classics, specialty vehicles, and commercial units. Our written appraisals go into appraisal clause work and settlement conversations with carriers.",
  majorCities: ['Manchester', 'Nashua', 'Concord', 'Dover'],
  relatedStates: ['maine', 'vermont', 'connecticut'],
  seo: {
    title: 'Auto Appraisal Services in New Hampshire | Modern Appraisers',
    description: 'Independent vehicle appraisals in New Hampshire. ACV, diminished value, cost of repair, and appraisal clause support in Manchester, Nashua, Concord, Dover.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
