import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

// Canonical production host. Any traffic hitting a *.vercel.app URL gets
// 301'd here (same path + query), and the response is tagged noindex so
// Google drops Vercel preview URLs from the index. Mirrors the same
// pattern on modernappraisers.
const CANONICAL_HOST = 'www.hamsportal.com'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
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
  // Exclude:
  //   - /api/* (own auth)
  //   - Next.js static assets
  //   - PWA plumbing: /manifest.json, /sw.js (Chrome fetches these cross-session;
  //     they MUST return the real file, not a login redirect, or PWA install
  //     + service-worker updates break)
  //   - static image extensions
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
