import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'missouri',
  name: 'Missouri',
  abbreviation: 'MO',
  heroImage: null,
  intro:
    "Modern Appraisers works vehicle appraisal matters across Missouri — Kansas City, St. Louis, Springfield, Columbia, and the smaller markets throughout the Ozarks and northern plains. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair reviews for disputed estimates, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Kansas City', 'St. Louis', 'Springfield', 'Columbia'],
  relatedStates: ['iowa', 'illinois', 'kentucky', 'tennessee', 'arkansas', 'oklahoma', 'kansas', 'nebraska'],
  seo: {
    title: 'Auto Appraisal Services in Missouri | Modern Appraisers',
    description: 'Independent vehicle appraisals in Missouri. ACV, diminished value, cost-of-repair, and appraisal clause support — Kansas City, St. Louis, Springfield, Columbia.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
