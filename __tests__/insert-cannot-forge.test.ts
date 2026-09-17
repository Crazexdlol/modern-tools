import { test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { anonClientAs, serviceClient, TEST_PREFIX } from './setup/env'

let handles: SeedHandles
beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

test('MA-user INSERT with body-supplied EV company_id is rejected by RLS', async () => {
  const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
  const forgedId = `${TEST_PREFIX}forged-${Date.now()}`
  const { error } = await ma.from('acv_history').insert({
    id: forgedId,
    date: new Date().toISOString(),
    mode: 'auto-acv',
    vehicle: 'Forge Attempt',
    vin: '00000000000000000',
    ma_number: 'FORGE-01',
    acv: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    claim: { insuredName: 'x' } as any,
    status: 'open',
    user_id: handles.maUser.userId,
    // MA-user should NOT be able to place a row into EV — RLS WITH CHECK
    // requires active_company_id() = company_id, and the MA user's active is MA.
    company_id: handles.evCompanyId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  expect(error).toBeTruthy()
  // Sanity: no row landed in EV.
  const svc = serviceClient()
  const { data: check } = await svc.from('acv_history').select('id').eq('id', forgedId)
  expect(check ?? []).toEqual([])
})
