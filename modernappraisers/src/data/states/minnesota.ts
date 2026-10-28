import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'minnesota',
  name: 'Minnesota',
  abbreviation: 'MN',
  heroImage: null,
  intro:
    "Winter chemistry does a number on vehicles here, and the claims market reflects it. Modern Appraisers covers the Twin Cities, Rochester, Duluth, and the smaller communities throughout the state. The practice includes total loss ACV, diminished value documentation after repairs, cost of repair reviews when the carrier's figures don't line up with the shop's work, and valuations for classics, recreational, specialty, and commercial units. Written reports made for appraisal clause and settlement work.",
  majorCities: ['Minneapolis', 'Saint Paul', 'Rochester', 'Duluth'],
  relatedStates: ['north-dakota', 'south-dakota', 'iowa', 'wisconsin'],
  seo: {
    title: 'Auto Appraisal Services in Minnesota | Modern Appraisers',
    description: 'Independent vehicle appraisals in Minnesota. ACV, diminished value, cost of repair, and appraisal clause support in Minneapolis, Saint Paul, Rochester, Duluth.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
