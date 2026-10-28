import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'montana',
  name: 'Montana',
  abbreviation: 'MT',
  heroImage: null,
  intro:
    "Montana claims come with long distances between comps and a heavy mix of ranch trucks, off road vehicles, and specialty equipment alongside the normal passenger fleet. Modern Appraisers works it from Billings and Missoula to Bozeman, Great Falls, Helena, and the smaller towns. Our scope: total loss ACV, diminished value documentation, cost of repair review on contested estimates, and valuations across classics, recreational, specialty, commercial, and heavy duty vehicles. Our written reports are ready for appraisal clause or settlement work.",
  majorCities: ['Billings', 'Missoula', 'Bozeman', 'Great Falls'],
  relatedStates: ['north-dakota', 'south-dakota', 'wyoming', 'idaho'],
  seo: {
    title: 'Auto Appraisal Services in Montana | Modern Appraisers',
    description: 'Independent vehicle appraisals in Montana. ACV, diminished value, cost of repair, and appraisal clause support in Billings, Missoula, Bozeman, Great Falls.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
