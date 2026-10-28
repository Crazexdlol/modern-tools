import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'connecticut',
  name: 'Connecticut',
  abbreviation: 'CT',
  heroImage: null,
  intro:
    "Connecticut's a compact state with a dense claims volume. Modern Appraisers covers Hartford, Bridgeport, New Haven, and Stamford, plus everything in between along the I 95 and I 91 corridors. We do total loss ACV reports, diminished value after collision repair, cost of repair review when the shop's estimate and the carrier's number don't agree, classic and specialty valuations, and commercial work. Our written appraisals are the ones that come up in appraisal clause proceedings and settlement talks.",
  majorCities: ['Bridgeport', 'Hartford', 'New Haven', 'Stamford'],
  relatedStates: ['new-york', 'new-jersey', 'pennsylvania'],
  seo: {
    title: 'Auto Appraisal Services in Connecticut | Modern Appraisers',
    description: 'Independent vehicle appraisals in Connecticut. ACV, diminished value, cost of repair, and appraisal clause support in Hartford, Bridgeport, New Haven, Stamford.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
