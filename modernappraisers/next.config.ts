import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this folder — otherwise Next walks up and sees
  // HamsPortal's package-lock.json + middleware.ts and gets confused.
  turbopack: { root: path.resolve(__dirname) },
  // Supabase storage URLs for customer-uploaded preview thumbnails
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ektglhdstobaipdqssjx.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

export default nextConfig
