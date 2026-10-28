import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'new-mexico',
  name: 'New Mexico',
  abbreviation: 'NM',
  heroImage: null,
  intro:
    "Across New Mexico — from Albuquerque and Santa Fe out to Las Cruces, Rio Rancho, and the smaller communities throughout the Rio Grande valley and high desert — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement negotiations.",
  majorCities: ['Albuquerque', 'Las Cruces', 'Santa Fe', 'Rio Rancho'],
  relatedStates: ['colorado', 'oklahoma', 'texas', 'arizona', 'utah'],
  seo: {
    title: 'Auto Appraisal Services in New Mexico | Modern Appraisers',
    description: 'Independent vehicle appraisals in New Mexico. ACV, diminished value, cost-of-repair, and appraisal clause support — Albuquerque, Las Cruces, Santa Fe.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
