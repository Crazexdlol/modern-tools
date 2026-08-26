'use client'

import { useState } from 'react'
import { useCurrentProfile } from '@/lib/supabase/profiles'
import { createClient } from '@/lib/supabase/client'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'

export default function ProfilePage() {
  const { profile, loading, refresh } = useCurrentProfile()
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState(false)
  const [nameErr, setNameErr] = useState<string | null>(null)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  const email = profile?.email ?? ''
  const displayName = profile?.name ?? ''

  const saveName = async () => {
    setNameErr(null)
    setSavedName(false)
    const value = (name || displayName).trim()
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({})) as { error?: string }
      setNameErr(b.error ?? 'Save failed')
      return
    }
    setSavedName(true)
    refresh()
  }

  const changePassword = async () => {
    setPwErr(null)
    setPwMessage(null)
    if (newPw.length < 8) {
      setPwErr('New password must be 8+ characters')
      return
    }
    if (newPw !== confirmPw) {
      setPwErr('New passwords do not match')
      return
    }
    const supabase = createClient()
    // Re-authenticate with current password to prove ownership.
    if (!email) {
      setPwErr('No email on profile')
      return
    }
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPw,
    })
    if (reauthErr) {
      setPwErr('Current password is incorrect')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      setPwErr(error.message)
      return
    }
    setPwMessage('Password updated')
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppHeader />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Profile</h1>
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-8">
            <section className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Name</h2>
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <div className="text-sm text-gray-700 mt-1">{email}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Display name</label>
                <input
                  className="w-full mt-1 bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                  defaultValue={displayName}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              {nameErr && <div className="text-red-600 text-sm">{nameErr}</div>}
              {savedName && <div className="text-green-700 text-sm">Saved</div>}
              <Button onClick={saveName} className="bg-blue-600 text-white">
                Save Name
              </Button>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold">Password</h2>
              <input
                type="password"
                placeholder="Current password"
                className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
              />
              <input
                type="password"
                placeholder="New password (8+ chars)"
                className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
              {pwErr && <div className="text-red-600 text-sm">{pwErr}</div>}
              {pwMessage && <div className="text-green-700 text-sm">{pwMessage}</div>}
              <Button onClick={changePassword} className="bg-blue-600 text-white">
                Change Password
              </Button>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
