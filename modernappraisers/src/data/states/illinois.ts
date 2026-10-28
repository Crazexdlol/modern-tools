import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'illinois',
  name: 'Illinois',
  abbreviation: 'IL',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters throughout Illinois — from Chicago and the collar counties out to Rockford, Peoria, Springfield, and the southern Illinois corridor. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiation, and litigation statewide.",
  majorCities: ['Chicago', 'Aurora', 'Rockford', 'Joliet', 'Springfield'],
  relatedStates: ['wisconsin', 'iowa', 'missouri', 'kentucky', 'indiana'],
  seo: {
    title: 'Auto Appraisal Services in Illinois | Modern Appraisers',
    description: 'Independent vehicle appraisals in Illinois. ACV, diminished value, cost-of-repair, and appraisal clause support — Chicago, Aurora, Rockford, Springfield.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
