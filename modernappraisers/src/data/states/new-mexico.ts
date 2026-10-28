import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-mexico',
  name: 'New Mexico',
  abbreviation: 'NM',
  heroImage: null,
  intro:
    "Albuquerque and Santa Fe anchor the Rio Grande valley volume, Las Cruces picks up the southern work, and the oilfield communities bring their own mix of specialty and commercial fleet claims. Modern Appraisers covers it. Total loss ACV, diminished value documentation after repairs, cost of repair review on contested estimates, and valuations for classics, specialty, and commercial units. Our written appraisals go into appraisal clause work and the settlement conversations attorneys and drivers have with carriers.",
  majorCities: ['Albuquerque', 'Las Cruces', 'Santa Fe', 'Rio Rancho'],
  relatedStates: ['colorado', 'oklahoma', 'texas', 'arizona', 'utah'],
  seo: {
    title: 'Auto Appraisal Services in New Mexico | Modern Appraisers',
    description: 'Independent vehicle appraisals in New Mexico. ACV, diminished value, cost of repair, and appraisal clause support in Albuquerque, Las Cruces, Santa Fe.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
