'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface Company {
  id: string
  slug: string
  name: string
  logo_path: string
  brand_color: string
}

// Admin panel: check the boxes for the companies this user should have access
// to. Save PUTs to /api/admin/users/[id]/companies with the desired set.
export function CompaniesTab({ userId }: { userId: string }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initial, setInitial] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const rAll = await fetch('/api/admin/companies', { cache: 'no-store' })
      const jsonAll = rAll.ok ? await rAll.json() as { companies: Company[] } : { companies: [] as Company[] }
      setCompanies(jsonAll.companies ?? [])
      const rMine = await fetch(`/api/admin/users/${userId}/companies`, { cache: 'no-store' })
      const jsonMine = rMine.ok ? await rMine.json() as { companyIds: string[] } : { companyIds: [] as string[] }
      const ids = new Set<string>(jsonMine.companyIds ?? [])
      setSelected(ids)
      setInitial(ids)
      setLoading(false)
    })()
  }, [userId])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const dirty = selected.size !== initial.size || [...selected].some(id => !initial.has(id))

  async function save() {
    setSaving(true); setMessage(null)
    const r = await fetch(`/api/admin/users/${userId}/companies`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: [...selected] }),
    })
    setSaving(false)
    if (!r.ok) {
      const body = await r.json().catch(() => ({} as { error?: string }))
      setMessage(body.error ?? 'Save failed')
      return
    }
    setInitial(new Set(selected))
    setMessage('Saved.')
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }

  return (
    <div className="space-y-4 max-w-md">
      <h3 className="text-sm font-semibold text-gray-900">Company access</h3>
      <div className="space-y-2">
        {companies.map(c => (
          <label key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Image src={c.logo_path} alt={c.name} width={24} height={24} className="h-6 w-6 object-contain" />
            <span className="text-sm font-medium text-gray-800">{c.name}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving} className="bg-emerald-600 hover:bg-emerald-500 text-white">
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {message && <span className={`text-xs ${message === 'Saved.' ? 'text-emerald-600' : 'text-red-600'}`}>{message}</span>}
      </div>
    </div>
  )
}
