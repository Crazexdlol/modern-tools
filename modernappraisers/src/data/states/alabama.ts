import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'alabama',
  name: 'Alabama',
  abbreviation: 'AL',
  heroImage: null,
  intro:
    "Modern Appraisers provides independent vehicle appraisal services across Alabama, from Birmingham and Montgomery to Mobile, Huntsville, and the Gulf Coast. Our documented valuations and dispute resolution services support drivers, attorneys, body shops, and claims professionals handling total-loss settlements, diminished value, cost-of-repair disputes, and specialty-vehicle matters. We work on first-party and third-party claims and provide written appraisals built to withstand scrutiny in appraisal-clause proceedings, settlement negotiations, and litigation throughout the state.",
  majorCities: ['Birmingham', 'Montgomery', 'Mobile', 'Huntsville'],
  relatedStates: ['tennessee', 'georgia', 'florida', 'mississippi'],
  seo: {
    title: 'Auto Appraisal Services in Alabama | Modern Appraisers',
    description: 'Independent vehicle appraisals in Alabama. Actual Cash Value, diminished value, cost-of-repair disputes, and appraisal clause support — Birmingham, Mobile, Montgomery.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
