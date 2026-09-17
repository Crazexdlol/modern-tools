import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Suspense } from 'react'
import { AppHeader } from '@/components/app-header'
import { MarketingClient } from './marketing-client'

// Server-guarded gate. Flag-only — admin role does NOT grant implicit access.
// RLS backs this — even if this guard is bypassed, the underlying queries
// won't return data unless the marketing_access flag is true.
async function requireMarketingAccess() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data } = await supabase
    .from('profiles')
    .select('marketing_access')
    .eq('id', user.id)
    .maybeSingle()
  if (!data || data.marketing_access !== true) notFound()
}

export default async function MarketingPage() {
  await requireMarketingAccess()
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-[1920px] mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">Marketing</div>
          <h1 className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">Clients</h1>
        </div>
        <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
          <MarketingClient />
        </Suspense>
      </main>
    </div>
  )
}
