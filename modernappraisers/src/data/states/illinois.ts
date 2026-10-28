import type { StateContent } from '../state-types'

const content: StateContent = {
  slug: 'illinois',
  name: 'Illinois',
  abbreviation: 'IL',
  heroImage: null,
  intro:
    "Chicago alone generates enough claims to keep a shop busy. Illinois has plenty more spread out through Aurora, Rockford, Peoria, Joliet, Springfield, and the southern corridor. Modern Appraisers handles independent appraisal work across the state: total loss ACV, diminished value after repairs, cost of repair review on disputed estimates, and valuations covering classics, exotics, and commercial units. Our written reports are the ones drivers, attorneys, body shops, and claims teams bring into appraisal clause or settlement negotiations.",
  majorCities: ['Chicago', 'Aurora', 'Rockford', 'Joliet', 'Springfield'],
  relatedStates: ['wisconsin', 'iowa', 'missouri', 'kentucky', 'indiana'],
  seo: {
    title: 'Auto Appraisal Services in Illinois | Modern Appraisers',
    description: 'Independent vehicle appraisals in Illinois. ACV, diminished value, cost of repair, and appraisal clause support in Chicago, Aurora, Rockford, Springfield.',
  },
  legalSections: null,
  citations: [] as readonly never[],
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
}

export default content
