import { AppHeader } from '@/components/app-header'
import { requireNegotiationsAccessOrNotFound } from '@/lib/auth/require-negotiations'
import { VoiceProfileClient } from './voice-client'

export const dynamic = 'force-dynamic'

export default async function VoiceProfilePage() {
  await requireNegotiationsAccessOrNotFound()
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Negotiations</div>
          <h1 className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">Voice profile</h1>
          <p className="text-sm text-gray-500 mt-1">
            Trains on your last ~200 sent negotiation emails so drafts sound like you and use your tactics.
          </p>
        </div>
        <VoiceProfileClient />
      </main>
    </div>
  )
}
