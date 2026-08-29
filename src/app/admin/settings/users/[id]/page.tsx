import { ProfileDetailClient } from './profile-detail-client'

export default async function AdminSettingsUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div>
      <ProfileDetailClient userId={id} />
    </div>
  )
}
