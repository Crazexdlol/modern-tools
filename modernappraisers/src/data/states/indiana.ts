import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'indiana',
  name: 'Indiana',
  abbreviation: 'IN',
  heroImage: null,
  intro:
    "Indianapolis is the center of gravity, but Indiana's claims market stretches up to South Bend, east to Fort Wayne, and down through Evansville and Bloomington. Modern Appraisers covers it. The practice runs total loss ACV, diminished value documentation, cost of repair reviews, and valuations on classics, exotics, specialty vehicles, and commercial units. Attorneys, body shops, and drivers rely on our written appraisals to carry weight in appraisal clause work and in settlement conversations with carriers.",
  majorCities: ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend'],
  relatedStates: ['michigan', 'illinois', 'kentucky', 'ohio'],
  seo: {
    title: 'Auto Appraisal Services in Indiana | Modern Appraisers',
    description: 'Independent vehicle appraisals in Indiana. ACV, diminished value, cost of repair, and appraisal clause support in Indianapolis, Fort Wayne, Evansville, South Bend.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
