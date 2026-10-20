import { redirect } from 'next/navigation'

// The old Account & Password page has been folded into /my-profile (with
// a Password tab). Any lingering bookmarks or links land here and get
// forwarded.
export default function ProfilePage() {
  redirect('/my-profile')
}
