import type { MetadataRoute } from 'next'
import { STATES } from '@/data/states/_index'

const BASE = 'https://www.modernappraisers.com'

// Static route list — every public page on the site. Next.js serves this
// as /sitemap.xml. Submit the URL to Google Search Console to get the new
// Vercel content indexed and the old WordPress snapshots dropped from the
// search index.
//
// State pages are generated from the STATES index. Massachusetts and Rhode
// Island are excluded from the index, so they never appear here either.

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const existing = [
    '',                      // home
    '/about',
    '/services',
    '/vehicles',
    '/faq',
    '/contact',
    '/submitaclaim',
    '/righttoappraisal',
    '/actualcashvalue',
    '/diminishedvalue',
    '/costofrepair',
    '/lossofuse',
    '/storage',
    '/terms',
    '/privacy-policy',
    '/fulfillment-policy',
  ]
  const stateRoutes = STATES.map(s => `/states/${s.slug}`)
  return [...existing, ...stateRoutes].map(path => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority:
      path === '' ? 1 :
      path.startsWith('/states/') ? 0.6 :
      path.length < 15 ? 0.8 : 0.6,
  }))
}
