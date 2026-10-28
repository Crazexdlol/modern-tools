import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'oregon',
  name: 'Oregon',
  abbreviation: 'OR',
  heroImage: null,
  intro:
    "Across Oregon — from Portland and the Willamette Valley to Salem, Eugene, Bend, Medford, and the coastal communities — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, recreational, and commercial vehicles. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement negotiations throughout the state.",
  majorCities: ['Portland', 'Salem', 'Eugene', 'Bend'],
  relatedStates: ['washington', 'idaho', 'nevada', 'california'],
  seo: {
    title: 'Auto Appraisal Services in Oregon | Modern Appraisers',
    description: 'Independent vehicle appraisals in Oregon. ACV, diminished value, cost-of-repair, and appraisal clause support — Portland, Salem, Eugene, Bend.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
