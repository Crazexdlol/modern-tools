import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'colorado',
  name: 'Colorado',
  abbreviation: 'CO',
  heroImage: null,
  intro:
    "Across Colorado — from Denver and the Front Range to Colorado Springs, Fort Collins, Boulder, and the Western Slope — Modern Appraisers provides independent vehicle appraisals and dispute-resolution services. We prepare Actual Cash Value reports, diminished value documentation, cost-of-repair reviews, and valuations for specialty vehicles, commercial trucks, and off-road and recreational vehicles common to the state. Our written appraisals support drivers, attorneys, body shops, and claims professionals through appraisal-clause proceedings, settlement discussions, and litigation.",
  majorCities: ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Boulder'],
  relatedStates: ['wyoming', 'nebraska', 'kansas', 'oklahoma', 'new-mexico', 'arizona', 'utah'],
  seo: {
    title: 'Auto Appraisal Services in Colorado | Modern Appraisers',
    description: 'Independent vehicle appraisals in Colorado. ACV, diminished value, cost-of-repair, and appraisal clause support — Denver, Colorado Springs, Boulder, Fort Collins.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
