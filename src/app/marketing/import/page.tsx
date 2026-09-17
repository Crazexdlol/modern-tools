import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { AppHeader } from '@/components/app-header'
import { ImportClient } from './import-client'

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

export default async function ImportPage() {
  await requireMarketingAccess()
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Import clients</h1>
          <p className="text-xs text-gray-500 mt-1">CSV with columns: name, type, address, city, state, zip, phone, email, website, contact_name, contact_title, contact_phone, contact_email, last_marketed_at, remarket_interval_days, notes. Repeat client rows to add multiple contacts.</p>
        </div>
        <ImportClient />
      </main>
    </div>
  )
}
