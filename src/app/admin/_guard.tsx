import { notFound } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server component only. Renders nothing when the caller is admin; calls
// notFound() (404) otherwise. Use as a first-line guard in every /admin/* page.
export async function AdminGuard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!data || data.role !== 'admin') notFound()
  return null
}
