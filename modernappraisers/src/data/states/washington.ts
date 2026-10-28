import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'washington',
  name: 'Washington',
  abbreviation: 'WA',
  heroImage: null,
  intro:
    "Across Washington — from Seattle and the Puget Sound corridor to Spokane, Tacoma, Olympia, and the smaller communities east of the Cascades — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, recreational, and commercial vehicles. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement discussions, and litigation throughout the state.",
  majorCities: ['Seattle', 'Spokane', 'Tacoma', 'Olympia', 'Vancouver'],
  relatedStates: ['idaho', 'oregon'],
  seo: {
    title: 'Auto Appraisal Services in Washington | Modern Appraisers',
    description: 'Independent vehicle appraisals in Washington. ACV, diminished value, cost-of-repair, and appraisal clause support — Seattle, Spokane, Tacoma, Olympia.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
