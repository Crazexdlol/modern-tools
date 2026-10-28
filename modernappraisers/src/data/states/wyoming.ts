import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'wyoming',
  name: 'Wyoming',
  abbreviation: 'WY',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services across Wyoming — Cheyenne, Casper, Laramie, Gillette, and the smaller communities serving the ranching, mining, and energy economies throughout the state. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, recreational, heavy-duty, and commercial vehicles. Our written appraisals assist drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement negotiations.",
  majorCities: ['Cheyenne', 'Casper', 'Laramie', 'Gillette'],
  relatedStates: ['montana', 'south-dakota', 'nebraska', 'colorado', 'utah', 'idaho'],
  seo: {
    title: 'Auto Appraisal Services in Wyoming | Modern Appraisers',
    description: 'Independent vehicle appraisals in Wyoming. ACV, diminished value, cost-of-repair, and appraisal clause support — Cheyenne, Casper, Laramie, Gillette.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
