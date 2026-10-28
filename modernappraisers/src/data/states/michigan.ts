import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'michigan',
  name: 'Michigan',
  abbreviation: 'MI',
  heroImage: null,
  intro:
    "Michigan is where a lot of these vehicles were designed and built, which doesn't make the claims any less contested. Modern Appraisers works Detroit and Metro Detroit, Grand Rapids, Ann Arbor, Lansing, Flint, and the UP. The practice runs total loss ACV, diminished value documentation after repairs, cost of repair reviews on disputed estimates, and valuations for classics, exotics, specialty units, and commercial vehicles. Written reports built to carry in appraisal clause work and settlement discussions.",
  majorCities: ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing'],
  relatedStates: ['wisconsin', 'indiana', 'ohio'],
  seo: {
    title: 'Auto Appraisal Services in Michigan | Modern Appraisers',
    description: 'Independent vehicle appraisals in Michigan. ACV, diminished value, cost of repair, and appraisal clause support in Detroit, Grand Rapids, Ann Arbor, Lansing.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
