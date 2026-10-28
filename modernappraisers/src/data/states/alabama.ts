import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'alabama',
  name: 'Alabama',
  abbreviation: 'AL',
  heroImage: null,
  intro:
    "Alabama's auto claims market stretches from the industrial centers around Birmingham and Huntsville down to Mobile and the Gulf settlements. Modern Appraisers works it all. We produce total loss ACV reports, diminished value documentation, cost of repair reviews, and valuations for classics, exotics, and commercial units. Drivers, attorneys, and body shops bring our written appraisals into settlement talks or appraisal clause proceedings when they need something that holds up under scrutiny.",
  majorCities: ['Birmingham', 'Montgomery', 'Mobile', 'Huntsville'],
  relatedStates: ['tennessee', 'georgia', 'florida', 'mississippi'],
  seo: {
    title: 'Auto Appraisal Services in Alabama | Modern Appraisers',
    description: 'Independent vehicle appraisals in Alabama. ACV, diminished value, cost of repair, and appraisal clause support in Birmingham, Mobile, Montgomery, Huntsville.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
