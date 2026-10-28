import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'alaska',
  name: 'Alaska',
  abbreviation: 'AK',
  heroImage: null,
  intro:
    "Vehicle markets in Alaska behave differently than anywhere in the Lower 48. Comps are thinner, salvage patterns are their own thing, and transport to the road system shapes how value gets argued. Modern Appraisers has independent appraisal work covered across the state, from Anchorage and the Mat Su Valley out to Fairbanks and Juneau. Total loss ACV, diminished value, cost of repair disputes, and specialty vehicles are all in our scope.",
  majorCities: ['Anchorage', 'Fairbanks', 'Juneau'],
  relatedStates: ['washington', 'oregon', 'california', 'idaho'],
  seo: {
    title: 'Auto Appraisal Services in Alaska | Modern Appraisers',
    description: 'Independent vehicle appraisals in Alaska. ACV, diminished value, cost of repair, and appraisal clause support from Anchorage to Fairbanks and Juneau.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
