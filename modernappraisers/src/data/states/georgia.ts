import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'georgia',
  name: 'Georgia',
  abbreviation: 'GA',
  heroImage: null,
  intro:
    "From metropolitan Atlanta out to Augusta, Savannah, Columbus, and Macon, Modern Appraisers supports Georgia drivers, attorneys, body shops, and claims professionals with independent vehicle appraisals. Our Actual Cash Value reports, diminished value documentation, cost-of-repair reviews, and specialty-vehicle valuations are structured to be defensible in appraisal-clause proceedings, insurance negotiations, and litigation. We handle first-party and third-party matters, standard passenger vehicles and commercial fleet work alike.",
  majorCities: ['Atlanta', 'Augusta', 'Savannah', 'Columbus'],
  relatedStates: ['florida', 'alabama', 'tennessee', 'north-carolina', 'south-carolina'],
  seo: {
    title: 'Auto Appraisal Services in Georgia | Modern Appraisers',
    description: 'Independent vehicle appraisals in Georgia. ACV, diminished value, cost-of-repair, and appraisal clause support across Atlanta, Augusta, Savannah, and Columbus.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
