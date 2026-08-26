"use client"

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Trash2, X } from 'lucide-react'
import { deleteACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import type { Profile } from '@/lib/supabase/profiles'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  })
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
}: {
  entries: ACVHistoryEntry[]
  onDeleted: (id: string) => void
  emptyText: string
  showStatus?: boolean
  adminView?: boolean
  profiles?: Profile[]
  showSubmittedColumn?: boolean
  onAssignmentChanged?: () => void
}) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAssignee, setBulkAssignee] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ACVHistoryEntry | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase().trim()
    return entries.filter(e =>
      e.maNumber?.toLowerCase().includes(q) ||
      e.vin?.toLowerCase().includes(q) ||
      (e.claim?.claimNumber ?? '').toLowerCase().includes(q) ||
      e.vehicle?.toLowerCase().includes(q) ||
      (e.claim?.insuredName ?? '').toLowerCase().includes(q) ||
      (e.claim?.insuranceCompany ?? '').toLowerCase().includes(q)
    )
  }, [entries, searchQuery])

  // Look up an assignee's display name by profile id.
  const nameFor = (id: string | null | undefined): string => {
    if (!id) return ''
    const p = profiles.find(x => x.id === id)
    return p?.name || p?.email || 'Unknown'
  }

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

  const colCount =
    (adminView ? 1 : 0) + // checkbox
    6 + // MA, Insured, Vehicle, VIN, Date, Ins. Co.
    (adminView ? 1 : 0) + // Assigned To (read-only text now)
    (showStatus ? 1 : 0) +
    (showSubmittedColumn ? 1 : 0) +
    (adminView ? 1 : 0) // Delete (admin-only)

  const selectedCount = selectedIds.size

  return (
    <div>
      {/* Bulk action toolbar (admin only, visible when selection is non-empty) */}
      {adminView && selectedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm font-semibold text-blue-900">
            {selectedCount} claim{selectedCount === 1 ? '' : 's'} selected
          </div>
          <div className="flex items-center gap-2 ml-auto">
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

      <div className="flex items-center justify-end mb-4">
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">VIN</th>
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
                return (
                  <tr
                    key={entry.id}
                    onClick={() => router.push(`/claims/${entry.id}`)}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {adminView && (
                      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select claim ${entry.maNumber || entry.id}`}
                          checked={isSelected}
                          onChange={() => toggleOne(entry.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-900 font-medium">{entry.maNumber || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.claim?.insuredName || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.vehicle || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{entry.vin || '—'}</td>
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
