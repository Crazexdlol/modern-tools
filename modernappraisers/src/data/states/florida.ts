import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'florida',
  name: 'Florida',
  abbreviation: 'FL',
  heroImage: null,
  intro:
    "Modern Appraisers provides independent vehicle appraisal services across Florida, from Miami, Fort Lauderdale, and Orlando to Tampa, Jacksonville, and the Panhandle. We prepare documented Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, exotic, and commercial vehicles. Drivers, attorneys, body shops, and claims professionals rely on our written appraisals through appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Tallahassee'],
  relatedStates: ['georgia', 'alabama'],
  seo: {
    title: 'Auto Appraisal Services in Florida | Modern Appraisers',
    description: 'Independent vehicle appraisals in Florida. ACV, diminished value, cost-of-repair, and appraisal clause support — Miami, Orlando, Tampa, Jacksonville.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
