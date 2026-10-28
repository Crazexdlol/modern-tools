import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'mississippi',
  name: 'Mississippi',
  abbreviation: 'MS',
  heroImage: null,
  intro:
    "Modern Appraisers serves Mississippi drivers, attorneys, body shops, and claims professionals across Jackson, Gulfport, Southaven, Hattiesburg, Biloxi, and the smaller communities throughout the state. Our independent appraisals cover Actual Cash Value for total-loss settlements, diminished value documentation after repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles — including flood-affected matters along the Gulf Coast. We prepare written reports structured to withstand scrutiny in appraisal-clause proceedings, settlement negotiations, and litigation.",
  majorCities: ['Jackson', 'Gulfport', 'Southaven', 'Hattiesburg'],
  relatedStates: ['tennessee', 'alabama', 'louisiana', 'arkansas'],
  seo: {
    title: 'Auto Appraisal Services in Mississippi | Modern Appraisers',
    description: 'Independent vehicle appraisals in Mississippi. ACV, diminished value, cost-of-repair, and appraisal clause support — Jackson, Gulfport, Southaven, Hattiesburg.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
