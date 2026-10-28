import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'south-carolina',
  name: 'South Carolina',
  abbreviation: 'SC',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services throughout South Carolina — from Charleston and the Lowcountry to Columbia, Greenville, Myrtle Beach, and the Upstate communities. We prepare Actual Cash Value reports for total-loss settlements, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, and commercial vehicles. Our written appraisals assist drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement negotiations, and litigation.",
  majorCities: ['Charleston', 'Columbia', 'Greenville', 'Myrtle Beach'],
  relatedStates: ['north-carolina', 'georgia'],
  seo: {
    title: 'Auto Appraisal Services in South Carolina | Modern Appraisers',
    description: 'Independent vehicle appraisals in South Carolina. ACV, diminished value, cost-of-repair, and appraisal clause support — Charleston, Columbia, Greenville, Myrtle Beach.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
