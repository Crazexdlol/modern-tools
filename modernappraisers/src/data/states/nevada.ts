import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'nevada',
  name: 'Nevada',
  abbreviation: 'NV',
  heroImage: null,
  intro:
    "Modern Appraisers provides independent vehicle appraisal services throughout Nevada, from Las Vegas and the Mojave corridor to Reno, Carson City, Henderson, and the agricultural communities of the north. Our documented valuations and dispute-resolution services support drivers, attorneys, body shops, and claims professionals handling total-loss, diminished value, cost-of-repair, and specialty-vehicle matters. We work on first-party and third-party claims and provide written appraisals that stand up to scrutiny in appraisal-clause proceedings, settlement negotiations, and litigation.",
  majorCities: ['Las Vegas', 'Henderson', 'Reno', 'Carson City'],
  relatedStates: ['oregon', 'idaho', 'utah', 'arizona', 'california'],
  seo: {
    title: 'Auto Appraisal Services in Nevada | Modern Appraisers',
    description: 'Independent vehicle appraisals in Nevada. ACV, diminished value, cost-of-repair, and appraisal clause support — Las Vegas, Henderson, Reno, Carson City.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
