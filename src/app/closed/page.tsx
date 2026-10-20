import { redirect } from 'next/navigation'

// /closed is the historical URL; the current page lives at /claims.
export default function ClosedRedirect() {
  redirect('/claims')
}
