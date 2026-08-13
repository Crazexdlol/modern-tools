import { redirect } from 'next/navigation'

// Closed claims now live in the All Claims list.
export default function ClosedRedirect() {
  redirect('/claims')
}
