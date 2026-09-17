import { test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { anonClientAs, serviceClient } from './setup/env'

let handles: SeedHandles
beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

test('dual-company user switches active company and sees different data', async () => {
  const svc = serviceClient()

  // Seed sets dualUser.active_company_id = MA. Verify they see MA claim only.
  const c1 = await anonClientAs(handles.dualUser.email, handles.dualUser.password)
  const { data: seen1 } = await c1.from('acv_history').select('id')
  expect(seen1!.some(r => r.id === handles.maClaim.id)).toBe(true)
  expect(seen1!.some(r => r.id === handles.evClaim.id)).toBe(false)

  // Switch to EV via service client (simulates /api/company/switch).
  await svc
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ active_company_id: handles.evCompanyId } as any)
    .eq('id', handles.dualUser.userId)

  // Re-auth (new session picks up new active_company_id on each RLS call).
  const c2 = await anonClientAs(handles.dualUser.email, handles.dualUser.password)
  const { data: seen2 } = await c2.from('acv_history').select('id')
  expect(seen2!.some(r => r.id === handles.evClaim.id)).toBe(true)
  expect(seen2!.some(r => r.id === handles.maClaim.id)).toBe(false)
})
