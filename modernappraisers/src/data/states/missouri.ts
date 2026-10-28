import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'missouri',
  name: 'Missouri',
  abbreviation: 'MO',
  heroImage: null,
  intro:
    "Modern Appraisers handles Missouri claims across Kansas City and St. Louis plus Springfield, Columbia, and the Ozarks. Both metros push volume and both produce their share of contested valuations. We cover total loss ACV, diminished value documentation after repairs, cost of repair reviews when the shop and the carrier can't agree, and work on classics, specialty vehicles, and commercial units. Written appraisals that read like someone did their homework before writing them.",
  majorCities: ['Kansas City', 'St. Louis', 'Springfield', 'Columbia'],
  relatedStates: ['iowa', 'illinois', 'kentucky', 'tennessee', 'arkansas', 'oklahoma', 'kansas', 'nebraska'],
  seo: {
    title: 'Auto Appraisal Services in Missouri | Modern Appraisers',
    description: 'Independent vehicle appraisals in Missouri. ACV, diminished value, cost of repair, and appraisal clause support in Kansas City, St. Louis, Springfield, Columbia.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
