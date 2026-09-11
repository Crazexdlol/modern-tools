import { SuperAdminGuard } from '@/app/admin/_guard'
import { ActivityClient } from './activity-client'

export default async function ActivityPage() {
  await SuperAdminGuard()
  return <ActivityClient />
}
