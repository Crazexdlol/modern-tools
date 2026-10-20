"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Mail, Plus, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchAllProfilesBrowser, useCurrentProfile, isPickerVisible, type Profile } from '@/lib/supabase/profiles'
import { fetchAllClients, type Client } from '@/lib/supabase/clients'
import { normalizeCompanyKey } from '@/lib/company-match'

type Stage = 'main' | 'qc' | 'billing_delivery' | 'payment'

const STAGES: { key: Stage; label: string; description: string }[] = [
  { key: 'main', label: 'New Assignments', description: 'A claim gets assigned to an appraiser (new or reassignment).' },
  { key: 'qc', label: 'QC', description: 'A claim is submitted and lands on the QC dashboard.' },
  { key: 'billing_delivery', label: 'Billing/Delivery', description: 'A claim advances to Billing/Delivery.' },
  { key: 'payment', label: 'Payment', description: 'A claim advances to Payment.' },
]

type TabKey = 'broadcast' | 'rough' | 'stages' | 'digest'

export function NotificationsClient() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [clients, setClients] = useState<Client[] | null>(null)
  const { profile: currentProfile } = useCurrentProfile()
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [tab, setTab] = useState<TabKey>('broadcast')

  useEffect(() => {
    fetchAllProfilesBrowser().then(setProfiles)
    fetchAllClients().then(setClients).catch(() => setClients([]))
    fetch('/api/admin/site-settings')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json: { settings?: Record<string, unknown> }) => setSettings(json.settings ?? {}))
      .catch(() => setSettings({}))
      .finally(() => setSettingsLoaded(true))
  }, [])

  async function patchSetting(key: string, value: unknown) {
    const res = await fetch('/api/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error ?? 'Save failed')
    }
    setSettings((prev) => ({ ...(prev ?? {}), [key]: value }))
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'broadcast', label: 'Broadcast' },
    { key: 'rough', label: 'Rough Numbers' },
    { key: 'stages', label: 'Stage alerts' },
  ]
  if (currentProfile?.isSuperAdmin) tabs.push({ key: 'digest', label: 'Daily digest' })

  return (
    <div className="max-w-3xl space-y-6">
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'broadcast' && <BroadcastTab profiles={profiles} />}

      {tab === 'rough' && (
        <RoughNumbersInboxTab
          profiles={profiles}
          settingsLoaded={settingsLoaded}
          currentId={typeof settings?.rough_numbers_inbox_owner_id === 'string' ? settings.rough_numbers_inbox_owner_id : ''}
          onSave={(v) => patchSetting('rough_numbers_inbox_owner_id', v)}
        />
      )}

      {tab === 'stages' && (
        <StagesTab
          profiles={profiles}
          clients={clients}
          settingsLoaded={settingsLoaded}
          settings={settings ?? {}}
          patchSetting={patchSetting}
        />
      )}

      {tab === 'digest' && currentProfile?.isSuperAdmin && (
        <DigestTab
          settingsLoaded={settingsLoaded}
          currentList={Array.isArray(settings?.daily_digest_recipients) ? (settings.daily_digest_recipients as string[]) : []}
          onSave={(list) => patchSetting('daily_digest_recipients', list)}
        />
      )}
    </div>
  )
}


function ClientNameAutocomplete({
  value,
  clients,
  onChange,
  onCommit,
}: {
  value: string
  clients: Client[] | null
  // Called on every keystroke — parent should update its local state only.
  onChange: (v: string) => void
  // Called with the finalized value (pick / Enter / blur). Parent should
  // update state AND persist using the explicit value — avoids stale-closure
  // bugs where a persist read of parent state misses the just-set value.
  onCommit: (finalValue: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!clients) return []
    const list = q
      ? clients.filter((c) => c.name.toLowerCase().includes(q)).filter((c) => c.name.toLowerCase() !== q)
      : clients
    return list.slice(0, 8)
  }, [value, clients])

  useEffect(() => { setHighlight(0) }, [value])

  function pick(name: string) {
    onChange(name)
    setOpen(false)
    onCommit(name)
  }

  return (
    <div ref={wrapRef} className="flex-1 relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null
          if (next && wrapRef.current?.contains(next)) return
          setOpen(false)
          onCommit(value)
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, suggestions.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[highlight].name) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
        placeholder={clients === null ? 'Loading clients…' : 'Client name (e.g. Sedgwick)'}
        className="w-full bg-white border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
      />
      {open && rect && suggestions.length > 0 && (
        <div
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, zIndex: 60 }}
          className="bg-white border border-gray-200 rounded-md shadow-lg max-h-[240px] overflow-y-auto"
        >
          {suggestions.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(c.name) }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-1.5 text-sm border-b border-gray-50 last:border-b-0 ${i === highlight ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {open && rect && clients !== null && suggestions.length === 0 && value.trim() && (
        <div
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, zIndex: 60 }}
          className="bg-white border border-gray-200 rounded-md shadow-lg px-3 py-1.5 text-xs text-gray-400 italic"
        >
          No matching client — will save as free-text.
        </div>
      )}
    </div>
  )
}

