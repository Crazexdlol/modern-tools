import { ClientsAdminClient } from './clients-admin-client'

export default function AdminSettingsClientsPage() {
  return (
    <div>
      <h1 className="hp-display mb-6">Clients</h1>
      <ClientsAdminClient />
    </div>
  )
}
