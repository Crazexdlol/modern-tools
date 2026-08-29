"use client"

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Trash2, X, Ban } from 'lucide-react'
import { deleteACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import type { Profile } from '@/lib/supabase/profiles'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { ClaimMessagePreview } from '@/components/claim-message-preview'
import type { LicensedState } from '@/lib/supabase/licensed-states'
import type { AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import { isLicensedState, isForbiddenState } from '@/lib/supabase/licensed-states'
import { isLicenseValid } from '@/lib/supabase/appraiser-licenses'
import { extractLossState } from '@/lib/claim-state'

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
  // Anything except "not in the licensed list" (null) gets the red pill. That
  // means: licensed / not-licensed / unassigned / forbidden all show it. Henry
  // wants a single red marker for "this claim is in a licensed state"; the
  // per-handler detail lives in the claim workspace's State Licensing panel.
  const showPill = badge !== null
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
      ) : showPill ? (
        <span
          title="Licensed state — check the State Licensing panel in the claim workspace"
          aria-label="Licensed state"
          className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 border border-red-600"
        />
      ) : null}
    </span>
  )
}

type LicenseFilter = 'all' | 'forbidden' | 'licensed-state-only' | 'not-licensed'

export function ClaimsTable({
  entries,
  onDeleted,
  emptyText,
  showStatus = false,
  adminView = false,
  profiles = [],
  showSubmittedColumn = false,
  onAssignmentChanged,
  perRowReassign = false,
  licensedStates = [],
  licensesByUser = new Map(),
}: {
  entries: ACVHistoryEntry[]
  onDeleted: (id: string) => void
  emptyText: string
  showStatus?: boolean
  adminView?: boolean
  profiles?: Profile[]
  showSubmittedColumn?: boolean
  onAssignmentChanged?: () => void
  perRowReassign?: boolean
  licensedStates?: LicensedState[]
  licensesByUser?: Map<string, AppraiserLicense[]>
}) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAssignee, setBulkAssignee] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ACVHistoryEntry | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // Per-row reassign state — used by the Completed Assignments page so an
  // admin can hand a submitted claim to another appraiser without opening it.
  const [pendingRowReassign, setPendingRowReassign] = useState<
    { entry: ACVHistoryEntry; targetId: string | null; targetLabel: string } | null
  >(null)
  const [rowReassignBusy, setRowReassignBusy] = useState(false)

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
    return entries.filter(e => {
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
      if (licenseFilter !== 'all') {
        const badge = getLicenseBadge(e)
        if (licenseFilter === 'forbidden' && badge !== 'forbidden') return false
        if (licenseFilter === 'licensed-state-only' && badge === null) return false
        if (licenseFilter === 'not-licensed' && badge !== 'not-licensed') return false
      }
      return true
    })
  }, [entries, searchQuery, nameFor, licenseFilter, getLicenseBadge])

  const filteredIds = useMemo(() => filtered.map(e => e.id), [filtered])
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
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const assignedTo = bulkAssignee || null
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

  const openDelete = (e: React.MouseEvent, entry: ACVHistoryEntry) => {
    e.stopPropagation()
    setDeleteTarget(entry)
  }

  const runDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    onDeleted(deleteTarget.id)
    await deleteACVHistory(deleteTarget.id)
    setDeleteBusy(false)
    setDeleteTarget(null)
  }

  const runRowReassign = async () => {
    if (!pendingRowReassign) return
    const { entry, targetId } = pendingRowReassign
    setRowReassignBusy(true)
    const res = await fetch(`/api/claims/${entry.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: targetId }),
    })
    setRowReassignBusy(false)
    setPendingRowReassign(null)
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setBulkError((b as { error?: string }).error ?? 'Reassign failed')
      return
    }
    // Reload so the queue reflects the new assignment (assignee may now be
    // out-of-scope for this admin's view depending on filters).
    window.location.reload()
  }

  const colCount =
    (adminView ? 1 : 0) + // checkbox
    8 + // MA, Insured, Client, Vehicle, VIN, State, Date, Ins. Co.
    (adminView ? 1 : 0) + // Assigned To (read-only text now)
    (showStatus ? 1 : 0) +
    (showSubmittedColumn ? 1 : 0) +
    (perRowReassign ? 1 : 0) + // Reassign action column
    (adminView ? 1 : 0) // Delete (admin-only)

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
              <option value="">— Unassigned —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.email}</option>
              ))}
            </select>
            <Button
              onClick={runBulkReassign}
              disabled={bulkBusy}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm"
            >
              {bulkBusy ? 'Reassigning…' : 'Confirm'}
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
        {licensedStates.length > 0 && (
          <select
            value={licenseFilter}
            onChange={e => setLicenseFilter(e.target.value as LicenseFilter)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            title="Filter by licensing status"
          >
            <option value="all">All states</option>
            <option value="forbidden">Forbidden only</option>
            <option value="licensed-state-only">Licensed state only</option>
            <option value="not-licensed">Not licensed</option>
          </select>
        )}
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

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">MA #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Insured</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">VIN</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ins. Co.</th>
              {adminView && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned To</th>
              )}
              {showStatus && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              )}
              {showSubmittedColumn && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
              )}
              {perRowReassign && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reassign</th>
              )}
              {adminView && (
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Delete</th>
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
                    <td className="px-4 py-3 text-gray-700">{entry.claim?.insuredName || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.claim?.clientName || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.vehicle || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{entry.vin || '—'}</td>
                    <td className="px-4 py-3">
                      <StateCell entry={entry} getLicenseBadge={getLicenseBadge} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.claim?.insuranceCompany || '—'}</td>
                    {adminView && (
                      <td className="px-4 py-3 text-gray-700">
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
                    {perRowReassign && (
                      <td className="px-4 py-3">
                        <select
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const val = e.target.value
                            e.currentTarget.value = ''  // reset so the same choice can be re-picked
                            if (val === '') return
                            if (val === '__unassign__') {
                              setPendingRowReassign({ entry, targetId: null, targetLabel: 'Unassigned' })
                              return
                            }
                            const p = profiles.find(x => x.id === val)
                            setPendingRowReassign({
                              entry,
                              targetId: val,
                              targetLabel: p ? (p.name || p.email) : 'Unknown',
                            })
                          }}
                          className="text-xs bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Reassign to…</option>
                          <option value="__unassign__">— Unassigned —</option>
                          {profiles.map(p => (
                            <option key={p.id} value={p.id}>
                              {(p.name || p.email)}
                              {p.id === entry.assignedTo ? '  (current)' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {adminView && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => openDelete(e, entry)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1"
                          title="Delete claim"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
        open={!!pendingRowReassign}
        title="Reassign this claim?"
        message={
          pendingRowReassign ? (
            <>
              Reassign claim <b>{pendingRowReassign.entry.maNumber || pendingRowReassign.entry.id}</b> to{' '}
              <b>{pendingRowReassign.targetLabel}</b>? The claim stays submitted — the new appraiser
              picks up review responsibility.
            </>
          ) : null
        }
        confirmLabel="Reassign"
        variant="primary"
        busy={rowReassignBusy}
        onConfirm={runRowReassign}
        onCancel={() => setPendingRowReassign(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this claim?"
        message={
          deleteTarget ? (
            <>
              This will permanently delete claim <b>{deleteTarget.maNumber || deleteTarget.id}</b>
              {deleteTarget.claim?.insuredName ? <> for <b>{deleteTarget.claim.insuredName}</b></> : null}.
              This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        variant="danger"
        busy={deleteBusy}
        onConfirm={runDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
