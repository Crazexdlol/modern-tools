import { redirect } from 'next/navigation'

// State Tax Rules moved under Tool Settings → Estimate Dispute on 2026-10-04.
// The route stays live as a permanent redirect so existing bookmarks still
// land in the right place. The client UI itself lives at
// state-tax-rules-client.tsx and is now rendered from
// /admin/settings/tools/estimate-dispute.
export default function AdminSettingsStateTaxRulesPage() {
  redirect('/admin/settings/tools/estimate-dispute')
}
