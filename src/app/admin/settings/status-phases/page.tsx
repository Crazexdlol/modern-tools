import { StatusPhasesClient } from './status-phases-client'

export default function AdminSettingsStatusPhasesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Status Phases</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configure the claim phases shown in the dashboard Status column and filter buttons.
        Archive a phase to hide it without removing it from claims that already use it.
      </p>
      <StatusPhasesClient />
    </div>
  )
}
