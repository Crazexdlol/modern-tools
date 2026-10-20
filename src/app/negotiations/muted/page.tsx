import { requireNegotiationsAccessOrNotFound } from '@/lib/auth/require-negotiations'
import { AppHeader } from '@/components/app-header'
import { MutedClient } from './muted-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MutedSendersPage() {
  await requireNegotiationsAccessOrNotFound()
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="hp-display mb-5">Muted senders</h1>
        <MutedClient />
      </main>
    </div>
  )
}
