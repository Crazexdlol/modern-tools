import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import './globals.css'

export const metadata: Metadata = {
  title: 'Modern Appraisers — Independent vehicle appraisals',
  description:
    'Independent vehicle appraisals since 1999. We recover fair value for vehicle owners against low-ball insurance offers. Typical recovery $3K–$6K per claim.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  )
}
