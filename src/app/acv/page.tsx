"use client"

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Search, Trash2 } from 'lucide-react'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from '@/lib/acv/types'

const HISTORY_KEY = 'modern-tools-acv-history'

interface ACVHistoryEntry {
  id: string
  date: string
  mode: string
  vehicle: string
  vin: string
  maNumber: string
  acv: number
  claim: ClaimInfo
  comps: SelectedComp[]
  adjustments: ACVAdjustments
  result: ACVResult
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  })
}

export default function ACVPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<ACVHistoryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    try {
      const h: ACVHistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
      setEntries(h)
    } catch { /* ignore */ }
  }, [])

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

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const updated = entries.filter(entry => entry.id !== id)
    setEntries(updated)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  }

  const handleOpen = (entry: ACVHistoryEntry) => {
    sessionStorage.setItem('modern-tools-acv-edit', JSON.stringify(entry))
    if (entry.mode === 'auto-acv') {
      router.push('/acv/auto-acv?edit=true')
    } else if (entry.mode === 'auction') {
      router.push('/acv/auction?edit=true')
    } else {
      router.push('/acv/comp-finder?edit=true')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-white">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tool cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Link href="/acv/comp-finder" className="group">
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 text-center transition-all duration-200 group-hover:shadow-md group-hover:border-blue-400 group-hover:-translate-y-0.5">
              <h3 className="text-lg font-bold text-gray-900">Comp Finder</h3>
              <p className="text-xs text-gray-400 mt-1">Manual comp search & selection</p>
            </div>
          </Link>
          <Link href="/acv/auto-acv" className="group">
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 text-center transition-all duration-200 group-hover:shadow-md group-hover:border-blue-400 group-hover:-translate-y-0.5">
              <h3 className="text-lg font-bold text-gray-900">Auto ACV</h3>
              <p className="text-xs text-gray-400 mt-1">Automated value calculation</p>
            </div>
          </Link>
          <Link href="/acv/auction" className="group">
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-6 text-center transition-all duration-200 group-hover:shadow-md group-hover:border-blue-400 group-hover:-translate-y-0.5">
              <h3 className="text-lg font-bold text-gray-900">Loss Search</h3>
              <p className="text-xs text-gray-400 mt-1">Search auction & loss records</p>
            </div>
          </Link>
        </div>

        {/* Claims header + search */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">ACV Claims</h2>
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

        {/* Table */}
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
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400">
                    {searchQuery ? 'No claims match your search.' : 'No claims yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => handleOpen(entry)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-900 font-medium">{entry.maNumber || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.claim?.insuredName || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.vehicle || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{entry.vin || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.claim?.insuranceCompany || '—'}</td>
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
      </main>
    </div>
  )
}