// -------- Tab: Rough Numbers inbox --------

function RoughNumbersInboxTab({
  profiles,
  settingsLoaded,
  currentId,
  onSave,
}: {
  profiles: Profile[] | null
  settingsLoaded: boolean
  currentId: string
  onSave: (v: string) => Promise<void>
}) {
  const adminOptions = useMemo(
    () => (profiles ?? []).filter((p) => isPickerVisible(p) && p.isActive && p.role === 'admin'),
    [profiles],
  )

  const [selectedId, setSelectedId] = useState<string>(currentId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => { setSelectedId(currentId) }, [currentId])

  async function save(nextId: string) {
    setSelectedId(nextId)
    setSaving(true)
    setError(null)
    try {
      await onSave(nextId)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-black text-lg font-bold tracking-tight">Rough Numbers inbox owner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          When an appraiser submits a claim with <b>Needs rough numbers</b> on, the claim is parked with this admin instead of going to QC. They coordinate the client response and either submit to QC themselves (report-only path) or reassign to a negotiating appraiser. Cycle time pauses while the claim is parked.
        </p>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inbox owner</div>
          <select
            value={selectedId}
            onChange={(e) => save(e.target.value)}
            disabled={!settingsLoaded || saving || profiles === null}
            className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          >
            <option value="">— None (rough-numbers submits will error) —</option>
            {adminOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name || p.email}</option>
            ))}
          </select>
          <div className="text-xs text-gray-500 h-4 flex items-center gap-2">
            {saving && (<><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>)}
            {!saving && savedAt && <span className="text-emerald-600">Saved</span>}
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

// -------- Tab: Stage alerts (watchers + per-client overrides) --------

type OverrideRow = { client: string; adminId: string }
type OverrideStage = Exclude<Stage, 'main'>

const OVERRIDE_SETTING_KEY: Record<OverrideStage, string> = {
  qc: 'completion_admin_by_client',
  billing_delivery: 'billing_admin_by_client',
  payment: 'payment_admin_by_client',
}

interface StageOverrides {
  rows: OverrideRow[]
  adminOptions: Profile[]
  clients: Client[] | null
  profilesReady: boolean
  onAdd: () => void
  onRemove: (idx: number) => void
  onTypeClient: (idx: number, v: string) => void
  onCommitClient: (idx: number, v: string) => void
  onPickAdmin: (idx: number, v: string) => void
}

