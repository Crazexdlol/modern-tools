import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'oklahoma',
  name: 'Oklahoma',
  abbreviation: 'OK',
  heroImage: null,
  intro:
    "Modern Appraisers serves Oklahoma drivers, attorneys, body shops, and claims professionals across Oklahoma City, Tulsa, Norman, Edmond, and the smaller communities throughout the state. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, agricultural, and commercial vehicles. Our written appraisals support appraisal-clause proceedings, insurance settlement negotiations, and litigation statewide.",
  majorCities: ['Oklahoma City', 'Tulsa', 'Norman', 'Edmond'],
  relatedStates: ['kansas', 'missouri', 'arkansas', 'texas', 'new-mexico', 'colorado'],
  seo: {
    title: 'Auto Appraisal Services in Oklahoma | Modern Appraisers',
    description: 'Independent vehicle appraisals in Oklahoma. ACV, diminished value, cost-of-repair, and appraisal clause support — Oklahoma City, Tulsa, Norman, Edmond.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
