import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'west-virginia',
  name: 'West Virginia',
  abbreviation: 'WV',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services throughout West Virginia — Charleston, Huntington, Morgantown, Parkersburg, and the smaller communities serving the Appalachian coal, timber, and natural-gas regions. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our written appraisals assist drivers, attorneys, body shops, and claims teams through appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Charleston', 'Huntington', 'Morgantown', 'Parkersburg'],
  relatedStates: ['pennsylvania', 'maryland', 'virginia', 'kentucky', 'ohio'],
  seo: {
    title: 'Auto Appraisal Services in West Virginia | Modern Appraisers',
    description: 'Independent vehicle appraisals in West Virginia. ACV, diminished value, cost-of-repair, and appraisal clause support — Charleston, Huntington, Morgantown.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
