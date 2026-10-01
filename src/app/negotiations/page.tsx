import { Suspense } from 'react'
import { AppHeader } from '@/components/app-header'
import { requireNegotiationsAccessOrNotFound } from '@/lib/auth/require-negotiations'
import { NegotiationsClient } from './negotiations-client'

export const dynamic = 'force-dynamic'

export default async function NegotiationsPage() {
  await requireNegotiationsAccessOrNotFound()
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-[1920px] mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Negotiations</div>
          <h1 className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">Inbox</h1>
        </div>
        <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
          <NegotiationsClient />
        </Suspense>
      </main>
    </div>
  )
}
