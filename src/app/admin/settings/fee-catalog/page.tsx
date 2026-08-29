import { FeeCatalogClient } from './fee-catalog-client'

export default function AdminSettingsFeeCatalogPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Fee Catalog</h1>
      <p className="text-sm text-gray-500 mb-6">The list of fee types every appraiser profile shows. Archive a fee to hide it from profiles without deleting the historical amounts.</p>
      <FeeCatalogClient />
    </div>
  )
}
