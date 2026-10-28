import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'idaho',
  name: 'Idaho',
  abbreviation: 'ID',
  heroImage: null,
  intro:
    "Boise, Meridian, Nampa, and Idaho Falls carry most of the volume, but Idaho's a state where recreational and off road vehicles figure heavily into claims. Modern Appraisers works all of it. We produce total loss ACV reports, diminished value documentation after a repair, and cost of repair reviews when the carrier's number doesn't fit the damage. Specialty, classic, and commercial valuations round out the practice. Written appraisals ready for appraisal clause or settlement work.",
  majorCities: ['Boise', 'Meridian', 'Nampa', 'Idaho Falls'],
  relatedStates: ['washington', 'oregon', 'nevada', 'utah', 'wyoming', 'montana'],
  seo: {
    title: 'Auto Appraisal Services in Idaho | Modern Appraisers',
    description: 'Independent vehicle appraisals in Idaho. ACV, diminished value, cost of repair, and appraisal clause support in Boise, Meridian, Nampa, Idaho Falls.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
