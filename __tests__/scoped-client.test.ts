import { test, expect, vi } from 'vitest'
import { scopedClient, CLAIM_SCOPED_TABLES } from '@/lib/supabase/scoped'

test('scopedClient injects .eq(company_id) on SELECT', async () => {
  const fakeChain = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeService: any = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService, 'ma-uuid')

  client.from('acv_history').select('*')

  expect(fakeService.from).toHaveBeenCalledWith('acv_history')
  expect(fakeChain.select).toHaveBeenCalledWith('*')
  expect(fakeChain.eq).toHaveBeenCalledWith('company_id', 'ma-uuid')
})

test('scopedClient injects company_id on INSERT', () => {
  const fakeChain = { insert: vi.fn().mockReturnThis() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeService: any = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService, 'ma-uuid')

  client.from('acv_history').insert({ id: 'x', vin: '00000000000000000' })

  expect(fakeChain.insert).toHaveBeenCalledWith({ id: 'x', vin: '00000000000000000', company_id: 'ma-uuid' })
})

test('scopedClient injects company_id into every row of an INSERT array', () => {
  const fakeChain = { insert: vi.fn().mockReturnThis() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeService: any = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService, 'ma-uuid')

  client.from('messages').insert([{ id: 'a' }, { id: 'b' }])

  expect(fakeChain.insert).toHaveBeenCalledWith([
    { id: 'a', company_id: 'ma-uuid' },
    { id: 'b', company_id: 'ma-uuid' },
  ])
})

test('scopedClient session wins — body-supplied company_id is overridden', () => {
  const fakeChain = { insert: vi.fn().mockReturnThis() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeService: any = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService, 'ma-uuid')

  client.from('acv_history').insert({ id: 'x', company_id: 'ev-uuid-forged' })

  expect(fakeChain.insert).toHaveBeenCalledWith({ id: 'x', company_id: 'ma-uuid' })
})

test('scopedClient does NOT wrap non-claim-scoped tables', () => {
  const fakeChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeService: any = { from: vi.fn().mockReturnValue(fakeChain) }
  const client = scopedClient(fakeService, 'ma-uuid')

  client.from('profiles').select('*')

  expect(fakeService.from).toHaveBeenCalledWith('profiles')
  expect(fakeChain.eq).not.toHaveBeenCalled()
})

test('CLAIM_SCOPED_TABLES lists exactly the 9 tables from the migration', () => {
  expect(new Set(CLAIM_SCOPED_TABLES)).toEqual(new Set([
    'acv_history', 'messages', 'message_reads', 'user_claim_views', 'estimate_history',
    'clients', 'client_contacts', 'client_marketing_log', 'insurance_guidelines',
  ]))
})
