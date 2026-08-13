import { redirect } from 'next/navigation'

// Estimate Dispute now lives inside each claim (/claims/[id], Estimate Dispute
// tab). Old standalone estimate_history rows remain in the DB, untouched.
export default function EstimateDisputeRedirect() {
  redirect('/')
}
