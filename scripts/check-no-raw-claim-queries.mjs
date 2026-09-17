#!/usr/bin/env node
// Fails if any file under src/app/api/**/route.ts uses `createServiceClient()`
// (which bypasses RLS) with a raw .from('<claim-scoped table>') call without
// wrapping in scopedClient(). Files that only use the cookie-authed client
// (createServerClient / createClient) are safe — RLS enforces scoping there.
//
// Whitelist for files where raw service-client claim queries are intentional
// (cron / system / fetchClaim helper path).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TABLES = [
  'acv_history', 'messages', 'message_reads', 'user_claim_views', 'estimate_history',
  'clients', 'client_contacts', 'client_marketing_log', 'insurance_guidelines',
]
const ALLOWED = [
  // Helpers where raw access is by design.
  'src/lib/supabase/scoped.ts',
  'src/lib/auth/require-admin.ts',
  'src/lib/auth/require-claim-access.ts',
  'src/lib/supabase/history.ts',
  'src/lib/supabase/clients.ts',
  // Cron + queue system routes — intentional cross-company scope.
  'src/app/api/cron/status-requests/route.ts',
  'src/app/api/messages/queue/route.ts',
  // Routes that fetch claim via fetchClaim(id, companyId) and then use
  // service client with .eq('id', claimId) for the follow-up UPDATE —
  // company is already validated by fetchClaim's own scoping.
  'src/app/api/claims/[id]/approve/route.ts',
  'src/app/api/claims/[id]/reopen/route.ts',
  'src/app/api/claims/[id]/submit/route.ts',
  'src/app/api/claims/[id]/send-back/route.ts',
  'src/app/api/claims/[id]/assign/route.ts',
  // Phase route does its own explicit cross-company guard before UPDATE.
  'src/app/api/claims/[id]/phase/route.ts',
  // These use cookie-authed client (RLS handles scoping) — even though
  // they touch claim-scoped tables, they never call createServiceClient.
  'src/app/api/claims/[id]/messages/route.ts',
  'src/app/api/claims/[id]/messages/read/route.ts',
  'src/app/api/claims/[id]/mark-viewed/route.ts',
  'src/app/api/claims/[id]/star/route.ts',
  'src/app/api/claims/[id]/auto-message/route.ts',
  // Admin routes with intentional cross-company scope:
  //  - user delete counts a user's claims across every company.
  //  - status-phase-configs delete checks phase usage across every company.
  'src/app/api/admin/users/[id]/route.ts',
  'src/app/api/admin/status-phase-configs/[code]/route.ts',
]
const ROOT = 'src/app/api'

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

let violations = 0
for (const file of walk(ROOT)) {
  const norm = file.replaceAll('\\', '/')
  if (ALLOWED.some(a => norm.endsWith(a))) continue
  const src = readFileSync(file, 'utf8')

  // Only flag if the file uses the service client (bypasses RLS).
  if (!/createServiceClient\s*\(/.test(src)) continue

  for (const t of TABLES) {
    const re = new RegExp(`\\.from\\(['"\`]${t}['"\`]\\)`, 'g')
    if (re.test(src)) {
      if (!/scopedClient\s*\(/.test(src)) {
        console.error(`  ${norm}  raw createServiceClient + .from('${t}') without scopedClient()`)
        violations++
      }
    }
  }
}
if (violations > 0) {
  console.error(`\n${violations} raw claim-scoped service-client queries. Wrap with scopedClient(), or add to ALLOWED with reason.`)
  process.exit(1)
}
console.log('OK — no raw claim-scoped service-client queries in API routes.')
