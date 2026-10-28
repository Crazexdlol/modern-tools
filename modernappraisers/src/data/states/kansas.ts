import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'kansas',
  name: 'Kansas',
  abbreviation: 'KS',
  heroImage: null,
  intro:
    "Wichita and the Kansas City metro produce most of the volume, with Overland Park and Topeka not far behind. Weather events are a factor here, and so is the heavier commercial and agricultural fleet mix. Modern Appraisers handles total loss ACV reports, diminished value documentation after repairs, cost of repair reviews on disputed estimates, and valuations for classics, specialty vehicles, and commercial units. Written reports that stand up in appraisal clause work and settlement conversations.",
  majorCities: ['Wichita', 'Overland Park', 'Kansas City', 'Topeka'],
  relatedStates: ['nebraska', 'missouri', 'oklahoma', 'colorado'],
  seo: {
    title: 'Auto Appraisal Services in Kansas | Modern Appraisers',
    description: 'Independent vehicle appraisals in Kansas. ACV, diminished value, cost of repair, and appraisal clause support in Wichita, Overland Park, Kansas City, Topeka.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
