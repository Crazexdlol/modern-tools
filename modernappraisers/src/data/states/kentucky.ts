import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'kentucky',
  name: 'Kentucky',
  abbreviation: 'KY',
  heroImage: null,
  intro:
    "From Louisville and Lexington to Bowling Green, Covington, and the smaller communities across the state, Modern Appraisers delivers independent vehicle appraisal services throughout Kentucky. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation after collision repairs, cost-of-repair reviews, and valuations for specialty, classic, and commercial vehicles. Our written appraisals assist drivers, attorneys, body shops, and claims professionals in appraisal-clause proceedings, insurance negotiations, and litigation.",
  majorCities: ['Louisville', 'Lexington', 'Bowling Green', 'Covington'],
  relatedStates: ['indiana', 'ohio', 'west-virginia', 'virginia', 'tennessee', 'missouri', 'illinois'],
  seo: {
    title: 'Auto Appraisal Services in Kentucky | Modern Appraisers',
    description: 'Independent vehicle appraisals in Kentucky. ACV, diminished value, cost-of-repair, and appraisal clause support — Louisville, Lexington, Bowling Green, Covington.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
