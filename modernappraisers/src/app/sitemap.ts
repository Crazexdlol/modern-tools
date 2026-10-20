import type { MetadataRoute } from 'next'

const BASE = 'https://www.modernappraisers.com'

// Static route list — every public page on the site. Next.js serves this
// as /sitemap.xml. Submit the URL to Google Search Console to get the new
// Vercel content indexed and the old WordPress snapshots dropped from the
// search index.

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = [
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
  return routes.map(path => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path.length < 15 ? 0.8 : 0.6,
  }))
}
