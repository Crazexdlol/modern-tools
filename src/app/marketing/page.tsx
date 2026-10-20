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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="max-w-[1920px] mx-auto px-6 py-7">
        <div className="mb-5">
          <div className="hp-eyebrow mb-1.5">Marketing</div>
          <h1 className="hp-display">Clients</h1>
        </div>
        <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
          <MarketingClient />
        </Suspense>
      </main>
    </div>
  )
}
