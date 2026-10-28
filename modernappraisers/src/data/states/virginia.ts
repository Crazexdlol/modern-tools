import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'virginia',
  name: 'Virginia',
  abbreviation: 'VA',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters across Virginia — from Virginia Beach and Hampton Roads to Richmond, Northern Virginia including Alexandria and Arlington, Norfolk, and the smaller communities throughout the state. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Virginia Beach', 'Richmond', 'Alexandria', 'Norfolk', 'Arlington'],
  relatedStates: ['maryland', 'west-virginia', 'kentucky', 'tennessee', 'north-carolina'],
  seo: {
    title: 'Auto Appraisal Services in Virginia | Modern Appraisers',
    description: 'Independent vehicle appraisals in Virginia. ACV, diminished value, cost-of-repair, and appraisal clause support — Virginia Beach, Richmond, Norfolk, Arlington.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
