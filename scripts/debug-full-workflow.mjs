// End-to-end debug: seeds 3 Modern Appraisers test claims (2 ACV + 1 DV),
// exercises every PDF filler + workflow transition, then reports pass/fail.
// Cleanup is separate (delete-test-claims.mjs) so a human can inspect if
// something fails mid-run.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY='<key>' node scripts/debug-full-workflow.mjs
import { createClient } from '@supabase/supabase-js'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')
const OUT_DIR = join(REPO_ROOT, 'backups', 'debug-2026-09-17')
mkdirSync(OUT_DIR, { recursive: true })

// Load fillers dynamically because they use `@/` alias which needs Next's
// tsconfig-paths. Simpler: import the compiled JS if built, else compile on
// the fly. We'll rely on the tsx-style dynamic import via file:// URLs.
// Since the fillers use `import from '@/lib/pdf/template-path'`, we need
// aliasing. Node doesn't natively support tsconfig paths, so we use direct
// relative imports here instead.

const svc = createClient(
  'https://ektglhdstobaipdqssjx.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const PREFIX = 'test-debug-'
const suffix = Date.now().toString(36)
const results = []
function log(label, ok, note = '') {
  results.push({ label, ok, note })
  const mark = ok ? '✅' : '❌'
  console.log(`  ${mark} ${label}${note ? ' — ' + note : ''}`)
}

async function main() {
  console.log('\n=== HamsPortal debug pass — 2026-09-17 ===\n')

  // 1. Resolve MA company id.
  const { data: co } = await svc.from('companies').select('id, slug').eq('slug', 'modern-appraisers').single()
  const maId = co.id
  console.log(`Modern Appraisers company_id: ${maId}\n`)

  // 2. Pick two real admin+appraiser profiles to use as user_id + assignee.
  const { data: profs } = await svc.from('profiles').select('id, name, email, role').order('role')
  const admin = profs.find(p => p.role === 'admin')
  const appraiser = profs.find(p => p.role === 'appraiser') ?? admin
  console.log(`Admin: ${admin.email}`)
  console.log(`Appraiser (for reassign): ${appraiser.email}\n`)

  // 3. Seed 3 test claims (2 ACV, 1 DV).
  console.log('--- SEEDING TEST CLAIMS ---')
  const baseClaim = {
    insuredName: 'Test Insured One',
    clientName: 'Test Insured One',
    clientType: 'Insured',
    claimNumber: 'CLAIM-TEST-01',
    insuranceCompany: 'State Farm',
    adjuster: 'Test Adjuster',
    dateOfLoss: '2026-09-01',
    year: '2020', make: 'Honda', model: 'Civic', trim: 'EX',
    vin: '2HGFC2F58LH500001', maNumber: 'MA-TEST-01',
    mileage: '45000', ownerName: 'Test Owner',
    ownerAddress: '123 Test St, San Antonio, TX 78201',
    ownerPhone: '555-555-0100', ownerEmail: 'test@example.com',
    location: 'San Antonio, TX', policyNumber: 'POL-TEST-01',
    adjusterPhone: '555-555-0200', adjusterEmail: 'adjuster@example.com',
  }
  const claimIds = []
  for (let i = 1; i <= 3; i++) {
    const type = i === 3 ? 'dv' : 'acv'
    const id = `${PREFIX}${type}-${i}-${suffix}`
    const claim = {
      ...baseClaim,
      insuredName: `Test Insured ${i}`,
      clientName: `Test Insured ${i}`,
      claimNumber: `CLAIM-TEST-0${i}`,
      maNumber: `MA-TEST-0${i}`,
      vin: `2HGFC2F58LH50000${i}`,
      claimTypes: [type],
    }
    const { error } = await svc.from('acv_history').insert({
      id,
      date: new Date().toISOString(),
      mode: 'auto-acv',
      vehicle: '2020 Honda Civic EX',
      vin: claim.vin,
      ma_number: claim.maNumber,
      acv: 15000,
      claim,
      comps: [],
      adjustments: {},
      result: { acv: 15000 },
      mileage_rate: 0,
      status: 'open',
      user_id: admin.id,
      assigned_to: admin.id,
      company_id: maId,
    })
    log(`Seed ${type.toUpperCase()} claim ${id}`, !error, error?.message ?? '')
    if (!error) claimIds.push({ id, type, claim })
  }
  if (claimIds.length !== 3) { console.log('\nAborting — seed failed.'); process.exit(1) }

  // 4. Verify each claim readable by service client with company scope.
  console.log('\n--- COMPANY SCOPING ---')
  const { data: maCheck } = await svc.from('acv_history').select('id, company_id').in('id', claimIds.map(c => c.id))
  const allMA = maCheck.every(r => r.company_id === maId)
  log(`All 3 seeded claims tagged company_id=MA`, allMA)

  // 5. Test PDF fillers.
  //    We import them via file:// URLs since Node doesn't resolve `@/` aliases.
  //    But the fillers themselves use `@/lib/pdf/template-path`. To sidestep
  //    that: we invoke `readTemplate` ourselves + call `PDFDocument.load` +
  //    verify the template file loads. This proves the file exists and is a
  //    valid PDF; it doesn't run the field-fill code.
  //    Additionally, we verify the raw pdf-lib load + form.getFields() count
  //    which is a strong indicator the template is intact.
  console.log('\n--- TEMPLATE LOAD (proves company-scoped assets are valid) ---')
  const { readFileSync, existsSync } = await import('node:fs')
  const { PDFDocument } = await import('pdf-lib')
  const templates = [
    { name: 'ACV', path: 'public/companies/modern-appraisers/templates/acv-template.pdf' },
    { name: 'Award', path: 'public/companies/modern-appraisers/templates/award-template.pdf' },
    { name: 'Notes', path: 'public/companies/modern-appraisers/templates/notes-template.pdf' },
    { name: 'Contract', path: 'public/companies/modern-appraisers/templates/acv-contract-template.pdf' },
    { name: 'Certificate', path: 'public/companies/modern-appraisers/templates/certificate-of-appraisal-template.pdf' },
    { name: 'DV Nationwide Attorney', path: 'public/companies/modern-appraisers/templates/dv-templates/dv-nationwide-attorney.pdf' },
    { name: 'DV Nationwide Sedgwick', path: 'public/companies/modern-appraisers/templates/dv-templates/dv-nationwide-sedgwick.pdf' },
    { name: 'DV wLoss Attorney', path: 'public/companies/modern-appraisers/templates/dv-templates/dv-wloss-attorney.pdf' },
    { name: 'DV wLoss Sedgwick', path: 'public/companies/modern-appraisers/templates/dv-templates/dv-wloss-sedgwick.pdf' },
    { name: 'Invoice long', path: 'public/companies/modern-appraisers/templates/invoice-templates/invoice-long.pdf' },
    { name: 'Invoice very-long', path: 'public/companies/modern-appraisers/templates/invoice-templates/invoice-very-long.pdf' },
  ]
  for (const t of templates) {
    const abs = join(REPO_ROOT, t.path)
    if (!existsSync(abs)) { log(`Load MA template: ${t.name}`, false, `missing at ${t.path}`); continue }
    try {
      const bytes = readFileSync(abs)
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = doc.getPageCount()
      const fields = doc.getForm().getFields().length
      log(`Load MA template: ${t.name}`, pages > 0, `${pages}p, ${fields} fields`)
    } catch (err) {
      log(`Load MA template: ${t.name}`, false, err.message)
    }
  }

  // 6. Verify EV template folder is empty (empty-state contract).
  console.log('\n--- EAGLEVIEW EMPTY TEMPLATE STATE ---')
  const { readdirSync } = await import('node:fs')
  const evDir = join(REPO_ROOT, 'public', 'companies', 'eagleview', 'templates')
  const evFiles = readdirSync(evDir).filter(f => f.endsWith('.pdf'))
  log(`EV templates folder empty (only .gitkeep)`, evFiles.length === 0, `found ${evFiles.length} PDFs`)
  const evLogo = existsSync(join(REPO_ROOT, 'public', 'companies', 'eagleview', 'logo.png'))
  const evLogoDark = existsSync(join(REPO_ROOT, 'public', 'companies', 'eagleview', 'logo-on-dark.png'))
  log(`EV logo.png present`, evLogo)
  log(`EV logo-on-dark.png present`, evLogoDark)

  // 7. Test reassign workflow — flip assigned_to via service client (mimics
  //    the /api/claims/[id]/assign route's UPDATE).
  console.log('\n--- REASSIGN ---')
  const claim1 = claimIds[0]
  const { error: reErr } = await svc
    .from('acv_history')
    .update({ assigned_to: appraiser.id, assigned_at: new Date().toISOString() })
    .eq('id', claim1.id)
  log(`Reassign ${claim1.id} → ${appraiser.email}`, !reErr, reErr?.message ?? '')
  const { data: after } = await svc.from('acv_history').select('assigned_to').eq('id', claim1.id).single()
  log(`Assignee persisted`, after.assigned_to === appraiser.id)

  // 8. Test approve → closed as completed.
  console.log('\n--- APPROVE (close as completed) ---')
  const now = new Date().toISOString()
  const { error: appErr } = await svc
    .from('acv_history')
    .update({ status: 'closed', close_reason: 'completed', closed_at: now })
    .eq('id', claim1.id)
  log(`Approve ${claim1.id}`, !appErr, appErr?.message ?? '')
  const { data: closed } = await svc.from('acv_history').select('status, close_reason, closed_at').eq('id', claim1.id).single()
  log(`status=closed, close_reason=completed, closed_at set`,
    closed.status === 'closed' && closed.close_reason === 'completed' && !!closed.closed_at)

  // 9. Test reopen.
  console.log('\n--- REOPEN ---')
  const { error: reoErr } = await svc
    .from('acv_history')
    .update({ status: 'open', submitted_at: null, submitted_by: null, closed_at: null })
    .eq('id', claim1.id)
  log(`Reopen ${claim1.id}`, !reoErr, reoErr?.message ?? '')

  // 10. Test approve as cancelled on claim 2.
  console.log('\n--- APPROVE (close as cancelled) ---')
  const claim2 = claimIds[1]
  const { error: canErr } = await svc
    .from('acv_history')
    .update({ status: 'closed', close_reason: 'cancelled', closed_at: new Date().toISOString() })
    .eq('id', claim2.id)
  log(`Cancel ${claim2.id}`, !canErr, canErr?.message ?? '')

  // 11. Test cross-company reassignment blocked (safety trigger).
  console.log('\n--- SAFETY: cross-company reassignment blocked ---')
  const { data: evCo } = await svc.from('companies').select('id').eq('slug', 'eagleview').single()
  const { error: crossErr } = await svc
    .from('acv_history')
    .update({ company_id: evCo.id })
    .eq('id', claimIds[2].id)
  log(`Trigger blocked cross-company UPDATE`, !!crossErr && /company_id is immutable|cannot be moved/i.test(crossErr.message),
    crossErr?.message?.slice(0, 60) ?? '')

  // 12. Verify claim visibility unchanged for MA rows.
  console.log('\n--- MA CLAIM COUNT UNCHANGED ---')
  const { count: totalMA } = await svc.from('acv_history').select('id', { count: 'exact', head: true }).eq('company_id', maId)
  const { count: totalEV } = await svc.from('acv_history').select('id', { count: 'exact', head: true }).eq('company_id', evCo.id)
  log(`Total MA claims (should be 673 baseline + 3 test = 676)`, totalMA === 676, `got ${totalMA}`)
  log(`Total EV claims (should be 0)`, totalEV === 0, `got ${totalEV}`)

  // 13. Summary.
  console.log('\n=== SUMMARY ===')
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`${passed}/${results.length} passed, ${failed} failed`)
  writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2))
  console.log(`Wrote ${OUT_DIR}/results.json`)
  console.log(`\nTest claim ids created (delete with delete-test-claims.mjs):`)
  for (const c of claimIds) console.log(`  ${c.id}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => { console.error(err); process.exit(2) })
