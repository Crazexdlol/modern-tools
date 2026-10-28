import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'ohio',
  name: 'Ohio',
  abbreviation: 'OH',
  heroImage: null,
  intro:
    "Three metros, three different claims markets: Columbus runs its own, Cleveland runs its own, and Cincinnati brings a third flavor into the mix. Toledo, Akron, Dayton, and the smaller communities fill the rest. Modern Appraisers works Ohio across the board. The practice covers total loss ACV, diminished value documentation, cost of repair reviews on disputed estimates, and valuations for classics, specialty vehicles, and commercial fleets. Our written appraisals are built to carry in appraisal clause work and settlement talks.",
  majorCities: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  relatedStates: ['michigan', 'indiana', 'kentucky', 'west-virginia', 'pennsylvania'],
  seo: {
    title: 'Auto Appraisal Services in Ohio | Modern Appraisers',
    description: 'Independent vehicle appraisals in Ohio. ACV, diminished value, cost of repair, and appraisal clause support in Columbus, Cleveland, Cincinnati, Toledo, Akron.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
