import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'vermont',
  name: 'Vermont',
  abbreviation: 'VT',
  heroImage: null,
  intro:
    "Burlington on Lake Champlain, Rutland, Montpelier, and Brattleboro. Vermont's a small state and a tight knit claims market. Modern Appraisers handles the work across it. We prepare total loss ACV reports, diminished value documentation after collision repair, cost of repair review on disputed estimates, and valuations for classics, specialty units, and commercial vehicles. Our written appraisals go into appraisal clause work and settlement conversations with carriers in the state.",
  majorCities: ['Burlington', 'Rutland', 'Montpelier'],
  relatedStates: ['new-hampshire', 'new-york'],
  seo: {
    title: 'Auto Appraisal Services in Vermont | Modern Appraisers',
    description: 'Independent vehicle appraisals in Vermont. ACV, diminished value, cost of repair, and appraisal clause support in Burlington, Rutland, Montpelier.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
