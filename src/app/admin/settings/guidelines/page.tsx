import { GuidelinesClient } from './guidelines-client'

export default function AdminSettingsGuidelinesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Insurance Guidelines</h1>
      <GuidelinesClient />
    </div>
  )
}
