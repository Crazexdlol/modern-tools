import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'texas',
  name: 'Texas',
  abbreviation: 'TX',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters across Texas — from Houston, Dallas, and San Antonio to Austin, Fort Worth, El Paso, and the Rio Grande Valley. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, exotic, commercial, and oil-field vehicles common throughout the state. Our documented appraisals support drivers, attorneys, body shops, and claims professionals in appraisal-clause proceedings, settlement negotiations, and litigation.",
  majorCities: ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth'],
  relatedStates: ['oklahoma', 'arkansas', 'louisiana', 'new-mexico'],
  seo: {
    title: 'Auto Appraisal Services in Texas | Modern Appraisers',
    description: 'Independent vehicle appraisals in Texas. ACV, diminished value, cost-of-repair, and appraisal clause support — Houston, Dallas, San Antonio, Austin, Fort Worth.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
