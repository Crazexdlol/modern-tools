import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'oregon',
  name: 'Oregon',
  abbreviation: 'OR',
  heroImage: null,
  intro:
    "Portland and the Willamette Valley do most of our Oregon volume, with Salem, Eugene, Bend, and Medford adding to it. Recreational and off road vehicles come into the mix more than they do in most states. Modern Appraisers handles total loss ACV, diminished value documentation after repairs, cost of repair review on contested estimates, and valuations covering classics, specialty units, recreational vehicles, and commercial fleets. Our written appraisals are built for appraisal clause and settlement work.",
  majorCities: ['Portland', 'Salem', 'Eugene', 'Bend'],
  relatedStates: ['washington', 'idaho', 'nevada', 'california'],
  seo: {
    title: 'Auto Appraisal Services in Oregon | Modern Appraisers',
    description: 'Independent vehicle appraisals in Oregon. ACV, diminished value, cost of repair, and appraisal clause support in Portland, Salem, Eugene, Bend.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
