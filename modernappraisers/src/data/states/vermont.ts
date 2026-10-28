import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'vermont',
  name: 'Vermont',
  abbreviation: 'VT',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services across Vermont — from Burlington and the Lake Champlain basin down to Rutland, Montpelier, Brattleboro, and the smaller communities throughout the Green Mountains. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation after collision repairs, cost-of-repair reviews, and valuations for specialty, classic, and commercial vehicles. Our written appraisals assist drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement discussions throughout the state.",
  majorCities: ['Burlington', 'Rutland', 'Montpelier'],
  relatedStates: ['new-hampshire', 'new-york'],
  seo: {
    title: 'Auto Appraisal Services in Vermont | Modern Appraisers',
    description: 'Independent vehicle appraisals in Vermont. ACV, diminished value, cost-of-repair, and appraisal clause support — Burlington, Rutland, Montpelier.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
