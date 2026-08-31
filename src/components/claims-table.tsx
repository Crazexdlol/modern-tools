"use client"

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Ban, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { type ACVHistoryEntry, deleteACVHistory } from '@/lib/supabase/history'
import type { Profile } from '@/lib/supabase/profiles'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { ClaimMessagePreview } from '@/components/claim-message-preview'
import { PhaseSelector } from '@/components/claim/phase-selector'
import type { LicensedState } from '@/lib/supabase/licensed-states'
import type { AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import { isLicensedState, isForbiddenState } from '@/lib/supabase/licensed-states'
import { isLicenseValid } from '@/lib/supabase/appraiser-licenses'
import { extractLossState } from '@/lib/claim-state'
import { type StatusPhaseConfig, formatPhaseAge, phaseColorClasses } from '@/lib/supabase/status-phase-configs'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  })
}

function StateCell({
  entry,
  getLicenseBadge,
}: {
  entry: ACVHistoryEntry
  getLicenseBadge: (entry: ACVHistoryEntry) => 'forbidden' | 'licensed' | 'not-licensed' | 'unassigned' | null
}) {
  const state = extractLossState(entry.claim?.ownerAddress)
  const badge = getLicenseBadge(entry)
  const isForbidden = badge === 'forbidden'
  // Dot semantics:
  //   'licensed' (handler holds a valid license) → green
  //   'not-licensed' or 'unassigned' → red (needs attention)
  //   null (state not in licensed list) → no dot
  //   'forbidden' → renders the labelled FORBIDDEN pill instead of a dot
  const dotColor: 'green' | 'red' | null =
    badge === 'licensed' ? 'green' :
    badge === 'not-licensed' || badge === 'unassigned' ? 'red' :
    null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-mono text-xs ${isForbidden ? 'text-red-700 font-bold' : 'text-gray-600'}`}>
        {state ?? '—'}
      </span>
      {isForbidden ? (
        <span
          title="FORBIDDEN — Modern Appraisers cannot handle claims from this state"
          className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border-2 border-red-600 bg-red-100 text-red-800 tracking-wide"
        >
          <Ban className="w-3 h-3" />
          Forbidden
        </span>
      ) : dotColor === 'green' ? (
        <span
          title="Licensed state — assigned appraiser holds a valid license"
          aria-label="Licensed and handler qualified"
          className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600"
        />
      ) : dotColor === 'red' ? (
        <span
          title="Licensed state — assigned appraiser is not licensed (or unassigned)"
          aria-label="Licensed and handler not qualified"
          className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 border border-red-600"
        />
      ) : null}
    </span>
  )
}

export function ClaimsTable({
  entries,
  onDeleted,
  emptyText,
  showStatus = false,
  adminView = false,
  profiles = [],
  showSubmittedColumn = false,
  onAssignmentChanged,
  licensedStates = [],
  licensesByUser = new Map(),
  statusPhaseConfigs = [],
  phaseFilter = null,
  onPhaseChanged,
}: {
  entries: ACVHistoryEntry[]
  onDeleted?: (id: string) => void
  emptyText: string
  showStatus?: boolean
  adminView?: boolean
  profiles?: Profile[]
  showSubmittedColumn?: boolean
  onAssignmentChanged?: () => void
  licensedStates?: LicensedState[]
  licensesByUser?: Map<string, AppraiserLicense[]>
  statusPhaseConfigs?: StatusPhaseConfig[]
  phaseFilter?: string | null
  onPhaseChanged?: (id: string, phase: string | null, setAt: string | null) => void
}) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAssignee, setBulkAssignee] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false)
  const [bulkReassignConfirmOpen, setBulkReassignConfirmOpen] = useState(false)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkCloseConfirmOpen, setBulkCloseConfirmOpen] = useState(false)

  // Column sort — Henry wants click-to-sort on Date, Insured, Client, Assigned To.
  type SortCol = 'ma' | 'insured' | 'client' | 'vehicle' | 'vin' | 'state' | 'date' | 'insco' | 'assignee'
  const [sortBy, setSortBy] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>(null)
  const toggleSort = (col: SortCol) => {
    setSortBy(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  // Look up an assignee's display name by profile id.
  const nameFor = useCallback((id: string | null | undefined): string => {
    if (!id) return ''
    const p = profiles.find(x => x.id === id)
    return p?.name || p?.email || 'Unknown'
  }, [profiles])

  // Compute license badge status for each entry. Forbidden overrides all other
  // states — if the claim's state is on the forbidden list we return 'forbidden'
  // regardless of assignment or license status.
  const getLicenseBadge = useCallback((entry: ACVHistoryEntry): 'forbidden' | 'licensed' | 'not-licensed' | 'unassigned' | null => {
    const state = extractLossState(entry.claim?.ownerAddress)
    if (!state) return null
    if (isForbiddenState(state, licensedStates)) return 'forbidden'
    if (!isLicensedState(state, licensedStates)) return null
    if (!entry.assignedTo) return 'unassigned'
    const licenses = licensesByUser.get(entry.assignedTo) ?? []
    const validForState = licenses.some(l => l.state === state && isLicenseValid(l))
    return validForState ? 'licensed' : 'not-licensed'
  }, [licensedStates, licensesByUser])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const base = entries.filter(e => {
      if (q && !(
        e.maNumber?.toLowerCase().includes(q) ||
        e.vin?.toLowerCase().includes(q) ||
        (e.claim?.claimNumber ?? '').toLowerCase().includes(q) ||
        e.vehicle?.toLowerCase().includes(q) ||
        (e.claim?.insuredName ?? '').toLowerCase().includes(q) ||
        (e.claim?.insuranceCompany ?? '').toLowerCase().includes(q) ||
        (e.claim?.clientName ?? '').toLowerCase().includes(q) ||
        nameFor(e.assignedTo).toLowerCase().includes(q)
      )) return false
      if (phaseFilter !== null && e.statusPhase !== phaseFilter) return false
      return true
    })
    if (!sortBy) return base
    const dir = sortBy.dir === 'asc' ? 1 : -1
    const key = (e: ACVHistoryEntry): string | number => {
      switch (sortBy.col) {
        case 'ma':       return (e.maNumber ?? '').toLowerCase()
        case 'insured':  return (e.claim?.insuredName ?? '').toLowerCase()
        case 'client':   return (e.claim?.clientName ?? '').toLowerCase()
        case 'vehicle':  return (e.vehicle ?? '').toLowerCase()
        case 'vin':      return (e.vin ?? '').toLowerCase()
        case 'state':    return (extractLossState(e.claim?.ownerAddress) ?? '').toLowerCase()
        case 'date':     return new Date(e.date).getTime()
        case 'insco':    return (e.claim?.insuranceCompany ?? '').toLowerCase()
        case 'assignee': return nameFor(e.assignedTo).toLowerCase()
      }
    }
    return [...base].sort((a, b) => {
      const ka = key(a), kb = key(b)
      if (ka < kb) return -1 * dir
      if (ka > kb) return  1 * dir
      return 0
    })
  }, [entries, searchQuery, nameFor, phaseFilter, sortBy])

  const filteredIds = useMemo(() => filtered.map(e => e.id), [filtered])

  // If the user filters/sorts away claims they've selected, prune those
  // ids so the "N selected" counter matches what's actually visible and
  // bulk actions don't operate on hidden rows.
  useEffect(() => {
    if (selectedIds.size === 0) return
    const visible = new Set(filteredIds)
    let changed = false
    for (const id of selectedIds) if (!visible.has(id)) { changed = true; break }
    if (changed) {
      setSelectedIds(prev => {
        const next = new Set<string>()
        for (const id of prev) if (visible.has(id)) next.add(id)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIds intentionally omitted; we only want this to fire on filter/sort change
  }, [filteredIds])
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id))
  const someFilteredSelected =
    !allFilteredSelected && filteredIds.some(id => selectedIds.has(id))

  const toggleAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredIds.forEach(id => next.delete(id))
      } else {
        filteredIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBulkAssignee('')
    setBulkError(null)
  }

  // Bulk reassign — POSTs to /api/claims/[id]/assign for each selected id in
  // parallel, then reloads the page so the caller sees fresh assignments.
  const runBulkReassign = async () => {
    setBulkReassignConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    // '' would be the empty pick (Confirm is disabled in that state); the
    // sentinel '__unassign__' maps to explicit null, everything else is a
    // real user id.
    const assignedTo = bulkAssignee === '__unassign__' ? null : bulkAssignee
    const results = await Promise.all(
      ids.map(id =>
        fetch(`/api/claims/${id}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignedTo }),
        }).then(r => r.ok).catch(() => false),
      ),
    )
    setBulkBusy(false)
    const failed = results.filter(ok => !ok).length
    if (failed > 0) {
      setBulkError(
        `Reassigned ${results.length - failed} of ${results.length} claims. ${failed} failed — refresh to see current state.`,
      )
      onAssignmentChanged?.()
      return
    }
    // All succeeded — reload per Henry's spec ("once i click confirm, the page will reload").
    window.location.reload()
  }

  // Bulk submit — POSTs to /api/claims/[id]/submit for each selected id in
  // parallel. The API 400s on already-submitted or closed claims, so we
  // count those as "skipped" and report a summary instead of failing hard.
  const runBulkSubmit = async () => {
    setSubmitConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const results = await Promise.all(
      ids.map(id =>
        fetch(`/api/claims/${id}/submit`, { method: 'POST' })
          .then(async r => {
            if (r.ok) return 'ok' as const
            const body = await r.json().catch(() => ({ error: '' }))
            const msg = (body?.error ?? '').toString().toLowerCase()
            if (msg.includes('already submitted') || msg.includes('not open')) return 'skipped' as const
            return 'failed' as const
          })
          .catch(() => 'failed' as const),
      ),
    )
    setBulkBusy(false)
    const ok = results.filter(r => r === 'ok').length
    const skipped = results.filter(r => r === 'skipped').length
    const failed = results.filter(r => r === 'failed').length
    if (failed > 0 || skipped > 0) {
      const parts = [`Submitted ${ok}`]
      if (skipped > 0) parts.push(`${skipped} skipped (already submitted or closed)`)
      if (failed > 0) parts.push(`${failed} failed`)
      setBulkError(parts.join(' · ') + '. Refresh to see current state.')
      onAssignmentChanged?.()
      return
    }
    window.location.reload()
  }

  const runBulkClose = async () => {
    setBulkCloseConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const results = await Promise.all(
      ids.map(id =>
        fetch(`/api/claims/${id}/approve`, { method: 'POST' })
          .then(async r => {
            if (r.ok) return 'ok' as const
            const body = await r.json().catch(() => ({ error: '' }))
            const msg = (body?.error ?? '').toString().toLowerCase()
            if (msg.includes('already closed')) return 'skipped' as const
            return 'failed' as const
          })
          .catch(() => 'failed' as const),
      ),
    )
    setBulkBusy(false)
    const ok = results.filter(r => r === 'ok').length
    const skipped = results.filter(r => r === 'skipped').length
    const failed = results.filter(r => r === 'failed').length
    if (failed > 0 || skipped > 0) {
      const parts = [`Closed ${ok}`]
      if (skipped > 0) parts.push(`${skipped} skipped (already closed)`)
      if (failed > 0) parts.push(`${failed} failed`)
      setBulkError(parts.join(' · ') + '. Refresh to see current state.')
      onAssignmentChanged?.()
      return
    }
    window.location.reload()
  }

  const runBulkDelete = async () => {
    setBulkDeleteConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const results = await Promise.all(
      ids.map(id => deleteACVHistory(id).catch(() => false)),
    )
    setBulkBusy(false)
    const failed = results.filter(ok => !ok).length
    if (failed > 0) {
      setBulkError(
        `Deleted ${results.length - failed} of ${results.length} claims. ${failed} failed — refresh to see current state.`,
      )
      onAssignmentChanged?.()
      return
    }
    window.location.reload()
  }

  const colCount =
    (adminView ? 1 : 0) + // checkbox
    8 + // MA, Insured, Client, Vehicle, VIN, State, Date, Ins. Co.
    (adminView ? 1 : 0) + // Assigned To (read-only text now)
    (showStatus ? 1 : 0) +
    (showSubmittedColumn ? 1 : 0) +
    (statusPhaseConfigs.length > 0 ? 1 : 0) // Phase status column

  const selectedCount = selectedIds.size

  return (
    <div>
      {/* Bulk action toolbar (admin only, visible when selection is non-empty) */}
      {adminView && selectedCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm font-semibold text-blue-900">
            {selectedCount} claim{selectedCount === 1 ? '' : 's'} selected
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button
              onClick={() => setSubmitConfirmOpen(true)}
              disabled={bulkBusy}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >
              {bulkBusy ? 'Working…' : 'Submit All'}
            </Button>
            <span className="mx-2 h-6 w-px bg-blue-200" aria-hidden />
            <span className="text-sm text-blue-900">Reassign to:</span>
            <select
              value={bulkAssignee}
              onChange={(e) => setBulkAssignee(e.target.value)}
              disabled={bulkBusy}
              className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Pick a person —</option>
              <option value="__unassign__">— Unassigned —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.email}</option>
              ))}
            </select>
            <Button
              onClick={() => setBulkReassignConfirmOpen(true)}
              disabled={bulkBusy || !bulkAssignee}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm"
            >
              {bulkBusy ? 'Reassigning…' : 'Confirm'}
            </Button>
            <span className="mx-2 h-6 w-px bg-blue-200" aria-hidden />
            <Button
              onClick={() => setBulkCloseConfirmOpen(true)}
              disabled={bulkBusy}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >
              Close
            </Button>
            <Button
              onClick={() => setBulkDeleteConfirmOpen(true)}
              disabled={bulkBusy}
              className="bg-red-600 hover:bg-red-500 text-white text-sm"
            >
              Delete
            </Button>
            <button
              onClick={clearSelection}
              disabled={bulkBusy}
              className="text-blue-700 hover:text-blue-900 p-1"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {bulkError && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          {bulkError}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 mb-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search claims..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {adminView && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={allFilteredSelected ? 'Clear selection' : 'Select all shown'}
                    checked={allFilteredSelected}
                    ref={el => {
                      if (el) el.indeterminate = someFilteredSelected
                    }}
                    onChange={toggleAllFiltered}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
              )}
              <SortableTh label="MA #"      col="ma"       sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Insured"   col="insured"  sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Client"    col="client"   sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Vehicle"   col="vehicle"  sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="VIN"       col="vin"      sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="State"     col="state"    sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Date"      col="date"     sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Ins. Co."  col="insco"    sortBy={sortBy} onClick={toggleSort} />
              {adminView && (
                <SortableTh label="Assigned To" col="assignee" sortBy={sortBy} onClick={toggleSort} nowrap />
              )}
              {showStatus && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Status</th>
              )}
              {showSubmittedColumn && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Submitted</th>
              )}
              {statusPhaseConfigs.length > 0 && (
                <th className="text-left px-2 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider w-[220px]">Phase</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="text-center py-16 text-gray-400">
                  {searchQuery ? 'No claims match your search.' : emptyText}
                </td>
              </tr>
            ) : (
              filtered.map((entry) => {
                const isSelected = selectedIds.has(entry.id)
                const openClaim = () => router.push(`/claims/${entry.id}`)
                return (
                  <tr
                    key={entry.id}
                    onDoubleClick={openClaim}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {adminView && (
                      <td className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select claim ${entry.maNumber || entry.id}`}
                          checked={isSelected}
                          onChange={() => toggleOne(entry.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={openClaim}
                          className="text-gray-900 font-medium hover:text-blue-600 hover:underline text-left"
                        >
                          {entry.maNumber || '—'}
                        </button>
                        <ClaimMessagePreview claimId={entry.id} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{entry.claim?.insuredName || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-900">{entry.claim?.clientName || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-900">{entry.vehicle || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-900 font-mono text-xs">{entry.vin || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <StateCell entry={entry} getLicenseBadge={getLicenseBadge} />
                    </td>
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-3 text-gray-900">{entry.claim?.insuranceCompany || <span className="text-gray-400">—</span>}</td>
                    {adminView && (
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">
                        {entry.assignedTo
                          ? nameFor(entry.assignedTo)
                          : <span className="text-gray-400 italic">Unassigned</span>}
                      </td>
                    )}
                    {showStatus && (
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          entry.status === 'closed'
                            ? 'text-gray-600 bg-gray-100 border-gray-300'
                            : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        }`}>
                          {entry.status === 'closed' ? 'Closed' : 'Open'}
                        </span>
                      </td>
                    )}
                    {showSubmittedColumn && (
                      <td className="px-4 py-3">
                        {entry.submittedAt ? (
                          <div>
                            <div className="text-sm text-gray-700">{fmtDate(entry.submittedAt)}</div>
                            <div className="text-xs text-gray-500">{nameFor(entry.submittedBy) || 'Unknown'}</div>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {statusPhaseConfigs.length > 0 && (
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        {adminView ? (
                          <PhaseSelector
                            claimId={entry.id}
                            currentPhase={entry.statusPhase}
                            currentSetAt={entry.statusPhaseSetAt}
                            size="lg"
                            onChanged={(phase, setAt) => onPhaseChanged?.(entry.id, phase, setAt)}
                          />
                        ) : entry.statusPhase ? (() => {
                          const cfg = statusPhaseConfigs.find(c => c.code === entry.statusPhase)
                          if (!cfg) return <span className="text-gray-300">—</span>
                          const age = formatPhaseAge(entry.statusPhaseSetAt)
                          return (
                            <span
                              className={`inline-flex flex-col items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${phaseColorClasses(cfg.color)}`}
                              title={age ? `${cfg.label} · ${age}` : cfg.label}
                            >
                              <span>{cfg.label}</span>
                              {age && <span className="opacity-70 font-normal text-[10px] leading-tight">{age}</span>}
                            </span>
                          )
                        })() : null}
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={submitConfirmOpen}
        title={`Submit ${selectedCount} claim${selectedCount === 1 ? '' : 's'}?`}
        message={
          <>
            This marks the selected claim{selectedCount === 1 ? '' : 's'} as submitted for admin review.
            Claims that are already submitted or closed will be skipped.
          </>
        }
        confirmLabel="Submit All"
        variant="primary"
        busy={bulkBusy}
        onConfirm={runBulkSubmit}
        onCancel={() => setSubmitConfirmOpen(false)}
      />

      <ConfirmDialog
        open={bulkReassignConfirmOpen}
        title={`Reassign ${selectedCount} claim${selectedCount === 1 ? '' : 's'}?`}
        message={
          <>
            Reassign {selectedCount} claim{selectedCount === 1 ? '' : 's'} to{' '}
            <b>
              {bulkAssignee === '__unassign__'
                ? 'Unassigned'
                : (profiles.find(p => p.id === bulkAssignee)?.name
                    || profiles.find(p => p.id === bulkAssignee)?.email
                    || 'Unknown')}
            </b>?
          </>
        }
        confirmLabel="Reassign"
        variant="primary"
        busy={bulkBusy}
        onConfirm={runBulkReassign}
        onCancel={() => setBulkReassignConfirmOpen(false)}
      />

      <ConfirmDialog
        open={bulkCloseConfirmOpen}
        title={`Close ${selectedCount} claim${selectedCount === 1 ? '' : 's'}?`}
        confirmLabel="Close"
        variant="primary"
        busy={bulkBusy}
        onConfirm={runBulkClose}
        onCancel={() => setBulkCloseConfirmOpen(false)}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title={`Delete ${selectedCount} claim${selectedCount === 1 ? '' : 's'}?`}
        message="This permanently removes the claim(s) from the database. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        busy={bulkBusy}
        onConfirm={runBulkDelete}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />

    </div>
  )
}

function SortableTh({
  label,
  col,
  sortBy,
  onClick,
  nowrap = false,
}: {
  label: string
  col: 'ma' | 'insured' | 'client' | 'vehicle' | 'vin' | 'state' | 'date' | 'insco' | 'assignee'
  sortBy: { col: string; dir: 'asc' | 'desc' } | null
  onClick: (col: 'ma' | 'insured' | 'client' | 'vehicle' | 'vin' | 'state' | 'date' | 'insco' | 'assignee') => void
  nowrap?: boolean
}) {
  const active = sortBy?.col === col
  const Icon = !active ? ArrowUpDown : sortBy?.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={`text-left px-4 py-3 ${nowrap ? 'whitespace-nowrap' : ''}`}>
      <button
        type="button"
        onClick={() => onClick(col)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-900 uppercase tracking-wider hover:text-blue-700"
      >
        {label}
        <Icon className={`w-3 h-3 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
      </button>
    </th>
  )
}
