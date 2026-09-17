"use client"

import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Full page reload on account switch: SPA navigation would preserve
    // client-side state (profile cache, dashboard fetches, etc.), causing
    // the stale-account bug where the top-right dropdown and New Claim
    // button reflect the previous user.
    window.location.href = '/login'
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-400 transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Logout
    </button>
  )
}
