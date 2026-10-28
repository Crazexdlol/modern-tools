import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'delaware',
  name: 'Delaware',
  abbreviation: 'DE',
  heroImage: null,
  intro:
    "Small state, serious I 95 traffic, and plenty of claims. Modern Appraisers works Wilmington, Dover, Newark, and the shore communities. The practice covers total loss ACV, diminished value after collision repairs, cost of repair reviews when the estimate's in dispute, specialty and classic valuations, and commercial vehicle work. Our written reports stand up where it matters: appraisal clause, settlement negotiations, and litigation when the claim ends up there.",
  majorCities: ['Wilmington', 'Dover', 'Newark'],
  relatedStates: ['pennsylvania', 'new-jersey', 'maryland'],
  seo: {
    title: 'Auto Appraisal Services in Delaware | Modern Appraisers',
    description: 'Independent vehicle appraisals in Delaware. ACV, diminished value, cost of repair, and appraisal clause support in Wilmington, Dover, and Newark.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
