// Deletes every acv_history row with id starting with 'test-debug-'.
// Companion to debug-full-workflow.mjs.
import { createClient } from '@supabase/supabase-js'

const svc = createClient(
  'https://ektglhdstobaipdqssjx.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const { data: found } = await svc.from('acv_history').select('id').like('id', 'test-debug-%')
console.log(`Found ${found?.length ?? 0} test-debug- claims:`)
for (const r of (found ?? [])) console.log(`  ${r.id}`)

if ((found?.length ?? 0) > 0) {
  const { error } = await svc.from('acv_history').delete().like('id', 'test-debug-%')
  if (error) { console.error('Delete failed:', error.message); process.exit(1) }
  console.log(`\nDeleted ${found.length} rows.`)
}

// Post-delete sanity: total MA count.
const { data: ma } = await svc.from('companies').select('id').eq('slug', 'modern-appraisers').single()
const { count } = await svc.from('acv_history').select('id', { count: 'exact', head: true }).eq('company_id', ma.id)
console.log(`\nMA claim count now: ${count}`)
