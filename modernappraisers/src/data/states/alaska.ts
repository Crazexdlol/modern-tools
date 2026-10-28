import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'alaska',
  name: 'Alaska',
  abbreviation: 'AK',
  heroImage: null,
  intro:
    "Across Alaska's distinct road network — from Anchorage and the Mat-Su Valley to Fairbanks and the roadways serving Juneau — Modern Appraisers delivers independent vehicle appraisals that account for the state's unique driving conditions, remote markets, and transport logistics. We assist drivers, attorneys, body shops, and claims teams with Actual Cash Value determinations, diminished value documentation, cost-of-repair reviews, and specialty-vehicle valuations. Our written reports are built to hold up in appraisal-clause proceedings and settlement discussions anywhere in the state.",
  majorCities: ['Anchorage', 'Fairbanks', 'Juneau'],
  relatedStates: ['washington', 'oregon', 'california', 'idaho'],
  seo: {
    title: 'Auto Appraisal Services in Alaska | Modern Appraisers',
    description: 'Independent vehicle appraisals in Alaska. Documented ACV, diminished value, cost-of-repair, and appraisal clause services from Anchorage to Fairbanks and Juneau.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
