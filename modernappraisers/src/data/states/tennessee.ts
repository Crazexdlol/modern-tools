import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'tennessee',
  name: 'Tennessee',
  abbreviation: 'TN',
  heroImage: null,
  intro:
    "From Nashville and Memphis to Knoxville, Chattanooga, and the smaller communities across the Great Smoky Mountains, Modern Appraisers supports Tennessee drivers, attorneys, body shops, and claims teams with independent vehicle appraisals. Our Actual Cash Value reports, diminished value documentation, cost-of-repair reviews, and specialty-vehicle valuations are structured to be defensible in appraisal-clause proceedings, insurance negotiations, and litigation. We handle first-party and third-party matters, standard passenger vehicles, and commercial fleet work.",
  majorCities: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga'],
  relatedStates: ['kentucky', 'virginia', 'north-carolina', 'georgia', 'alabama', 'mississippi', 'arkansas', 'missouri'],
  seo: {
    title: 'Auto Appraisal Services in Tennessee | Modern Appraisers',
    description: 'Independent vehicle appraisals in Tennessee. ACV, diminished value, cost-of-repair, and appraisal clause support — Nashville, Memphis, Knoxville, Chattanooga.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
