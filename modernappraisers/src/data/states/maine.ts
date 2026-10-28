import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'maine',
  name: 'Maine',
  abbreviation: 'ME',
  heroImage: null,
  intro:
    "Maine runs on winters that eat vehicles alive and a shorter claims radius than most states. Modern Appraisers covers it from Portland and the southern coast up through Lewiston, Bangor, Augusta, and the smaller communities Down East. We produce total loss ACV, diminished value documentation after repairs, cost of repair reviews, and valuations on classics, specialty units, and commercial vehicles. Our written reports are built to carry in appraisal clause work and in settlement talks with carriers.",
  majorCities: ['Portland', 'Lewiston', 'Bangor', 'Augusta'],
  relatedStates: ['new-hampshire', 'vermont'],
  seo: {
    title: 'Auto Appraisal Services in Maine | Modern Appraisers',
    description: 'Independent vehicle appraisals in Maine. ACV, diminished value, cost of repair, and appraisal clause support in Portland, Lewiston, Bangor, Augusta.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
