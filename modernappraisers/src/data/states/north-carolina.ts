import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'north-carolina',
  name: 'North Carolina',
  abbreviation: 'NC',
  heroImage: null,
  intro:
    "From Charlotte and the Research Triangle through Greensboro, Winston-Salem, Asheville, and the Outer Banks, Modern Appraisers supports North Carolina drivers, attorneys, body shops, and claims teams with independent vehicle appraisals. Our Actual Cash Value reports, diminished value documentation, cost-of-repair reviews, and specialty-vehicle valuations are structured to be defensible in appraisal-clause proceedings, insurance negotiations, and litigation. We handle first-party and third-party matters, standard passenger vehicles, and commercial fleet work across the state.",
  majorCities: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
  relatedStates: ['virginia', 'tennessee', 'georgia', 'south-carolina'],
  seo: {
    title: 'Auto Appraisal Services in North Carolina | Modern Appraisers',
    description: 'Independent vehicle appraisals in North Carolina. ACV, diminished value, cost-of-repair, and appraisal clause support — Charlotte, Raleigh, Greensboro, Durham.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
