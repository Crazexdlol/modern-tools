import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'florida',
  name: 'Florida',
  abbreviation: 'FL',
  heroImage: null,
  intro:
    "Hurricane season plus a huge driving population means Florida produces a lot of complicated claims. Flood vehicles, salvage history, hard freeze damage up in the Panhandle, and specialty markets around South Florida all land on our desks. Modern Appraisers covers Miami, Fort Lauderdale, Orlando, Tampa, Jacksonville, and everywhere in between. We prepare total loss ACV, diminished value documentation, cost of repair reviews, and valuations for exotics, classics, and commercial fleets.",
  majorCities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Tallahassee'],
  relatedStates: ['georgia', 'alabama'],
  seo: {
    title: 'Auto Appraisal Services in Florida | Modern Appraisers',
    description: 'Independent vehicle appraisals in Florida. ACV, diminished value, cost of repair, and appraisal clause support in Miami, Orlando, Tampa, Jacksonville.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
