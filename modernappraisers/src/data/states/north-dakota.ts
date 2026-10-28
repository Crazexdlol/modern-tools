import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'north-dakota',
  name: 'North Dakota',
  abbreviation: 'ND',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services throughout North Dakota — Fargo, Bismarck, Grand Forks, Minot, and the smaller communities serving the prairie, oil-patch, and agricultural economies. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, commercial, and heavy-duty vehicles common in the region. Our written appraisals assist drivers, attorneys, body shops, and claims teams through appraisal-clause proceedings and settlement discussions.",
  majorCities: ['Fargo', 'Bismarck', 'Grand Forks', 'Minot'],
  relatedStates: ['montana', 'south-dakota', 'minnesota'],
  seo: {
    title: 'Auto Appraisal Services in North Dakota | Modern Appraisers',
    description: 'Independent vehicle appraisals in North Dakota. ACV, diminished value, cost-of-repair, and appraisal clause support — Fargo, Bismarck, Grand Forks, Minot.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
