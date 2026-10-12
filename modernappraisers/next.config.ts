import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Supabase storage URLs for customer-uploaded preview thumbnails
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ektglhdstobaipdqssjx.supabase.co' },
    ],
  },
}

export default nextConfig
