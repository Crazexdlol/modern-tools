import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'wisconsin',
  name: 'Wisconsin',
  abbreviation: 'WI',
  heroImage: null,
  intro:
    "Modern Appraisers handles vehicle appraisal matters across Wisconsin — from Milwaukee and the lakeshore communities to Madison, Green Bay, Kenosha, and the smaller markets throughout the Northwoods. We prepare independent Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair reviews for disputed estimates, and valuations for specialty, classic, recreational, and commercial vehicles. Our documented appraisals support drivers, attorneys, body shops, and claims professionals in appraisal-clause proceedings, settlement negotiations, and litigation statewide.",
  majorCities: ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha'],
  relatedStates: ['michigan', 'minnesota', 'iowa', 'illinois'],
  seo: {
    title: 'Auto Appraisal Services in Wisconsin | Modern Appraisers',
    description: 'Independent vehicle appraisals in Wisconsin. ACV, diminished value, cost-of-repair, and appraisal clause support — Milwaukee, Madison, Green Bay, Kenosha.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
