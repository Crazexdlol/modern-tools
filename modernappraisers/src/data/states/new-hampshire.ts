import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-hampshire',
  name: 'New Hampshire',
  abbreviation: 'NH',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services across New Hampshire, from Manchester and Nashua to Concord, Dover, and the smaller communities throughout the White Mountains and Seacoast. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation after collision repairs, cost-of-repair reviews for disputed estimates, and valuations for specialty, classic, and commercial vehicles. Our written appraisals assist drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement discussions throughout the state.",
  majorCities: ['Manchester', 'Nashua', 'Concord', 'Dover'],
  relatedStates: ['maine', 'vermont', 'connecticut'],
  seo: {
    title: 'Auto Appraisal Services in New Hampshire | Modern Appraisers',
    description: 'Independent vehicle appraisals in New Hampshire. ACV, diminished value, cost-of-repair, and appraisal clause support — Manchester, Nashua, Concord, Dover.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
