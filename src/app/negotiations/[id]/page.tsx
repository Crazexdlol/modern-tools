import { AppHeader } from '@/components/app-header'
import { requireNegotiationsAccessOrNotFound } from '@/lib/auth/require-negotiations'
import { ThreadWorkspaceClient } from './thread-workspace-client'

export const dynamic = 'force-dynamic'

export default async function NegotiationThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireNegotiationsAccessOrNotFound()
  const { id } = await params
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="max-w-[1920px] mx-auto px-6 py-6">
        <ThreadWorkspaceClient threadId={id} />
      </main>
    </div>
  )
}
