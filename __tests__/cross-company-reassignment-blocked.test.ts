import { test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { serviceClient } from './setup/env'

let handles: SeedHandles
beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

test('service client cannot change acv_history.company_id — trigger fires', async () => {
  // acv_history_appraiser_guard checks company_id immutability BEFORE the
  // service_role bypass. Even a service-role UPDATE should error.
  const svc = serviceClient()
  const { error } = await svc
    .from('acv_history')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ company_id: handles.evCompanyId } as any)
    .eq('id', handles.maClaim.id)
  expect(error).toBeTruthy()
  expect(String(error?.message ?? '')).toMatch(/company_id is immutable|cannot be moved between companies/i)
})
