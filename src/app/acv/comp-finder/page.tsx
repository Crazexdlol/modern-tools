import { redirect } from 'next/navigation'

// The comp-finder now lives inside the claim workspace (/claims/[id]).
export default function CompFinderRedirect() {
  redirect('/')
}
