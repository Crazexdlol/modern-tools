import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { AppHeader } from '@/components/app-header'
import { BackfillClient } from './backfill-client'

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

export default async function BackfillPage() {
  await requireMarketingAccess()
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Backfill: link existing claims to clients</h1>
          <p className="text-xs text-gray-500 mt-1">
            Scans every claim&apos;s free-text client name, clusters variants (Sedgwick / SEDGWICK / Sedgwick Inc → one), proposes a canonical name and type, and asks you to approve before touching data.
          </p>
        </div>
        <BackfillClient />
      </main>
    </div>
  )
}
