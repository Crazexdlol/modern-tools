import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'arizona',
  name: 'Arizona',
  abbreviation: 'AZ',
  heroImage: null,
  intro:
    "Modern Appraisers works claims across Arizona, serving the Phoenix metro area, Tucson, Flagstaff, Mesa, and Scottsdale, as well as the smaller markets throughout the state. Our independent appraisals cover Actual Cash Value for total losses, diminished value documentation after repairs, cost-of-repair dispute reviews, specialty and classic vehicle valuations, and commercial vehicle assessments. We assist drivers, attorneys, body shops, and claims professionals with written reports structured to support appraisal-clause proceedings, settlement negotiation, and litigation.",
  majorCities: ['Phoenix', 'Tucson', 'Mesa', 'Scottsdale', 'Flagstaff'],
  relatedStates: ['california', 'nevada', 'utah', 'new-mexico', 'colorado'],
  seo: {
    title: 'Auto Appraisal Services in Arizona | Modern Appraisers',
    description: 'Independent vehicle appraisals in Arizona. ACV, diminished value, cost-of-repair, and appraisal clause support across Phoenix, Tucson, and the greater state.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
