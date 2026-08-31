import { StatusPhasesClient } from './status-phases-client'

export default function AdminSettingsStatusPhasesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Status Phases</h1>
      <StatusPhasesClient />
    </div>
  )
}
