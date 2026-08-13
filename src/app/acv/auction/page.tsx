import { redirect } from 'next/navigation'

// Loss Search now lives inside the claim workspace (/claims/[id], Loss Search tab).
export default function LossSearchRedirect() {
  redirect('/')
}
