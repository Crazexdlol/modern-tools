"use client"

import { useEffect } from 'react'
import { migrateLocalStorageToSupabase } from '@/lib/supabase/history'

const MIGRATED_KEY = 'modern-tools-migrated-to-supabase'

export function MigrateData() {
  useEffect(() => {
    if (localStorage.getItem(MIGRATED_KEY)) return
    migrateLocalStorageToSupabase().then(() => {
      localStorage.setItem(MIGRATED_KEY, 'true')
    })
  }, [])

  return null
}
