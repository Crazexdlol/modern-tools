"use client"

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Trash2 } from 'lucide-react'
import { deleteACVHistory, type ACVHistoryEntry } from '@/lib/supabase/history'
import type { Profile } from '@/lib/supabase/profiles'

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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this claim? This cannot be undone.')) return
    onDeleted(id)
    await deleteACVHistory(id)
  }

  const handleAssignChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
    id: string,
  ) => {
    e.stopPropagation()
    const value = e.target.value || null
    const res = await fetch(`/api/claims/${id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: value }),
    })
    if (res.ok) onAssignmentChanged?.()
  }

  const colCount =
    6 + // MA, Insured, Vehicle, VIN, Date, Ins. Co.
    (adminView ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showSubmittedColumn ? 1 : 0) +
    1 // Delete

  return (
    <div>
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
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Delete</th>
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
              filtered.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => router.push(`/claims/${entry.id}`)}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-gray-900 font-medium">{entry.maNumber || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.claim?.insuredName || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.vehicle || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{entry.vin || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(entry.date)}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.claim?.insuranceCompany || '—'}</td>
                  {adminView && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={entry.assignedTo ?? ''}
                        onChange={(e) => handleAssignChange(e, entry.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Unassigned</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
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
                          <div className="text-xs text-gray-500">{profiles?.find(p => p.id === entry.submittedBy)?.name || 'Unknown'}</div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(e, entry.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
