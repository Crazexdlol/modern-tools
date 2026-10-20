import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Canonical production host. Any traffic hitting a *.vercel.app URL gets
// 301'd here, and the response is also tagged noindex/nofollow so Google
// drops the Vercel preview URLs from the index.
const CANONICAL_HOST = 'modernappraisers.com'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''

  // Any *.vercel.app host → redirect to the custom domain, same path + query.
  // Covers both the project alias (modernappraisers.vercel.app) and every
  // per-deploy URL (modernappraisers-xxxxx-henry-as-projects-...vercel.app).
  if (host.endsWith('.vercel.app')) {
    const url = request.nextUrl.clone()
    url.protocol = 'https:'
    url.host = CANONICAL_HOST
    const res = NextResponse.redirect(url, 301)
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }

  return await updateSession(request)
}

export const config = {
  // Exclude Next.js static assets so the redirect doesn't thrash image /
  // font fetches during a brief caching window after cutover.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
