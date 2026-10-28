import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'nebraska',
  name: 'Nebraska',
  abbreviation: 'NE',
  heroImage: null,
  intro:
    "Omaha and Lincoln anchor our Nebraska work. Bellevue, Grand Island, and the smaller communities throughout the Platte River valley and the Sandhills round it out. Modern Appraisers handles total loss ACV reports, diminished value documentation after repairs, cost of repair reviews when the estimate's contested, and valuations covering classics, agricultural equipment, specialty units, and commercial vehicles. Written reports built to carry weight in appraisal clause work and settlement talks.",
  majorCities: ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island'],
  relatedStates: ['south-dakota', 'iowa', 'missouri', 'kansas', 'colorado', 'wyoming'],
  seo: {
    title: 'Auto Appraisal Services in Nebraska | Modern Appraisers',
    description: 'Independent vehicle appraisals in Nebraska. ACV, diminished value, cost of repair, and appraisal clause support in Omaha, Lincoln, Bellevue, Grand Island.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
