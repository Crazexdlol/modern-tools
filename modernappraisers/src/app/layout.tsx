import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import './globals.css'

const DESCRIPTION =
  'Independent third-party vehicle appraisal firm. Documented, defensible valuations and dispute-resolution services for carriers, vehicle owners, attorneys, and claims professionals. Diminished Value, Actual Cash Value, Umpire Services, and more.'

export const metadata: Metadata = {
  // Resolves relative URLs (like /og.png) to absolute URLs in metadata.
  // Required for OpenGraph and Twitter cards to render correctly.
  metadataBase: new URL('https://modernappraisers.com'),
  title: {
    default: 'Modern Appraisers, Independent vehicle appraisals, 27+ years of experience',
    template: '%s | Modern Appraisers',
  },
  description: DESCRIPTION,
  applicationName: 'Modern Appraisers',
  authors: [{ name: 'Modern Appraisers' }],
  keywords: [
    'vehicle appraisal', 'independent appraiser', 'diminished value', 'actual cash value',
    'ACV', 'DV', 'umpire services', 'appraisal clause', 'cost of repair dispute',
    'loss of use', 'storage charges', 'total loss', 'insurance appraisal',
  ],
  openGraph: {
    type: 'website',
    url: 'https://modernappraisers.com',
    siteName: 'Modern Appraisers',
    title: 'Modern Appraisers, Independent appraisals that hold up.',
    description: DESCRIPTION,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Modern Appraisers, Independent appraisals that hold up.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Modern Appraisers, Independent appraisals that hold up.',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  )
}
