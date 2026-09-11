'use client'

import { useEffect, useRef } from 'react'
import { useCurrentProfile } from '@/lib/supabase/profiles'

const TICK_MS = 60_000
const IDLE_MS = 120_000  // 2 minutes of no interaction => stop crediting

// Client-only. Fires POST /api/activity/heartbeat every 60s while:
//   - the tab is visible (document.visibilityState === 'visible')
//   - the window has focus (document.hasFocus())
//   - the user interacted (mouse/keyboard/scroll/touch) within the last 2 min
// Multi-tab dedup is handled server-side; this hook can safely fire from every tab.
export function ActivityHeartbeat() {
  const { profile } = useCurrentProfile()
  const lastInteractionRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!profile) return

    const markInteraction = () => { lastInteractionRef.current = Date.now() }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'pointerdown']
    events.forEach(e => window.addEventListener(e, markInteraction, { passive: true }))

    const fire = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      if (!document.hasFocus()) return
      if (Date.now() - lastInteractionRef.current > IDLE_MS) return

      const url = '/api/activity/heartbeat'
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([], { type: 'application/json' }))
        } else {
          void fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
        }
      } catch { /* swallow */ }
    }

    // Fire once shortly after mount so the "landed on the app 15 seconds ago"
    // case still counts a tick, then continue on 60s intervals.
    const firstTimeout = setTimeout(fire, 5_000)
    const interval = setInterval(fire, TICK_MS)

    return () => {
      clearTimeout(firstTimeout)
      clearInterval(interval)
      events.forEach(e => window.removeEventListener(e, markInteraction))
    }
  }, [profile])

  return null
}
