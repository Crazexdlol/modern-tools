import { SuperAdminGuard } from '@/app/admin/_guard'
import { UserActivityClient } from './user-activity-client'

export default async function UserActivityPage({
  params,
}: { params: Promise<{ userId: string }> }) {
  await SuperAdminGuard()
  const { userId } = await params
  return <UserActivityClient userId={userId} />
}
