import { UsersAdminClient } from '@/app/admin/users/users-admin-client'

export default function AdminSettingsUsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <UsersAdminClient />
    </div>
  )
}
