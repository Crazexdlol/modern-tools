import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'utah',
  name: 'Utah',
  abbreviation: 'UT',
  heroImage: null,
  intro:
    "Across Utah — from Salt Lake City and the Wasatch Front out to Provo, Ogden, St. George, and the smaller communities throughout the Mountain West — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, recreational, and commercial vehicles. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement negotiations.",
  majorCities: ['Salt Lake City', 'West Valley City', 'Provo', 'Ogden'],
  relatedStates: ['idaho', 'wyoming', 'colorado', 'new-mexico', 'arizona', 'nevada'],
  seo: {
    title: 'Auto Appraisal Services in Utah | Modern Appraisers',
    description: 'Independent vehicle appraisals in Utah. ACV, diminished value, cost-of-repair, and appraisal clause support — Salt Lake City, Provo, Ogden, West Valley City.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
