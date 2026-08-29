import { LicensedStatesClient } from './licensed-states-client'

export default function AdminSettingsLicensedStatesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Licensed States</h1>
      <p className="text-sm text-gray-500 mb-6">
        States that require an appraiser license to work claims. Claims from these states get a badge
        on the dashboard flagging whether the assigned appraiser is licensed.
      </p>
      <LicensedStatesClient />
    </div>
  )
}
