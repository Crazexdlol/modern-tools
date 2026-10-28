import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'michigan',
  name: 'Michigan',
  abbreviation: 'MI',
  heroImage: null,
  intro:
    "From Detroit and the Metro Detroit communities out to Grand Rapids, Ann Arbor, Lansing, Flint, and the Upper Peninsula, Modern Appraisers supports Michigan drivers, attorneys, body shops, and claims teams. Our independent appraisals cover Actual Cash Value for total-loss settlements, diminished value documentation after repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. We prepare written reports structured to be defensible in appraisal-clause proceedings, insurance negotiations, and litigation.",
  majorCities: ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing'],
  relatedStates: ['wisconsin', 'indiana', 'ohio'],
  seo: {
    title: 'Auto Appraisal Services in Michigan | Modern Appraisers',
    description: 'Independent vehicle appraisals in Michigan. ACV, diminished value, cost-of-repair, and appraisal clause support — Detroit, Grand Rapids, Ann Arbor, Lansing.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
