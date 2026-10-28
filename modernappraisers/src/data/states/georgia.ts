import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'georgia',
  name: 'Georgia',
  abbreviation: 'GA',
  heroImage: null,
  intro:
    "The Atlanta metro produces the volume, but Georgia's claims market stretches out through Augusta, Savannah, Columbus, and Macon too. Modern Appraisers handles total loss ACV, diminished value documentation after the shop finishes, cost of repair reviews when the estimate's being pushed back on, and valuations for classics, exotics, and commercial vehicles. Attorneys, body shops, and drivers call us when they need a written report that reads like it was written by someone who's done this a few hundred times.",
  majorCities: ['Atlanta', 'Augusta', 'Savannah', 'Columbus'],
  relatedStates: ['florida', 'alabama', 'tennessee', 'north-carolina', 'south-carolina'],
  seo: {
    title: 'Auto Appraisal Services in Georgia | Modern Appraisers',
    description: 'Independent vehicle appraisals in Georgia. ACV, diminished value, cost of repair, and appraisal clause support in Atlanta, Augusta, Savannah, Columbus.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
