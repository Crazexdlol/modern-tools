import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { seedForIsolation, type SeedHandles } from './setup/seed'
import { cleanupAll } from './setup/cleanup'
import { anonClientAs } from './setup/env'

let handles: SeedHandles

beforeAll(async () => { handles = await seedForIsolation() }, 30_000)
afterAll(async () => { await cleanupAll() }, 30_000)

describe('MA-only user against EV claim', () => {
  test('SELECT claims returns MA claim only', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data } = await ma.from('acv_history').select('id, company_id')
    expect(data).toBeTruthy()
    expect(data!.some(r => r.id === handles.maClaim.id)).toBe(true)
    expect(data!.some(r => r.id === handles.evClaim.id)).toBe(false)
  })

  test('SELECT EV claim by id returns nothing (404-shaped)', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data } = await ma.from('acv_history').select('id').eq('id', handles.evClaim.id).maybeSingle()
    expect(data).toBeNull()
  })

  test('UPDATE EV claim is a no-op (RLS filters WHERE)', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data, error } = await ma.from('acv_history').update({ vehicle: 'Hacked' }).eq('id', handles.evClaim.id).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  test('DELETE EV claim is a no-op', async () => {
    const ma = await anonClientAs(handles.maUser.email, handles.maUser.password)
    const { data, error } = await ma.from('acv_history').delete().eq('id', handles.evClaim.id).select('id')
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })
})

describe('EV-only user against MA claim', () => {
  test('SELECT claims returns EV claim only', async () => {
    const ev = await anonClientAs(handles.evUser.email, handles.evUser.password)
    const { data } = await ev.from('acv_history').select('id, company_id')
    expect(data).toBeTruthy()
    expect(data!.some(r => r.id === handles.evClaim.id)).toBe(true)
    expect(data!.some(r => r.id === handles.maClaim.id)).toBe(false)
  })

  test('SELECT MA claim by id returns nothing', async () => {
    const ev = await anonClientAs(handles.evUser.email, handles.evUser.password)
    const { data } = await ev.from('acv_history').select('id').eq('id', handles.maClaim.id).maybeSingle()
    expect(data).toBeNull()
  })
})
