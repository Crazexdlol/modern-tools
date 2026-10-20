import type { NextConfig } from 'next'
import path from 'node:path'

// Security headers applied to every response. Mirrors the HAMS lockdown so
// the public marketing site is tighter against clickjacking, XSS pivots,
// MIME sniffing, and referrer / permission leakage. CSP intentionally
// permissive on script-src (unsafe-inline / unsafe-eval) because Next.js
// hydration + Vercel Analytics need it; everything else is 'self' + the
// known third-party origins we actually use.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-insights.com https://*.vercel.live https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel-insights.com https://*.vercel.live https://va.vercel-scripts.com",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy',   value: CSP },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this folder — otherwise Next walks up and sees
  // HamsPortal's package-lock.json + middleware.ts and gets confused.
  turbopack: { root: path.resolve(__dirname) },
  // Hide the "x-powered-by: Next.js" fingerprint so prod responses don't
  // volunteer the framework / version to attackers.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  // Supabase storage URLs for customer-uploaded preview thumbnails
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ektglhdstobaipdqssjx.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Hotlinked assets from the live modernappraisers.com WP install so the
      // local replica matches 1:1. Henry can swap these to self-hosted copies
      // later if he wants to decouple from WordPress.
      { protocol: 'https', hostname: 'i0.wp.com' },
      { protocol: 'https', hostname: 'www.modernappraisers.com' },
      { protocol: 'https', hostname: 'modernappraisers.com' },
    ],
  },
}

export default nextConfig
