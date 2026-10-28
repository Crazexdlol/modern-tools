import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'kansas',
  name: 'Kansas',
  abbreviation: 'KS',
  heroImage: null,
  intro:
    "Modern Appraisers works vehicle appraisal matters across Kansas, from Wichita and the Topeka metro area to Kansas City, Overland Park, and the smaller markets scattered across the state. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles including farm and heavy-equipment valuations. Our written appraisals support drivers, attorneys, body shops, and claims teams through appraisal-clause proceedings and settlement discussions.",
  majorCities: ['Wichita', 'Overland Park', 'Kansas City', 'Topeka'],
  relatedStates: ['nebraska', 'missouri', 'oklahoma', 'colorado'],
  seo: {
    title: 'Auto Appraisal Services in Kansas | Modern Appraisers',
    description: 'Independent vehicle appraisals in Kansas. ACV, diminished value, cost-of-repair, and appraisal clause support — Wichita, Overland Park, Kansas City, Topeka.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
