import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'arizona',
  name: 'Arizona',
  abbreviation: 'AZ',
  heroImage: null,
  intro:
    "Modern Appraisers has been working Arizona claims for drivers, attorneys, body shops, and carriers across Phoenix, Tucson, Mesa, Scottsdale, and the high country around Flagstaff. Our scope covers total loss ACV, diminished value after repairs, cost of repair disputes, exotic and classic valuations, and commercial vehicle work. If the carrier's number isn't where it should be, our written reports are what you take into the appraisal clause or into settlement negotiations.",
  majorCities: ['Phoenix', 'Tucson', 'Mesa', 'Scottsdale', 'Flagstaff'],
  relatedStates: ['california', 'nevada', 'utah', 'new-mexico', 'colorado'],
  seo: {
    title: 'Auto Appraisal Services in Arizona | Modern Appraisers',
    description: 'Independent vehicle appraisals in Arizona. ACV, diminished value, cost of repair, and appraisal clause support in Phoenix, Tucson, Mesa, Flagstaff.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
