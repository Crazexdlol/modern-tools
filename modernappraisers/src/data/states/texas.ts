import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'texas',
  name: 'Texas',
  abbreviation: 'TX',
  heroImage: null,
  intro:
    "Four metros that could each be their own state. Houston, Dallas, San Antonio, Austin — then Fort Worth, El Paso, the Rio Grande Valley, and everything else. Modern Appraisers works Texas claims across all of it. The practice covers total loss ACV, diminished value documentation after repairs, cost of repair review on contested estimates, and valuations for classics, exotics, specialty units, oil field commercial vehicles, and heavier fleet work. Written appraisals built for appraisal clause and settlement work.",
  majorCities: ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth'],
  relatedStates: ['oklahoma', 'arkansas', 'louisiana', 'new-mexico'],
  seo: {
    title: 'Auto Appraisal Services in Texas | Modern Appraisers',
    description: 'Independent vehicle appraisals in Texas. ACV, diminished value, cost of repair, and appraisal clause support in Houston, Dallas, San Antonio, Austin, Fort Worth.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
