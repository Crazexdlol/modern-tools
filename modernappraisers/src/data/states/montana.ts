import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'montana',
  name: 'Montana',
  abbreviation: 'MT',
  heroImage: null,
  intro:
    "Modern Appraisers delivers independent vehicle appraisal services across Montana, from Billings and Missoula to Bozeman, Great Falls, Helena, and the smaller communities serving ranch, mining, and forestry economies statewide. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation after collision repairs, cost-of-repair dispute reviews, and valuations for specialty, classic, recreational, and commercial vehicles including heavy trucks and off-road equipment. Our written appraisals assist drivers, attorneys, body shops, and claims teams through appraisal-clause proceedings and settlement discussions.",
  majorCities: ['Billings', 'Missoula', 'Bozeman', 'Great Falls'],
  relatedStates: ['north-dakota', 'south-dakota', 'wyoming', 'idaho'],
  seo: {
    title: 'Auto Appraisal Services in Montana | Modern Appraisers',
    description: 'Independent vehicle appraisals in Montana. ACV, diminished value, cost-of-repair, and appraisal clause support — Billings, Missoula, Bozeman, Great Falls.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
