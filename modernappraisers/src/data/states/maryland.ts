import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'maryland',
  name: 'Maryland',
  abbreviation: 'MD',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters across Maryland — Baltimore, Columbia, Silver Spring, Germantown, and Annapolis, as well as the Eastern Shore and western counties. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Baltimore', 'Columbia', 'Germantown', 'Silver Spring', 'Annapolis'],
  relatedStates: ['pennsylvania', 'delaware', 'virginia', 'west-virginia'],
  seo: {
    title: 'Auto Appraisal Services in Maryland | Modern Appraisers',
    description: 'Independent vehicle appraisals in Maryland. ACV, diminished value, cost-of-repair, and appraisal clause support — Baltimore, Columbia, Silver Spring, Annapolis.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
