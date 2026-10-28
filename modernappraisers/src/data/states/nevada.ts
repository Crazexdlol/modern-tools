import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'nevada',
  name: 'Nevada',
  abbreviation: 'NV',
  heroImage: null,
  intro:
    "Nevada's where we do the most of our work. Modern Appraisers handles claims across Las Vegas and Henderson out through Reno and Carson City, plus the smaller communities north and south. We cover total loss ACV, diminished value documentation, cost of repair reviews on disputed estimates, and valuations on classics, exotics, specialty vehicles, and commercial units. First party, third party, and everything in between. Our written appraisals are the kind drivers, attorneys, and claims teams bring to the appraisal clause when they need something defensible.",
  majorCities: ['Las Vegas', 'Henderson', 'Reno', 'Carson City'],
  relatedStates: ['oregon', 'idaho', 'utah', 'arizona', 'california'],
  seo: {
    title: 'Auto Appraisal Services in Nevada | Modern Appraisers',
    description: 'Independent vehicle appraisals in Nevada. ACV, diminished value, cost of repair, and appraisal clause support in Las Vegas, Henderson, Reno, Carson City.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
