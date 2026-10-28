import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'iowa',
  name: 'Iowa',
  abbreviation: 'IA',
  heroImage: null,
  intro:
    "Across Iowa — from Des Moines and the central corridor to Cedar Rapids, Davenport, Iowa City, and Sioux City — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty and commercial vehicles including farm trucks and agricultural equipment common in the region. Drivers, attorneys, body shops, and claims teams rely on our written appraisals through appraisal-clause proceedings and settlement discussions.",
  majorCities: ['Des Moines', 'Cedar Rapids', 'Davenport', 'Iowa City'],
  relatedStates: ['minnesota', 'wisconsin', 'illinois', 'missouri', 'nebraska', 'south-dakota'],
  seo: {
    title: 'Auto Appraisal Services in Iowa | Modern Appraisers',
    description: 'Independent vehicle appraisals in Iowa. ACV, diminished value, cost-of-repair, and appraisal clause support — Des Moines, Cedar Rapids, Davenport, Iowa City.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
