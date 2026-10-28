import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'louisiana',
  name: 'Louisiana',
  abbreviation: 'LA',
  heroImage: null,
  intro:
    "Across Louisiana — from New Orleans and the Mississippi Delta to Baton Rouge, Shreveport, Lafayette, and the Gulf Coast parishes — Modern Appraisers provides independent vehicle appraisal services. We prepare Actual Cash Value reports for total-loss claims, diminished value documentation for post-repair losses, cost-of-repair dispute reviews, and valuations for specialty, classic, commercial, and flood-affected vehicles. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings and settlement discussions statewide.",
  majorCities: ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette'],
  relatedStates: ['texas', 'arkansas', 'mississippi'],
  seo: {
    title: 'Auto Appraisal Services in Louisiana | Modern Appraisers',
    description: 'Independent vehicle appraisals in Louisiana. ACV, diminished value, cost-of-repair, and appraisal clause support — New Orleans, Baton Rouge, Shreveport, Lafayette.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
