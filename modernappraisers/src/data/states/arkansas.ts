import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'arkansas',
  name: 'Arkansas',
  abbreviation: 'AR',
  heroImage: null,
  intro:
    "From Little Rock and the central corridor to Fayetteville, Fort Smith, and Jonesboro, Modern Appraisers provides independent vehicle appraisal services throughout Arkansas. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, and cost-of-repair reviews that support disputed estimates. Specialty and commercial vehicles get the same care. Our written appraisals are built to be defensible — supporting drivers, attorneys, body shops, and claims teams in appraisal-clause proceedings, insurance negotiations, and litigation across the state.",
  majorCities: ['Little Rock', 'Fayetteville', 'Fort Smith', 'Jonesboro'],
  relatedStates: ['missouri', 'tennessee', 'mississippi', 'louisiana', 'texas', 'oklahoma'],
  seo: {
    title: 'Auto Appraisal Services in Arkansas | Modern Appraisers',
    description: 'Independent vehicle appraisals in Arkansas. ACV, diminished value, cost-of-repair, and appraisal clause support — Little Rock, Fayetteville, Fort Smith, Jonesboro.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
