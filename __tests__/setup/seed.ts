import { serviceClient, TEST_PREFIX } from './env'

export interface SeedHandles {
  maCompanyId: string
  evCompanyId: string
  maUser: { userId: string; email: string; password: string }
  evUser: { userId: string; email: string; password: string }
  dualUser: { userId: string; email: string; password: string }
  maClaim: { id: string }
  evClaim: { id: string }
}

const PASSWORD = 'Test-Isolation-2026!'

export async function seedForIsolation(): Promise<SeedHandles> {
  const svc = serviceClient()

  const { data: companies, error: cErr } = await svc.from('companies').select('id, slug')
  if (cErr) throw cErr
  const maCompanyId = companies!.find(c => c.slug === 'modern-appraisers')!.id
  const evCompanyId = companies!.find(c => c.slug === 'eagleview')!.id

  const suffix = Date.now().toString(36)
  async function createUser(role: 'ma' | 'ev' | 'dual') {
    const email = `${TEST_PREFIX}${role}-${suffix}@example.com`
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    })
    if (error) throw error
    const userId = data.user!.id
    // Profile is auto-created by the on_auth_user_created trigger. Give it a name.
    await svc.from('profiles').update({ name: `${TEST_PREFIX}${role}` }).eq('id', userId)
    return { userId, email, password: PASSWORD }
  }

  const maUser = await createUser('ma')
  const evUser = await createUser('ev')
  const dualUser = await createUser('dual')
  // Make dualUser an admin so they see all claims scoped to their active
  // company (the realistic scenario for the switch flow — admins switch
  // between companies to work each book).
  await svc.from('profiles').update({ role: 'admin' }).eq('id', dualUser.userId)

  // Grant company access via user_companies.
  await svc.from('user_companies').insert([
    { user_id: maUser.userId,   company_id: maCompanyId },
    { user_id: evUser.userId,   company_id: evCompanyId },
    { user_id: dualUser.userId, company_id: maCompanyId },
    { user_id: dualUser.userId, company_id: evCompanyId },
  ])
  await svc.from('profiles').update({ active_company_id: maCompanyId }).eq('id', maUser.userId)
  await svc.from('profiles').update({ active_company_id: evCompanyId }).eq('id', evUser.userId)
  await svc.from('profiles').update({ active_company_id: maCompanyId }).eq('id', dualUser.userId)

  // Seed one MA claim and one EV claim.
  const maClaimId = `${TEST_PREFIX}ma-${suffix}`
  const evClaimId = `${TEST_PREFIX}ev-${suffix}`
  const baseClaim = {
    date: new Date().toISOString(),
    mode: 'auto-acv',
    vehicle: 'Test Vehicle',
    vin: '00000000000000000',
    ma_number: `TEST-${suffix}`,
    acv: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    claim: { insuredName: 'Test Insured' } as any,
    status: 'open',
  }
  await svc.from('acv_history').insert([
    { ...baseClaim, id: maClaimId, user_id: maUser.userId, assigned_to: maUser.userId, company_id: maCompanyId },
    { ...baseClaim, id: evClaimId, user_id: evUser.userId, assigned_to: evUser.userId, company_id: evCompanyId },
  ])

  return { maCompanyId, evCompanyId, maUser, evUser, dualUser, maClaim: { id: maClaimId }, evClaim: { id: evClaimId } }
}
