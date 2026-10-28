import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'pennsylvania',
  name: 'Pennsylvania',
  abbreviation: 'PA',
  heroImage: null,
  intro:
    "Modern Appraisers works vehicle appraisal matters across Pennsylvania — from Philadelphia and the suburban counties out to Pittsburgh, Allentown, Harrisburg, Erie, and the smaller communities throughout the state. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair reviews for disputed estimates, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Harrisburg'],
  relatedStates: ['new-york', 'new-jersey', 'delaware', 'maryland', 'west-virginia', 'ohio'],
  seo: {
    title: 'Auto Appraisal Services in Pennsylvania | Modern Appraisers',
    description: 'Independent vehicle appraisals in Pennsylvania. ACV, diminished value, cost-of-repair, and appraisal clause support — Philadelphia, Pittsburgh, Allentown, Harrisburg.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
