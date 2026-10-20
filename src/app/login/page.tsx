"use client"

import { useState } from 'react'
import Image from 'next/image'
import { Loader2, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        // Deliberately generic — raw Supabase messages leak enumeration
        // signal ("Email not confirmed" vs "Invalid credentials" lets an
        // attacker test which emails are registered). Keep it opaque.
        if (error.message) console.warn('login error:', error.message)
        setError('Invalid email or password.')
        setLoading(false)
      } else {
        // Full page reload after login: SPA navigation would preserve any
        // stale module-level caches (e.g. the profile cache in
        // src/lib/supabase/profiles.ts) from a prior account in the same
        // tab, causing the header dropdown and New Claim button to show
        // the previous user until a manual hard-refresh.
        window.location.href = '/'
      }
    } catch {
      // Same opaque message for network-layer failures.
      setError('Invalid email or password.')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-4 py-16">
      {/* Ambient background — two soft radial washes so the page has depth
          without a busy image. Contained to the viewport, doesn't scroll. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-blue-200/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-indigo-200/25 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Hero — big logo + wordmark. Sits above the card so it reads as a
            page identity, not a modal decoration. */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-5">
            <div aria-hidden className="absolute inset-0 blur-2xl bg-blue-300/30 rounded-full scale-90" />
            <Image
              src="/hamsportal-logo.png"
              alt="HamsPortal"
              width={144}
              height={144}
              className="relative h-32 w-32 md:h-36 md:w-36 drop-shadow-sm"
              priority
            />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-[0.2em] text-slate-900">
            <span className="uppercase">HAMS</span><span className="text-[#1a3a70]"> Portal</span>
          </h1>
        </div>

        {/* Form card */}
        <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-2xl shadow-xl shadow-slate-300/30 p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold tracking-[0.2em] uppercase text-slate-900">Login</h2>
            <p className="text-xs text-slate-500 mt-1.5">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                autoComplete="email"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 text-center bg-red-50 border border-red-100 rounded-md py-1.5">{error}</p>
            )}
            <Button
              type="submit"
              disabled={!email || !password || loading}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-sm transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
            </Button>
          </form>
        </div>

      </div>
    </div>
  )
}
