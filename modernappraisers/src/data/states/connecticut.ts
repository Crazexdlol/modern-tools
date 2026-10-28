import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'connecticut',
  name: 'Connecticut',
  abbreviation: 'CT',
  heroImage: null,
  intro:
    "Modern Appraisers serves Connecticut drivers, attorneys, body shops, and claims teams across Hartford, Bridgeport, New Haven, Stamford, and the surrounding corridors. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, and cost-of-repair dispute reviews. Specialty, classic, and commercial vehicles receive the same careful valuation. Our written appraisals are built to withstand scrutiny in appraisal-clause proceedings, settlement negotiations, and litigation anywhere in the state.",
  majorCities: ['Bridgeport', 'Hartford', 'New Haven', 'Stamford'],
  relatedStates: ['new-york', 'new-jersey', 'pennsylvania'],
  seo: {
    title: 'Auto Appraisal Services in Connecticut | Modern Appraisers',
    description: 'Independent vehicle appraisals in Connecticut. ACV, diminished value, cost-of-repair, and appraisal clause support — Hartford, Bridgeport, New Haven, Stamford.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
