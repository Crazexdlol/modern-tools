import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'minnesota',
  name: 'Minnesota',
  abbreviation: 'MN',
  heroImage: null,
  intro:
    "Across Minnesota — from the Twin Cities of Minneapolis and Saint Paul out to Rochester, Duluth, and the smaller communities across the state — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, recreational, and commercial vehicles. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement negotiations.",
  majorCities: ['Minneapolis', 'Saint Paul', 'Rochester', 'Duluth'],
  relatedStates: ['north-dakota', 'south-dakota', 'iowa', 'wisconsin'],
  seo: {
    title: 'Auto Appraisal Services in Minnesota | Modern Appraisers',
    description: 'Independent vehicle appraisals in Minnesota. ACV, diminished value, cost-of-repair, and appraisal clause support — Minneapolis, Saint Paul, Rochester, Duluth.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
