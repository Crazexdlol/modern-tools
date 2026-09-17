import { serviceClient, TEST_PREFIX } from './env'

export async function cleanupAll(): Promise<void> {
  const svc = serviceClient()

  // Delete claims by prefix (cascades to messages, message_reads, user_claim_views).
  await svc.from('acv_history').delete().like('id', `${TEST_PREFIX}%`)

  // Delete auth users by prefix (cascades to profiles + user_companies via FKs).
  const { data: users } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const testUsers = (users?.users ?? []).filter(u => (u.email ?? '').startsWith(TEST_PREFIX))
  for (const u of testUsers) {
    await svc.auth.admin.deleteUser(u.id)
  }
}
