import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'north-carolina',
  name: 'North Carolina',
  abbreviation: 'NC',
  heroImage: null,
  intro:
    "Charlotte and the Research Triangle produce a lot of our North Carolina volume. Greensboro, Winston Salem, Asheville, and the Outer Banks fill in the rest. Modern Appraisers handles total loss ACV, diminished value documentation after repairs, cost of repair reviews on contested estimates, and valuations for classics, specialty vehicles, and commercial units. Our written appraisals are the kind that stand up in appraisal clause work and in settlement conversations with carriers.",
  majorCities: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston Salem'],
  relatedStates: ['virginia', 'tennessee', 'georgia', 'south-carolina'],
  seo: {
    title: 'Auto Appraisal Services in North Carolina | Modern Appraisers',
    description: 'Independent vehicle appraisals in North Carolina. ACV, diminished value, cost of repair, and appraisal clause support in Charlotte, Raleigh, Greensboro, Durham.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
