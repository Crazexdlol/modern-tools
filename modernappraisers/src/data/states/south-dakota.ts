import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'south-dakota',
  name: 'South Dakota',
  abbreviation: 'SD',
  heroImage: null,
  intro:
    "Modern Appraisers serves South Dakota drivers, attorneys, body shops, and claims professionals across Sioux Falls, Rapid City, Aberdeen, and the smaller communities serving the Black Hills, the prairie, and agricultural regions. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, agricultural, and commercial vehicles. Our written appraisals support appraisal-clause proceedings, settlement discussions, and litigation.",
  majorCities: ['Sioux Falls', 'Rapid City', 'Aberdeen'],
  relatedStates: ['north-dakota', 'minnesota', 'iowa', 'nebraska', 'wyoming', 'montana'],
  seo: {
    title: 'Auto Appraisal Services in South Dakota | Modern Appraisers',
    description: 'Independent vehicle appraisals in South Dakota. ACV, diminished value, cost-of-repair, and appraisal clause support — Sioux Falls, Rapid City, Aberdeen.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
