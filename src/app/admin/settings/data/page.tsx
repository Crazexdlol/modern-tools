import { DataClient } from './data-client'

export default function AdminSettingsDataPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Data</h1>
      <DataClient />
    </div>
  )
}
