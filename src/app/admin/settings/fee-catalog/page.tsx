import { FeeCatalogClient } from './fee-catalog-client'

export default function AdminSettingsFeeCatalogPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Fee Catalog</h1>
      <FeeCatalogClient />
    </div>
  )
}
