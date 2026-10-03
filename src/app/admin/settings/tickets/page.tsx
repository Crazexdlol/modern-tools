import { SuperAdminGuard } from '@/app/admin/_guard'
import { TicketsClient } from './tickets-client'

export default async function AdminSettingsTicketsPage() {
  await SuperAdminGuard()
  return (
    <div>
      <h1 className="hp-display mb-6">Tickets</h1>
      <TicketsClient />
    </div>
  )
}
