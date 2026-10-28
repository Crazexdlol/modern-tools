import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'kentucky',
  name: 'Kentucky',
  abbreviation: 'KY',
  heroImage: null,
  intro:
    "Louisville, Lexington, Bowling Green, and Covington carry the Kentucky claims volume for us. Modern Appraisers handles total loss ACV reports, diminished value documentation after repairs, cost of repair review when the estimate's being challenged, and valuations across classics, exotics, specialty units, and commercial vehicles. Attorneys, body shops, drivers, and claims teams bring our written appraisals into appraisal clause proceedings and settlement talks when they need something defensible.",
  majorCities: ['Louisville', 'Lexington', 'Bowling Green', 'Covington'],
  relatedStates: ['indiana', 'ohio', 'west-virginia', 'virginia', 'tennessee', 'missouri', 'illinois'],
  seo: {
    title: 'Auto Appraisal Services in Kentucky | Modern Appraisers',
    description: 'Independent vehicle appraisals in Kentucky. ACV, diminished value, cost of repair, and appraisal clause support in Louisville, Lexington, Bowling Green, Covington.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
