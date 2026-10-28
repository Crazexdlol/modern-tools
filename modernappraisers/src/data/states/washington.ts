import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'washington',
  name: 'Washington',
  abbreviation: 'WA',
  heroImage: null,
  intro:
    "Seattle and the Puget Sound corridor is where most of the Washington claims land. Spokane, Tacoma, Olympia, and Vancouver push the rest. East of the Cascades the market changes, and the vehicle mix changes with it. Modern Appraisers works all of it. We handle total loss ACV, diminished value documentation after repairs, cost of repair reviews on contested estimates, and valuations for classics, specialty units, recreational vehicles, and commercial fleets. Written appraisals built for appraisal clause and settlement work.",
  majorCities: ['Seattle', 'Spokane', 'Tacoma', 'Olympia', 'Vancouver'],
  relatedStates: ['idaho', 'oregon'],
  seo: {
    title: 'Auto Appraisal Services in Washington | Modern Appraisers',
    description: 'Independent vehicle appraisals in Washington. ACV, diminished value, cost of repair, and appraisal clause support in Seattle, Spokane, Tacoma, Olympia.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
