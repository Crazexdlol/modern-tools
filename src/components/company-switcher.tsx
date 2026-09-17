'use client'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { ChevronDown, Check } from 'lucide-react'
import { useUserCompanies } from '@/hooks/use-user-companies'

// Renders nothing if the user only has access to one company (or none).
// Otherwise shows a pill with the active company's logo+name; the dropdown
// lists every company the user can switch to. Clicking switches via
// /api/company/switch and reloads the page so all in-memory state resets.
export function CompanySwitcher() {
  const { companies, activeCompanyId, loading } = useUserCompanies()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (loading || companies.length <= 1) return null
  const active = companies.find(c => c.id === activeCompanyId) ?? companies[0]

  async function switchTo(companyId: string) {
    if (companyId === activeCompanyId) { setOpen(false); return }
    setBusy(true)
    const r = await fetch('/api/company/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    })
    if (!r.ok) {
      setBusy(false)
      const body = await r.json().catch(() => ({} as { error?: string }))
      alert(body.error ?? 'Switch failed')
      return
    }
    window.location.reload()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-2 px-2.5 py-1 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 text-xs font-medium text-gray-200 transition-colors"
        title={`Working as ${active.name} — click to switch`}
      >
        <Image src={active.logoPath} alt={active.name} width={20} height={20} className="h-5 w-5 object-contain" />
        {active.name}
        <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg z-30 overflow-hidden">
          {companies.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => switchTo(c.id)}
              disabled={busy}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              <Image src={c.logoPath} alt={c.name} width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="flex-1 text-left">{c.name}</span>
              {c.id === activeCompanyId && <Check className="w-4 h-4 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
