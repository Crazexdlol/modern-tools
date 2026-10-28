import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'indiana',
  name: 'Indiana',
  abbreviation: 'IN',
  heroImage: null,
  intro:
    "Modern Appraisers serves Indiana drivers, attorneys, body shops, and claims professionals across Indianapolis, Fort Wayne, Evansville, South Bend, Bloomington, and the smaller markets throughout the state. Our independent appraisals cover Actual Cash Value for total-loss settlements, diminished value documentation after repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. We prepare written reports structured to withstand scrutiny in appraisal-clause proceedings, settlement negotiations, and litigation.",
  majorCities: ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend'],
  relatedStates: ['michigan', 'illinois', 'kentucky', 'ohio'],
  seo: {
    title: 'Auto Appraisal Services in Indiana | Modern Appraisers',
    description: 'Independent vehicle appraisals in Indiana. ACV, diminished value, cost-of-repair, and appraisal clause support — Indianapolis, Fort Wayne, Evansville, South Bend.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
