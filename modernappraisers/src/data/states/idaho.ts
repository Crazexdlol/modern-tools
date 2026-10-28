import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'idaho',
  name: 'Idaho',
  abbreviation: 'ID',
  heroImage: null,
  intro:
    "Across Idaho — from Boise and the Treasure Valley to Meridian, Nampa, Coeur d'Alene, and Idaho Falls — Modern Appraisers delivers independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation after collision repairs, cost-of-repair reviews, and valuations for specialty, classic, recreational, and commercial vehicles. Our written appraisals support drivers, attorneys, body shops, and claims teams through appraisal-clause proceedings, settlement discussions, and litigation.",
  majorCities: ['Boise', 'Meridian', 'Nampa', 'Idaho Falls'],
  relatedStates: ['washington', 'oregon', 'nevada', 'utah', 'wyoming', 'montana'],
  seo: {
    title: 'Auto Appraisal Services in Idaho | Modern Appraisers',
    description: 'Independent vehicle appraisals in Idaho. ACV, diminished value, cost-of-repair, and appraisal clause support — Boise, Meridian, Nampa, Idaho Falls.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
