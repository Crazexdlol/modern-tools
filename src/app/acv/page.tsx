import { redirect } from 'next/navigation'

// The ACV claim list is now the home dashboard.
export default function ACVRedirect() {
  redirect('/')
}