function StagesTab({
  profiles,
  clients,
  settingsLoaded,
  settings,
  patchSetting,
}: {
  profiles: Profile[] | null
  clients: Client[] | null
  settingsLoaded: boolean
  settings: Record<string, unknown>
  patchSetting: (key: string, value: unknown) => Promise<void>
}) {
  const [watchers, setWatchers] = useState<Record<Stage, string[]>>({
    main: [], qc: [], billing_delivery: [], payment: [],
  })
  const [overrideRows, setOverrideRows] = useState<Record<OverrideStage, OverrideRow[]>>({
    qc: [], billing_delivery: [], payment: [],
  })
  // Ref mirrors overrideRows synchronously so persist handlers always read
  // the latest array — avoids the stale-closure save bug where a setState
  // + setTimeout(commit, 0) pattern would commit the pre-update snapshot.
  const overrideRowsRef = useRef(overrideRows)

  const [error, setError] = useState<string | null>(null)
  const [savingStage, setSavingStage] = useState<Stage | null>(null)

  const hydratedWatchers = useRef(false)
  useEffect(() => {
    if (hydratedWatchers.current || !settingsLoaded) return
    hydratedWatchers.current = true
    const currentMap = (settings.stage_entry_watchers ?? {}) as Record<string, unknown>
    const next: Record<Stage, string[]> = { main: [], qc: [], billing_delivery: [], payment: [] }
    for (const key of Object.keys(next) as Stage[]) {
      const v = currentMap[key]
      if (Array.isArray(v)) next[key] = v.filter((x): x is string => typeof x === 'string')
    }
    setWatchers(next)
  }, [settings, settingsLoaded])

  const hydratedOverrides = useRef(false)
  useEffect(() => {
    if (hydratedOverrides.current || !settingsLoaded) return
    hydratedOverrides.current = true
    const next: Record<OverrideStage, OverrideRow[]> = { qc: [], billing_delivery: [], payment: [] }
    for (const stage of Object.keys(next) as OverrideStage[]) {
      const map = (settings[OVERRIDE_SETTING_KEY[stage]] ?? {}) as Record<string, unknown>
      for (const [client, adminId] of Object.entries(map)) {
        if (typeof adminId === 'string' && adminId.length > 0) {
          next[stage].push({ client, adminId })
        }
      }
    }
    overrideRowsRef.current = next
    setOverrideRows(next)
  }, [settings, settingsLoaded])

  const staffOptions = useMemo(
    () => (profiles ?? []).filter((p) => isPickerVisible(p) && p.isActive && (p.role === 'admin' || p.role === 'appraiser')),
    [profiles],
  )
  const adminOptions = useMemo(
    () => (profiles ?? []).filter((p) => isPickerVisible(p) && p.isActive && p.role === 'admin'),
    [profiles],
  )

  async function toggleWatcher(stage: Stage, userId: string) {
    const current = watchers[stage]
    const next = current.includes(userId) ? current.filter((x) => x !== userId) : [...current, userId]
    const nextMap = { ...watchers, [stage]: next }
    setWatchers(nextMap)
    setSavingStage(stage)
    try {
      await patchSetting('stage_entry_watchers', nextMap)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingStage(null)
    }
  }

  function writeOverrideRows(stage: OverrideStage, rows: OverrideRow[]) {
    overrideRowsRef.current = { ...overrideRowsRef.current, [stage]: rows }
    setOverrideRows({ ...overrideRowsRef.current })
  }

  async function persistOverrides(stage: OverrideStage, rows: OverrideRow[]) {
    const serialized: Record<string, string> = {}
    for (const r of rows) {
      // Normalize client name the same way the server resolver does so
      // "Claim Solution", "CLAIMSOLUTION", and "ClaimSolution Inc." all
      // route to the same admin. Keeps the UI free-text while making
      // routing resilient to naming variants.
      const key = normalizeCompanyKey(r.client)
      if (!key || !r.adminId) continue
      serialized[key] = r.adminId
    }
    try {
      await patchSetting(OVERRIDE_SETTING_KEY[stage], serialized)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  function patchOverrideRow(
    stage: OverrideStage,
    idx: number,
    patch: Partial<OverrideRow>,
    persist: boolean,
  ) {
    const current = overrideRowsRef.current[stage]
    const next = current.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    writeOverrideRows(stage, next)
    if (persist) void persistOverrides(stage, next)
  }

  function addOverrideRow(stage: OverrideStage) {
    const next = [...overrideRowsRef.current[stage], { client: '', adminId: '' }]
    writeOverrideRows(stage, next)
  }

  function removeOverrideRow(stage: OverrideStage, idx: number) {
    const next = overrideRowsRef.current[stage].filter((_, i) => i !== idx)
    writeOverrideRows(stage, next)
    void persistOverrides(stage, next)
  }

  function buildOverrides(stage: OverrideStage): StageOverrides {
    return {
      rows: overrideRows[stage],
      adminOptions,
      clients,
      profilesReady: profiles !== null,
      onAdd: () => addOverrideRow(stage),
      onRemove: (idx) => removeOverrideRow(stage, idx),
      onTypeClient: (idx, v) => patchOverrideRow(stage, idx, { client: v }, false),
      onCommitClient: (idx, v) => patchOverrideRow(stage, idx, { client: v }, true),
      onPickAdmin: (idx, v) => patchOverrideRow(stage, idx, { adminId: v }, true),
    }
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-black text-lg font-bold tracking-tight">Stage alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Pick who gets emailed when a claim enters each dashboard. The person who triggered the transition is auto-excluded. For QC, Billing/Delivery, and Payment you can also add per-client overrides — the admin you pick for a specific client gets emailed in addition to the watchers when a claim with that <b>Client</b> enters the stage.
        </p>

        <div className="divide-y divide-gray-100 border border-gray-200 rounded-md">
          {STAGES.map(({ key, label, description }) => (
            <StageRow
              key={key}
              label={label}
              description={description}
              selectedIds={watchers[key]}
              allStaff={staffOptions}
              busy={savingStage === key}
              onToggle={(id) => toggleWatcher(key, id)}
              overrides={key === 'main' ? null : buildOverrides(key as OverrideStage)}
            />
          ))}
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </CardContent>
    </Card>
  )
}

function StageRow({
  label,
  description,
  selectedIds,
  allStaff,
  busy,
  onToggle,
  overrides,
}: {
  label: string
  description: string
  selectedIds: string[]
  allStaff: Profile[]
  busy: boolean
  onToggle: (id: string) => void
  overrides: StageOverrides | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const pickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selectedProfiles = selectedIds
    .map((id) => allStaff.find((p) => p.id === id))
    .filter((p): p is Profile => !!p)

  const filtered = allStaff
    .filter((p) => !selectedIds.includes(p.id))
    .filter((p) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    })
    .slice(0, 15)

  return (
    <div className="p-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{label}</div>
          <div className="text-xs text-gray-500">{description}</div>
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0 mt-0.5" />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {selectedProfiles.length === 0 && (
          <span className="text-xs text-gray-400 italic">No watchers.</span>
        )}
        {selectedProfiles.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">
            {p.name || p.email}
            <button
              type="button"
              onClick={() => onToggle(p.id)}
              className="text-blue-500 hover:text-blue-800"
              aria-label={`Remove ${p.name || p.email}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium border border-dashed border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 w-72 max-h-[280px] overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-30">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400 italic">
                  {query ? 'No matches.' : 'Everyone is already a watcher.'}
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onToggle(p.id); setQuery(''); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.name || p.email}</div>
                      {p.name && <div className="text-xs text-gray-500 truncate">{p.email}</div>}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">{p.role}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {overrides && (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
          <div className="text-xs font-medium text-gray-500">
            Per-client overrides <span className="text-gray-400 font-normal">(optional)</span>
          </div>
          {overrides.rows.length > 0 && (
            <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
              {overrides.rows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-white">
                  <ClientNameAutocomplete
                    value={row.client}
                    clients={overrides.clients}
                    onChange={(v) => overrides.onTypeClient(idx, v)}
                    onCommit={(finalV) => overrides.onCommitClient(idx, finalV)}
                  />
                  <select
                    value={row.adminId}
                    onChange={(e) => overrides.onPickAdmin(idx, e.target.value)}
                    disabled={!overrides.profilesReady}
                    className="flex-1 bg-white border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    <option value="">— Pick admin —</option>
                    {overrides.adminOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name || p.email}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => overrides.onRemove(idx)}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-600"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            onClick={overrides.onAdd}
            variant="outline"
            size="sm"
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Plus className="w-4 h-4 mr-1" /> Add client
          </Button>
        </div>
      )}
    </div>
  )
}

// -------- Tab: Daily digest (super-admin only) --------

function DigestTab({
  settingsLoaded,
  currentList,
  onSave,
}: {
  settingsLoaded: boolean
  currentList: string[]
  onSave: (list: string[]) => Promise<void>
}) {
  const [emails, setEmails] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current || !settingsLoaded) return
    hydrated.current = true
    setEmails(currentList.filter((v) => typeof v === 'string') as string[])
  }, [currentList, settingsLoaded])

  async function persist(next: string[]) {
    setSaving(true)
    try {
      await onSave(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function addEmail() {
    const trimmed = draft.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address')
      return
    }
    if (emails.includes(trimmed)) {
      setError('Already in the list')
      return
    }
    const next = [...emails, trimmed]
    setEmails(next)
    setDraft('')
    await persist(next)
  }

  async function removeEmail(email: string) {
    const next = emails.filter((e) => e !== email)
    setEmails(next)
    await persist(next)
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-black text-lg font-bold tracking-tight">Daily digest</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Summary of claims opened + claims that entered Delivery, delivered <b>Monday–Friday at ~5pm PT</b> (Sat/Sun are skipped). Only super-admins can see or edit this tab.
        </p>

        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recipients</div>
          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-md border border-gray-200 bg-white min-h-[42px]">
            {emails.length === 0 && <span className="text-xs text-gray-400 italic">No recipients — digest is off.</span>}
            {emails.map((email) => (
              <span key={email} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">
                {email}
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="text-blue-500 hover:text-blue-800"
                  aria-label={`Remove ${email}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
            placeholder="henry@modernappraisers.com"
            className="flex-1 bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="button" onClick={addEmail} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </CardContent>
    </Card>
  )
}

// -------- Tab: Broadcast --------

interface BroadcastResult {
  sent: number
  failed: number
  total: number
  results: Array<{ email: string; name: string; role: string; ok: boolean; error?: string }>
}

type Mode = 'everyone' | 'specific'

function BroadcastTab({ profiles }: { profiles: Profile[] | null }) {
  const [mode, setMode] = useState<Mode>('everyone')
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BroadcastResult | null>(null)

  const pickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pickerOpen])

  const activeStaff = useMemo(
    () => (profiles ?? []).filter((p) => isPickerVisible(p) && p.isActive && (p.role === 'admin' || p.role === 'appraiser')),
    [profiles],
  )

  const pickerOptions = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    return activeStaff
      .filter((p) => !recipientIds.includes(p.id))
      .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, 20)
  }, [activeStaff, recipientIds, pickerQuery])

  const selectedProfiles = useMemo(
    () => recipientIds.map((id) => activeStaff.find((p) => p.id === id)).filter((p): p is Profile => !!p),
    [recipientIds, activeStaff],
  )

  const addRecipient = (id: string) => {
    setRecipientIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setPickerQuery('')
    setPickerOpen(false)
  }
  const removeRecipient = (id: string) => setRecipientIds((prev) => prev.filter((x) => x !== id))

  const effectiveCount = mode === 'everyone' ? activeStaff.length : recipientIds.length
  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !sending &&
    (mode === 'everyone' ? activeStaff.length > 0 : recipientIds.length > 0)

  async function doSend() {
    if (!canSend) return
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const payload: { subject: string; body: string; recipientIds?: string[] } = {
        subject: subject.trim(),
        body: body.trim(),
      }
      if (mode === 'specific') payload.recipientIds = recipientIds
      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => null)) as BroadcastResult | { error?: string } | null
      if (!res.ok) {
        setError((json && 'error' in json && json.error) || `Request failed (${res.status})`)
        return
      }
      setResult(json as BroadcastResult)
      if ((json as BroadcastResult).failed === 0) {
        setSubject('')
        setBody('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-black text-lg font-bold tracking-tight">Send a one-off email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Ad-hoc email from <code className="bg-gray-50 border border-gray-200 rounded px-1 text-xs">notifications@hamsportal.com</code> to all active staff, or a specific list.
          </p>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Recipients</div>
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
              <button
                type="button"
                onClick={() => setMode('everyone')}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${mode === 'everyone' ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Everyone
              </button>
              <button
                type="button"
                onClick={() => setMode('specific')}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${mode === 'specific' ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Specific people
              </button>
            </div>
          </div>

          {mode === 'everyone' ? (
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              {profiles === null ? 'Loading recipient count…' : `Will send to ${activeStaff.length} active ${activeStaff.length === 1 ? 'user' : 'users'}.`}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-md border border-gray-200 bg-white min-h-[42px]">
                {selectedProfiles.length === 0 && <span className="text-xs text-gray-400 italic">No one selected — pick below.</span>}
                {selectedProfiles.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">
                    {p.name || p.email}
                    <button type="button" onClick={() => removeRecipient(p.id)} className="text-blue-500 hover:text-blue-800" aria-label={`Remove ${p.name || p.email}`}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="relative" ref={pickerRef}>
                <input
                  value={pickerQuery}
                  onFocus={() => setPickerOpen(true)}
                  onChange={(e) => { setPickerQuery(e.target.value); setPickerOpen(true) }}
                  placeholder={profiles === null ? 'Loading…' : recipientIds.length === 0 ? 'Search by name or email…' : 'Add another…'}
                  disabled={profiles === null}
                  className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
                {pickerOpen && pickerOptions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 max-h-[320px] overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-30">
                    {pickerOptions.map((p) => (
                      <button key={p.id} type="button" onClick={() => addRecipient(p.id)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{p.name || p.email}</div>
                          {p.name && <div className="text-xs text-gray-500 truncate">{p.email}</div>}
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">{p.role}</span>
                      </button>
                    ))}
                  </div>
                )}
                {pickerOpen && pickerOptions.length === 0 && pickerQuery && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-30 px-3 py-2 text-sm text-gray-400 italic">No matches</div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Subject</div>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Short, specific subject line…" className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Body</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} maxLength={20000} placeholder="Write the message. Plain text — line breaks are preserved." className="w-full bg-white border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[200px]" />
            <div className="text-xs text-gray-400 mt-1">{body.length.toLocaleString()} / 20,000</div>
          </div>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {result && (
            <div className={`rounded-md border px-3 py-2 text-sm ${result.failed === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <div className="font-semibold">Sent {result.sent} / {result.total}{result.failed > 0 ? ` · ${result.failed} failed` : ''}</div>
              {result.failed > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {result.results.filter((r) => !r.ok).map((r) => (<li key={r.email}><b>{r.email}</b>: {r.error ?? 'unknown error'}</li>))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={doSend} disabled={!canSend} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send to {effectiveCount} {effectiveCount === 1 ? 'person' : 'people'}
        </Button>
      </div>
    </div>
  )
}
