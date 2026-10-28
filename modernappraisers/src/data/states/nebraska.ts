import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'nebraska',
  name: 'Nebraska',
  abbreviation: 'NE',
  heroImage: null,
  intro:
    "Across Nebraska — from Omaha and Lincoln to Bellevue, Grand Island, and the smaller communities across the Platte River valley and the Sandhills — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, agricultural, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals in appraisal-clause proceedings and settlement discussions.",
  majorCities: ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island'],
  relatedStates: ['south-dakota', 'iowa', 'missouri', 'kansas', 'colorado', 'wyoming'],
  seo: {
    title: 'Auto Appraisal Services in Nebraska | Modern Appraisers',
    description: 'Independent vehicle appraisals in Nebraska. ACV, diminished value, cost-of-repair, and appraisal clause support — Omaha, Lincoln, Bellevue, Grand Island.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
