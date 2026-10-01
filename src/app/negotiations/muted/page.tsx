import { requireNegotiationsAccessOrNotFound } from '@/lib/auth/require-negotiations'
import { AppHeader } from '@/components/app-header'
import { MutedClient } from './muted-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MutedSendersPage() {
  await requireNegotiationsAccessOrNotFound()
  return (
    <>
      <AppHeader />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Muted senders</h1>
        <p className="text-sm text-gray-500 mb-6">
          Senders and domains listed here are automatically marked spam and never appear in triage.
        </p>
        <MutedClient />
      </main>
    </>
  )
}
