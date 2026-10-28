import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'hawaii',
  name: 'Hawaii',
  abbreviation: 'HI',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services across Hawaii, with coverage of Honolulu and the island of Oahu, as well as communities on the Big Island, Maui, and Kauai. We prepare documented Actual Cash Value reports, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations tailored to the state's unique vehicle market. Our written appraisals assist drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement discussions island-wide.",
  majorCities: ['Honolulu', 'Hilo', 'Kailua', 'Kaneohe'],
  relatedStates: ['california', 'oregon', 'washington', 'alaska'],
  seo: {
    title: 'Auto Appraisal Services in Hawaii | Modern Appraisers',
    description: 'Independent vehicle appraisals in Hawaii. ACV, diminished value, cost-of-repair, and appraisal clause support — Honolulu, Hilo, Kailua, and the islands.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
