import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'maine',
  name: 'Maine',
  abbreviation: 'ME',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services across Maine, from Portland and the southern coast up through Lewiston, Bangor, and Augusta to the smaller communities inland and Down East. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation for post-collision losses, cost-of-repair reviews, and valuations for specialty, classic, and commercial vehicles. Our written appraisals assist drivers, attorneys, body shops, and claims professionals in appraisal-clause proceedings and settlement discussions throughout the state.",
  majorCities: ['Portland', 'Lewiston', 'Bangor', 'Augusta'],
  relatedStates: ['new-hampshire', 'vermont'],
  seo: {
    title: 'Auto Appraisal Services in Maine | Modern Appraisers',
    description: 'Independent vehicle appraisals in Maine. ACV, diminished value, cost-of-repair, and appraisal clause support — Portland, Lewiston, Bangor, Augusta.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
