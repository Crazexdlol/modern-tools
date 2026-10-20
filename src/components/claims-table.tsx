"use client"

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Search, X, Ban, ArrowUpDown, ArrowUp, ArrowDown, Circle, ChevronLeft, ChevronRight } from 'lucide-react'
import { type ACVHistoryEntry, deleteACVHistory } from '@/lib/supabase/history'
import { matchesClaimSearch } from '@/lib/claim-search'
import type { ClaimType } from '@/lib/acv/types'
import { type Profile, useCurrentProfile, isPickerVisible, userHandlesClaimTypes } from '@/lib/supabase/profiles'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { ClaimMessagePreview } from '@/components/claim-message-preview'
import { ClaimLabelPills } from '@/components/claim/ClaimLabelPills'
import { PhaseSelector } from '@/components/claim/phase-selector'
import type { LicensedState } from '@/lib/supabase/licensed-states'
import type { AppraiserLicense } from '@/lib/supabase/appraiser-licenses'
import { isLicensedState, isForbiddenState } from '@/lib/supabase/licensed-states'
import { isLicenseValid } from '@/lib/supabase/appraiser-licenses'
import { extractLossState } from '@/lib/claim-state'
import { type StatusPhaseConfig, formatPhaseAge, phaseColorClasses } from '@/lib/supabase/status-phase-configs'
import { useActiveCompany } from '@/hooks/use-active-company'
import { useCurrentCompanyMembers } from '@/hooks/use-current-company-members'
import { fileNumberLabel } from '@/lib/company-labels'

const PAGE_SIZE = 100

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  })
}

// Short MM/DD/YY date used by the Created and Assigned Date columns.
// Returns an em-dash when the ISO value is missing/invalid so the cell
// never renders as blank.
function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
}

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  rta:       'RTA',
  acv:       'ACV',
  dv:        'DV',
  estimate:  'Estimate',
  storage:   'Storage',
  other:     'Other',
  desk:      'Desk',
  lou:       'LOU',
  full:      'FULL',
  salvage:   'Salvage',
  specialty: 'Specialty',
  umpire:    'Umpire',
}

// Returns a compact label for the Type column plus the full tooltip. Beyond
// two selections the full join ("ACV, DV, Estimate, Storage") stops fitting
// the column cleanly, so we collapse 3+ to "Several" and keep the full list
// available on hover via `full`. 'rta' is filtered out — Henry doesn't want
// the Right To Appraisal flag taking up a Type-column slot on the dashboard
// (it still shows in the workspace locked Claim Type card and the chip
// picker).
function formatClaimTypes(types: ClaimType[] | undefined): { short: string; full: string } {
  if (!types || types.length === 0) return { short: '', full: '' }
  const visible = types.filter(t => t !== 'rta')
  if (visible.length === 0) return { short: '', full: '' }
  const labels = visible.map(t => CLAIM_TYPE_LABELS[t] ?? t)
  const full = labels.join(', ')
  const short = labels.length >= 3 ? 'Several' : full
  return { short, full }
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
  onStarChanged,
  workflowStage,
  linkQuery,
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
  onStarChanged?: (id: string, starred: boolean) => void
  // Active workflow stage of the dashboard tab this table is scoped to.
  // On 'qc' we swap "Assigned To" → "Submitted By" and the bulk Reassign
  // panel is replaced with a Send Back action.
  workflowStage?: 'main' | 'qc' | 'billing_delivery' | 'payment'
  // Appended to every claim-detail Link (e.g. "from=closed"). Lets the
  // destination page's chrome know which list the user came from so the
  // top-nav highlight stays on the right tab after they click through.
  linkQuery?: string
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAssignee, setBulkAssignee] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false)
  const [bulkReassignConfirmOpen, setBulkReassignConfirmOpen] = useState(false)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkCloseConfirmOpen, setBulkCloseConfirmOpen] = useState(false)
  const [bulkCancelConfirmOpen, setBulkCancelConfirmOpen] = useState(false)
  const [bulkReopenConfirmOpen, setBulkReopenConfirmOpen] = useState(false)
  // Bulk reopen is a two-step modal: pick kind (supp/revision) + pick
  // appraiser, then confirm. These three bits of state drive the modal
  // (open flag + current selections). Reset to defaults every time the
  // modal opens.
  const [bulkReopenKind, setBulkReopenKind] = useState<'supplement' | 'revision'>('supplement')
  const [bulkReopenAssignee, setBulkReopenAssignee] = useState<string>('')
  const [bulkSendBackConfirmOpen, setBulkSendBackConfirmOpen] = useState(false)
  // Target of a bulk Send Back on QC. Empty string = "default" (per-claim
  // handling appraiser auto-resolve on the server). Any profile id = override
  // for every selected claim.
  const [bulkSendBackAssignee, setBulkSendBackAssignee] = useState<string>('')
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [sendMessageSubmenuOpen, setSendMessageSubmenuOpen] = useState(false)
  const [statusRequestConfirmOpen, setStatusRequestConfirmOpen] = useState(false)

  // Column sort — Henry wants click-to-sort on Days Open (default), MA #,
  // Insured, Client, Vehicle, VIN, State, Ins. Co., Assigned To. Default is
  // Days Open descending so longest-open claims float to the top and stay
  // there (the sort key uses created_at, which is stable across visits).
  type SortCol = 'ma' | 'owner' | 'client' | 'vehicle' | 'vin' | 'state' | 'created' | 'insco' | 'assignee' | 'assignedDate'
  // Default: oldest claim at the top (longest-open first). 'created' ASC on
  // the ISO createdAt string gives chronological order, which puts the oldest
  // row first — same behavior as the old sort-by-daysOpen DESC.
  const [sortBy, setSortBy] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>({ col: 'created', dir: 'asc' })
  const toggleSort = (col: SortCol) => {
    setSortBy(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  const { activeCompany } = useActiveCompany()
  const tableFileLabel = fileNumberLabel(activeCompany?.slug ?? null)
  const { memberIds: tableMemberIds } = useCurrentCompanyMembers()

  // Current viewer's id — used to derive the "unread" gray highlight on
  // rows assigned to me that I haven't opened since the last (re)assignment.
  const { profile: currentProfile } = useCurrentProfile()
  const currentUserId = currentProfile?.id ?? null

  // Look up an assignee's display name by profile id.
  const nameFor = useCallback((id: string | null | undefined): string => {
    if (!id) return ''
    const p = profiles.find(x => x.id === id)
    return p?.name || p?.email || 'Unknown'
  }, [profiles])

  // Compute license badge status for each entry. Keyed off the NEGOTIATING
  // APPRAISER (free-text name on the claim, resolved against profiles) so
  // the dashboard dot and the in-claim badge always agree. Forbidden
  // overrides everything.
  const getLicenseBadge = useCallback((entry: ACVHistoryEntry): 'forbidden' | 'licensed' | 'not-licensed' | 'unassigned' | null => {
    const state = extractLossState(entry.claim?.ownerAddress)
    if (!state) return null
    if (isForbiddenState(state, licensedStates)) return 'forbidden'
    if (!isLicensedState(state, licensedStates)) return null
    const negotiatingName = (entry.claim?.negotiatingAppraiser ?? '').trim().toLowerCase()
    if (!negotiatingName) return 'unassigned'
    const negotiatingProfile = profiles.find(p => {
      const n = (p.name ?? '').trim().toLowerCase()
      const e = (p.email ?? '').trim().toLowerCase()
      return n === negotiatingName || e === negotiatingName
    })
    if (!negotiatingProfile) return 'unassigned'
    const licenses = licensesByUser.get(negotiatingProfile.id) ?? []
    const validForState = licenses.some(l => l.state === state && isLicenseValid(l))
    return validForState ? 'licensed' : 'not-licensed'
  }, [licensedStates, licensesByUser, profiles])

  const filtered = useMemo(() => {
    const base = entries.filter(e => {
      // Multi-term AND match across MA / claim# / VIN / vehicle / owner (owner
      // or insured or claimant) / client / insurer / handling appraiser /
      // assignee / CLAIM TYPES. "Sedgwick ACV" matches claims where
      // client=Sedgwick AND type=ACV.
      if (!matchesClaimSearch(e, searchQuery, nameFor(e.assignedTo))) return false
      if (phaseFilter !== null && e.statusPhase !== phaseFilter) return false
      return true
    })
    if (!sortBy) return base
    const dir = sortBy.dir === 'asc' ? 1 : -1
    const key = (e: ACVHistoryEntry): string | number => {
      switch (sortBy.col) {
        case 'ma':           return (e.maNumber ?? '').toLowerCase()
        case 'owner':        return (e.claim?.ownerName || e.claim?.insuredName || e.claim?.claimantName || '').toLowerCase()
        case 'client':       return (e.claim?.clientName ?? '').toLowerCase()
        case 'vehicle':      return (e.vehicle ?? '').toLowerCase()
        case 'vin':          return (e.vin ?? '').toLowerCase()
        case 'state':        return (extractLossState(e.claim?.ownerAddress) ?? '').toLowerCase()
        case 'created':      return e.createdAt ?? ''
        case 'insco':        return (e.claim?.insuranceCompany ?? '').toLowerCase()
        case 'assignee':     return ((workflowStage === 'qc' || workflowStage === 'billing_delivery')
          ? (e.claim?.negotiatingAppraiser ?? '')
          : nameFor(e.assignedTo)).toLowerCase()
        case 'assignedDate': return e.assignedAt ?? ''
      }
    }
    return [...base].sort((a, b) => {
      const ka = key(a), kb = key(b)
      if (ka < kb) return -1 * dir
      if (ka > kb) return  1 * dir
      // Tie-break: newest first (fetchACVHistory returns oldest-first, so a
      // tie on daysOpen or any other key would otherwise bury today's claims
      // under identically-aged rows that were loaded earlier in the array).
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })
  }, [entries, searchQuery, nameFor, phaseFilter, sortBy])

  const filteredIds = useMemo(() => filtered.map(e => e.id), [filtered])

  // Client-side pagination. Search/sort/filter run against the full set above,
  // then we slice for rendering so React only diffs PAGE_SIZE rows at a time.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Snap back to page 1 whenever the filtered set changes (new search, phase
  // filter, sort). If we don't, a user on page 4 who types a search that
  // returns 30 rows would see an empty table until they manually paged back.
  useEffect(() => {
    setPage(1)
  }, [searchQuery, phaseFilter, sortBy])
  // Belt-and-suspenders: if the total shrinks below the current page (e.g.
  // deletions from a bulk action), clamp so we never render an empty page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const pageStart = (page - 1) * PAGE_SIZE
  const paginated = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart],
  )
  const paginatedIds = useMemo(() => paginated.map(e => e.id), [paginated])

  // If the user filters away claims they've selected, prune those ids so
  // the "N selected" counter matches what's actually reachable and bulk
  // actions don't operate on hidden rows. Note: selection persists ACROSS
  // pages within the same filtered set — leaving a page doesn't drop it.
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
  // Header select-all now operates on the current page only, matching the
  // standard email-client convention. Bulk actions still run over every
  // selectedId across all pages.
  const allPageSelected =
    paginatedIds.length > 0 && paginatedIds.every(id => selectedIds.has(id))
  const somePageSelected =
    !allPageSelected && paginatedIds.some(id => selectedIds.has(id))

  const toggleAllOnPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allPageSelected) {
        paginatedIds.forEach(id => next.delete(id))
      } else {
        paginatedIds.forEach(id => next.add(id))
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

  // Bulk advance — one consistent button across every workflow tab. On Main
  // it submits (main → qc, old /submit route); every other stage calls the
  // generic /advance-workflow endpoint which figures out the next step
  // (qc → billing_delivery, billing_delivery → payment, payment → closed).
  const runBulkSubmit = async () => {
    setSubmitConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const useSubmit = (workflowStage ?? 'main') === 'main'
    const results = await Promise.all(
      ids.map(id => {
        const req = useSubmit
          ? fetch(`/api/claims/${id}/submit`, { method: 'POST' })
          : fetch(`/api/claims/${id}/advance-workflow`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'advance' }),
            })
        return req
          .then(async r => {
            if (r.ok) return 'ok' as const
            const body = await r.json().catch(() => ({ error: '' }))
            const msg = (body?.error ?? '').toString().toLowerCase()
            if (msg.includes('already submitted') || msg.includes('not open') || msg.includes('not authorized')) return 'skipped' as const
            return 'failed' as const
          })
          .catch(() => 'failed' as const)
      }),
    )
    setBulkBusy(false)
    const ok = results.filter(r => r === 'ok').length
    const skipped = results.filter(r => r === 'skipped').length
    const failed = results.filter(r => r === 'failed').length
    if (failed > 0 || skipped > 0) {
      const parts = [`Advanced ${ok}`]
      if (skipped > 0) parts.push(`${skipped} skipped`)
      if (failed > 0) parts.push(`${failed} failed`)
      setBulkError(parts.join(' · ') + '. Refresh to see current state.')
      onAssignmentChanged?.()
      return
    }
    window.location.reload()
  }

  // Bulk "Request status" — sends a templated message to each selected claim's
  // assignee. "{FirstName}, can I please get a status?". Claims without an
  // assignee are skipped (no one to send to).
  const runBulkStatusRequest = async () => {
    setStatusRequestConfirmOpen(false)
    setActionsMenuOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const results = await Promise.all(
      ids.map(async claimId => {
        const entry = entries.find(e => e.id === claimId)
        const assigneeId = entry?.assignedTo
        if (!assigneeId) return 'skipped' as const
        const fullName = nameFor(assigneeId) || ''
        const firstName = fullName.trim().split(/\s+/)[0] || 'there'
        const messageBody = `${firstName}, can I please get a status?`
        try {
          const r = await fetch(`/api/claims/${claimId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientIds: [assigneeId], body: messageBody }),
          })
          return r.ok ? 'ok' as const : 'failed' as const
        } catch {
          return 'failed' as const
        }
      }),
    )
    setBulkBusy(false)
    const ok = results.filter(r => r === 'ok').length
    const skipped = results.filter(r => r === 'skipped').length
    const failed = results.filter(r => r === 'failed').length
    if (failed > 0 || skipped > 0) {
      const parts = [`Sent ${ok}`]
      if (skipped > 0) parts.push(`${skipped} unassigned (skipped)`)
      if (failed > 0) parts.push(`${failed} failed`)
      setBulkError(parts.join(' · ') + '.')
      return
    }
    clearSelection()
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

  // Bulk cancel — same as runBulkClose but posts { reason: 'cancelled' }
  // so the resulting rows are marked Cancelled (excluded from Settlement
  // Analytics, shown with the red Cancelled pill on the All Claims view).
  const runBulkCancel = async () => {
    setBulkCancelConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const results = await Promise.all(
      ids.map(id =>
        fetch(`/api/claims/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'cancelled' }),
        })
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
      const parts = [`Cancelled ${ok}`]
      if (skipped > 0) parts.push(`${skipped} skipped (already closed)`)
      if (failed > 0) parts.push(`${failed} failed`)
      setBulkError(parts.join(' · ') + '. Refresh to see current state.')
      onAssignmentChanged?.()
      return
    }
    window.location.reload()
  }

  const runBulkSendBack = async () => {
    setBulkSendBackConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selectedIds)
    const override = bulkSendBackAssignee || null
    const results = await Promise.all(
      ids.map(id => {
        const body: Record<string, unknown> = { action: 'send_back', toStage: 'main' }
        if (override) body.toAssignee = override
        return fetch(`/api/claims/${id}/advance-workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then(r => r.ok)
          .catch(() => false)
      }),
    )
    setBulkBusy(false)
    const failed = results.filter(ok => !ok).length
    if (failed > 0) {
      setBulkError(
        `Sent ${results.length - failed} of ${results.length} claims back. ${failed} failed — refresh to see current state.`,
      )
      onAssignmentChanged?.()
      return
    }
    window.location.reload()
  }

  // Bulk reopen — matches the single-claim reopen contract. Each selected
  // closed claim is posted with { as, assignTo }; mixed selections with
  // already-open claims naturally skip (server returns "Claim is not
  // closed" → 'skipped' bucket, same as before). Open claims in a mixed
  // selection are simply ignored by this flow (Reassign handles them).
  const runBulkReopen = async () => {
    setBulkReopenConfirmOpen(false)
    setBulkBusy(true)
    setBulkError(null)
    const assignTo = bulkReopenAssignee === '__unassign__' ? null : bulkReopenAssignee
    const kind = bulkReopenKind
    const ids = Array.from(selectedIds)
    const results = await Promise.all(
      ids.map(id =>
        fetch(`/api/claims/${id}/reopen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ as: kind, assignTo }),
        })
          .then(async r => {
            if (r.ok) return 'ok' as const
            const body = await r.json().catch(() => ({ error: '' }))
            const msg = (body?.error ?? '').toString().toLowerCase()
            if (msg.includes('not closed')) return 'skipped' as const
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
      const parts = [`Reopened ${ok}`]
      if (skipped > 0) parts.push(`${skipped} skipped (not closed)`)
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
    1 + // star (always leftmost)
    (adminView ? 1 : 0) + // checkbox
    10 + // MA, Owner, Client, Vehicle, Type, VIN, State, Labels, Created, Ins. Co.
    (adminView ? 2 : 0) + // Assigned To + Assigned Date
    (showStatus ? 1 : 0) + // Status pill
    (showSubmittedColumn ? 1 : 0) +
    (statusPhaseConfigs.length > 0 ? 1 : 0) // Phase status column

  const selectedCount = selectedIds.size
  // Union of claim types across the current selection, used to filter the
  // bulk reassign dropdown to users who handle at least one of those types.
  // Empty set → unrestricted (either nothing's selected, or the selection
  // has no typed claims).
  const selectedClaimTypes = useMemo(() => {
    const out = new Set<string>()
    if (selectedCount === 0) return out
    for (const e of entries) {
      if (!selectedIds.has(e.id)) continue
      for (const t of e.claim?.claimTypes ?? []) out.add(t)
    }
    return out
  }, [selectedIds, entries, selectedCount])
  // True when EVERY selected claim is closed. Drives whether to hide the
  // bulk Reassign dropdown entirely (reassign is a no-op on closed claims
  // and the bulk Reopen flow re-assigns as part of its own dialog).
  // For a mixed selection, Reassign still shows (the server-side filter
  // skips the closed ones gracefully).
  const allSelectedClosed = useMemo(() => {
    if (selectedCount === 0) return false
    for (const e of entries) {
      if (selectedIds.has(e.id) && e.status !== 'closed') return false
    }
    return true
  }, [selectedIds, entries, selectedCount])
  // Reopen only applies to closed claims; hide the button entirely when the
  // selection contains none. (Status pill tracks closed-ness; dashboards other
  // than All Claims only hold open rows, so Reopen is hidden there by default.)
  const selectionHasClosed = useMemo(() => {
    if (selectedCount === 0) return false
    for (const e of entries) {
      if (selectedIds.has(e.id) && e.status === 'closed') return true
    }
    return false
  }, [selectedIds, entries, selectedCount])

  // Team-wide star toggle. Optimistic UI: flip immediately, roll back on failure.
  const toggleStar = async (id: string, current: boolean) => {
    const next = !current
    onStarChanged?.(id, next)
    try {
      const res = await fetch(`/api/claims/${id}/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: next }),
      })
      if (!res.ok) {
        onStarChanged?.(id, current) // rollback
        const b = await res.json().catch(() => ({}))
        console.error('star toggle failed:', b)
      }
    } catch (err) {
      onStarChanged?.(id, current)
      console.error('star toggle failed:', err)
    }
  }

  return (
    <div>
      {bulkError && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          {bulkError}
        </div>
      )}

      {/* Toolbar row — bulk actions (when selection non-empty) on the left,
          search box on the right. No blue bubble; buttons sit flat in the
          toolbar for a consistent look across every dashboard that mounts
          this table. */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-4">
        {adminView && selectedCount > 0 && (
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-700">
              {selectedCount} selected
            </span>
            {workflowStage && (
              <Button
                onClick={() => setSubmitConfirmOpen(true)}
                disabled={bulkBusy}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
              >
                {bulkBusy ? 'Working…' : 'Advance'}
              </Button>
            )}
            {workflowStage === 'qc' ? (
              <>
                <span className="text-sm text-gray-600">Send back to:</span>
                <select
                  value={bulkSendBackAssignee}
                  onChange={(e) => setBulkSendBackAssignee(e.target.value)}
                  disabled={bulkBusy}
                  className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">— Negotiating Appraiser (auto) —</option>
                  {profiles
                    .filter(p => isPickerVisible(p) && (tableMemberIds === null || tableMemberIds.has(p.id)))
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.email}</option>
                    ))}
                </select>
                <Button
                  onClick={() => setBulkSendBackConfirmOpen(true)}
                  disabled={bulkBusy}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-sm"
                >
                  {bulkBusy ? 'Sending back…' : 'Send Back'}
                </Button>
              </>
            ) : (
              !allSelectedClosed && (
                <>
                  <span className="text-sm text-gray-600">Reassign to:</span>
                  <select
                    value={bulkAssignee}
                    onChange={(e) => setBulkAssignee(e.target.value)}
                    disabled={bulkBusy}
                    className="bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Pick a person —</option>
                    <option value="__unassign__">— Unassigned —</option>
                    {profiles
                      .filter(p =>
                        isPickerVisible(p) &&
                        (tableMemberIds === null || tableMemberIds.has(p.id)) &&
                        userHandlesClaimTypes(p, Array.from(selectedClaimTypes)),
                      )
                      .map(p => (
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
                </>
              )
            )}
            <div className="relative">
              <Button
                onClick={() => { setActionsMenuOpen(o => !o); setSendMessageSubmenuOpen(false) }}
                disabled={bulkBusy}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
              >
                Actions ▾
              </Button>
              {actionsMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close actions menu"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => { setActionsMenuOpen(false); setSendMessageSubmenuOpen(false) }}
                  />
                  <div className="absolute right-0 top-full mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg z-20 py-1">
                    {/* Send Message — expandable category. Future message
                        templates (not just "Request status") land under here. */}
                    <button
                      type="button"
                      onClick={() => setSendMessageSubmenuOpen(o => !o)}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-900 hover:bg-gray-100"
                    >
                      <span>Send Message</span>
                      <span className="text-gray-400 text-xs">{sendMessageSubmenuOpen ? '▾' : '▸'}</span>
                    </button>
                    {sendMessageSubmenuOpen && (
                      <div className="border-t border-gray-100 bg-gray-50/60">
                        <button
                          type="button"
                          onClick={() => { setActionsMenuOpen(false); setSendMessageSubmenuOpen(false); setStatusRequestConfirmOpen(true) }}
                          className="block w-full text-left pl-6 pr-3 py-2 text-sm text-gray-900 hover:bg-gray-100"
                        >
                          Request status
                        </button>
                      </div>
                    )}
                    {/* Additional top-level action categories can be added
                        here as siblings of "Send Message". */}
                  </div>
                </>
              )}
            </div>
            <Button
              onClick={() => setBulkCloseConfirmOpen(true)}
              disabled={bulkBusy}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >
              Close
            </Button>
            {selectionHasClosed && (
              <Button
                onClick={() => {
                  // Reset the modal state every time it opens so a stale
                  // kind/assignee from a prior session doesn't carry over.
                  setBulkReopenKind('supplement')
                  setBulkReopenAssignee('')
                  setBulkReopenConfirmOpen(true)
                }}
                disabled={bulkBusy}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm"
              >
                Reopen
              </Button>
            )}
            <Button
              onClick={() => setBulkCancelConfirmOpen(true)}
              disabled={bulkBusy}
              className="bg-amber-600 hover:bg-amber-500 text-white text-sm"
              title="Close the selected claims as Cancelled (excluded from Settlement Analytics)."
            >
              Cancel
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
              className="text-gray-400 hover:text-gray-700 p-1"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="relative w-72 ml-auto">
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

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
        {/* table-fixed + colgroup: locks column widths so long values (long
            client name, long insurer, or the Forbidden state pill) can't
            reflow other columns. Cells wrap to multiple lines instead. VIN
            column is sized to fit a full 17-char VIN on one line. */}
        <table className="w-full text-[14px] table-fixed">
          {/* Column widths tuned 2026-10-16 so the admin dashboard fits in
              a ~1400px viewport without horizontal scroll (previous ~1836px
              forced scrolling to see Phase). Long values in Owner / Client /
              Vehicle / Ins. Co. / Assigned To wrap to a 2nd line inside a
              fixed-height row so every row stays the same height. Phase is
              now a stacked rounded-md bubble (label + age vertical), not a
              horizontal pill, so 140px fits worst-case labels. */}
          <colgroup>
            <col style={{ width: '28px' }} />{/* Mark circle (always leftmost) */}
            {adminView && <col style={{ width: '32px' }} />}
            <col style={{ width: '105px' }} />{/* MA # */}
            {showStatus && <col style={{ width: '90px' }} />}{/* Status */}
            <col style={{ width: '120px' }} />{/* Owner (line-clamp-2) */}
            <col style={{ width: '110px' }} />{/* Client (line-clamp-2) */}
            <col style={{ width: '130px' }} />{/* Vehicle (line-clamp-2) */}
            <col style={{ width: '80px' }} />{/* Type */}
            <col style={{ width: '160px' }} />{/* VIN — fits full 17-char VIN mono */}
            <col style={{ width: '60px' }} />{/* State */}
            <col style={{ width: '75px' }} />{/* Labels — fits "Specialty" / "Rough" / "Revision" / "Supp N" */}
            {/* Henry 2026-10-16: group date columns together — Ins. Co. →
                Created → Assigned Date → Assigned To → Phase. */}
            <col style={{ width: '110px' }} />{/* Ins. Co. (line-clamp-2) */}
            <col style={{ width: '85px' }} />{/* Created date (MM/DD/YY) */}
            {adminView && <col style={{ width: '95px' }} />}{/* Assigned Date (MM/DD/YY) */}
            {adminView && <col style={{ width: '120px' }} />}{/* Assigned To (line-clamp-2) */}
            {showSubmittedColumn && <col style={{ width: '110px' }} />}
            {statusPhaseConfigs.length > 0 && <col style={{ width: '140px' }} />}
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-2 py-3" aria-label="Mark" />
              {adminView && (
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={allPageSelected ? 'Clear selection on this page' : 'Select all on this page'}
                    checked={allPageSelected}
                    ref={el => {
                      if (el) el.indeterminate = somePageSelected
                    }}
                    onChange={toggleAllOnPage}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
              )}
              <SortableTh label={tableFileLabel} col="ma"       sortBy={sortBy} onClick={toggleSort} />
              {showStatus && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Status</th>
              )}
              <SortableTh label="Owner"     col="owner"    sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Client"    col="client"   sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="Vehicle"   col="vehicle"  sortBy={sortBy} onClick={toggleSort} />
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Type</th>
              <SortableTh label="VIN"       col="vin"      sortBy={sortBy} onClick={toggleSort} />
              <SortableTh label="State"     col="state"    sortBy={sortBy} onClick={toggleSort} />
              <th className="px-2 py-3" aria-label="Labels" />
              <SortableTh label="Ins. Co."  col="insco"    sortBy={sortBy} onClick={toggleSort} />
              {/* Date / assignee headers deliberately allow wrap — their
                  column widths are tight and "ASSIGNED DATE" / "ASSIGNED TO"
                  would otherwise bleed into the Phase header. The header
                  row grows a line to accommodate; data rows stay fixed. */}
              <SortableTh label="Created Date"  col="created"      sortBy={sortBy} onClick={toggleSort} />
              {adminView && (
                <SortableTh label="Assigned Date" col="assignedDate" sortBy={sortBy} onClick={toggleSort} />
              )}
              {adminView && (
                <SortableTh
                  label={(workflowStage === 'qc' || workflowStage === 'billing_delivery') ? 'Appraiser' : 'Assigned To'}
                  col="assignee"
                  sortBy={sortBy}
                  onClick={toggleSort}
                />
              )}
              {showSubmittedColumn && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider">Submitted</th>
              )}
              {statusPhaseConfigs.length > 0 && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-900 uppercase tracking-wider whitespace-nowrap">Phase</th>
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
              paginated.map((entry) => {
                const isSelected = selectedIds.has(entry.id)
                const isUnread = Boolean(
                  currentUserId &&
                  entry.assignedTo === currentUserId &&
                  (!entry.openedAt || (entry.assignedAt && entry.assignedAt > entry.openedAt))
                )
                return (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-b border-gray-100 transition-colors h-[72px]',
                      isUnread ? 'bg-gray-100 hover:bg-gray-200' : 'hover:bg-gray-50',
                      isSelected && 'bg-blue-50/40',
                    )}
                  >
                    <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleStar(entry.id, entry.starred === true)}
                        title={entry.starred ? 'Unmark' : 'Mark'}
                        aria-label={entry.starred ? 'Unmark claim' : 'Mark claim'}
                        className={`p-1 rounded transition-colors ${entry.starred ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-400'}`}
                      >
                        <Circle className={`w-4 h-4 ${entry.starred ? 'fill-current' : ''}`} />
                      </button>
                    </td>
                    {adminView && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select claim ${entry.maNumber || entry.id}`}
                          checked={isSelected}
                          onChange={() => toggleOne(entry.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5 align-middle">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link
                          href={linkQuery ? `/claims/${entry.id}?${linkQuery}` : `/claims/${entry.id}`}
                          className="text-gray-900 font-medium hover:text-blue-600 hover:underline text-left truncate"
                          title={entry.maNumber || undefined}
                        >
                          {entry.maNumber || '—'}
                        </Link>
                        <ClaimMessagePreview claimId={entry.id} />
                      </div>
                    </td>
                    {showStatus && (
                      <td className="px-4 py-2.5">
                        {entry.status === 'closed' ? (
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              entry.closeReason === 'cancelled'
                                ? 'text-red-700 bg-red-50 border-red-200'
                                : 'text-gray-600 bg-gray-100 border-gray-300'
                            }`}
                            title={entry.closeReason === 'cancelled' ? 'Closed as Cancelled' : 'Submitted'}
                          >
                            {entry.closeReason === 'cancelled' ? 'Cancelled' : 'Submitted'}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200">
                            Open
                          </span>
                        )}
                      </td>
                    )}
                    {(() => {
                      const ownerDisplay = entry.claim?.ownerName || entry.claim?.insuredName || entry.claim?.claimantName || ''
                      return (
                        <td className="px-4 py-2.5 text-gray-900 align-middle" title={ownerDisplay || undefined}>
                          <div className="line-clamp-2 break-words">{ownerDisplay || <span className="text-gray-400">—</span>}</div>
                        </td>
                      )
                    })()}
                    <td className="px-4 py-2.5 text-gray-900 align-middle" title={entry.claim?.clientName || undefined}>
                      <div className="line-clamp-2 break-words">{entry.claim?.clientName || <span className="text-gray-400">—</span>}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 align-middle" title={entry.vehicle || undefined}>
                      <div className="line-clamp-2 break-words">{entry.vehicle || <span className="text-gray-400">—</span>}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 align-middle whitespace-nowrap">
                      {(() => {
                        const { short, full } = formatClaimTypes(entry.claim?.claimTypes)
                        return short
                          ? <span className="text-xs font-semibold" title={full}>{short}</span>
                          : <span className="text-gray-400">—</span>
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 font-mono text-xs align-middle whitespace-nowrap">{entry.vin || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2.5 align-middle">
                      <StateCell entry={entry} getLicenseBadge={getLicenseBadge} />
                    </td>
                    <td className="px-2 py-2.5 align-middle">
                      <ClaimLabelPills
                        supplementCount={entry.supplementCount}
                        isRevision={entry.isRevision}
                        isSpecialty={(entry.claim?.claimTypes ?? []).includes('specialty')}
                        needsRoughNumbers={entry.needsRoughNumbers}
                        claimStatus={entry.status ?? 'open'}
                      />
                    </td>
                    {/* Column order (Henry 2026-10-16): Ins. Co. → Created
                        → Assigned Date → Assigned To → Phase. Dates grouped
                        together, Assigned Date right next to Assigned To. */}
                    <td className="px-4 py-2.5 text-gray-900 align-middle" title={entry.claim?.insuranceCompany || undefined}>
                      <div className="line-clamp-2 break-words">{entry.claim?.insuranceCompany || <span className="text-gray-400">—</span>}</div>
                    </td>
                    <td
                      className="px-4 py-2.5 text-gray-900 whitespace-nowrap align-middle tabular-nums"
                      title={entry.createdAt
                        ? entry.status === 'closed' && entry.closedAt
                          ? `Opened ${fmtDate(entry.createdAt)} · ${entry.closeReason === 'cancelled' ? 'Cancelled' : 'Submitted'} ${fmtDate(entry.closedAt)}`
                          : `Opened ${fmtDate(entry.createdAt)}`
                        : undefined}
                    >
                      {fmtShortDate(entry.createdAt)}
                    </td>
                    {adminView && (
                      <td className="px-4 py-2.5 text-gray-900 whitespace-nowrap align-middle tabular-nums"
                          title={entry.assignedAt ? `Last assigned ${fmtDate(entry.assignedAt)}` : undefined}>
                        {entry.assignedAt
                          ? fmtShortDate(entry.assignedAt)
                          : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {adminView && (() => {
                      // QC and Billing/Delivery tabs show the negotiating appraiser
                      // (from claim.negotiatingAppraiser, a free-text name) — the
                      // live `assigned_to` is cleared on submit and never set
                      // again for the post-QC stages. Other tabs show the live
                      // assignee.
                      if (workflowStage === 'qc' || workflowStage === 'billing_delivery') {
                        const name = (entry.claim?.negotiatingAppraiser ?? '').trim()
                        return (
                          <td className="px-4 py-2.5 text-gray-900 align-middle" title={name || undefined}>
                            <div className="line-clamp-2 break-words">{name || <span className="text-gray-400 italic">—</span>}</div>
                          </td>
                        )
                      }
                      return (
                        <td className="px-4 py-2.5 text-gray-900 align-middle" title={entry.assignedTo ? nameFor(entry.assignedTo) : undefined}>
                          <div className="line-clamp-2 break-words">
                            {entry.assignedTo
                              ? nameFor(entry.assignedTo)
                              : <span className="text-gray-400 italic">Unassigned</span>}
                          </div>
                        </td>
                      )
                    })()}
                    {showSubmittedColumn && (
                      <td className="px-4 py-2.5">
                        {entry.submittedAt ? (
                          <div>
                            <div className="text-sm text-gray-700">{fmtDate(entry.submittedAt)}</div>
                            <div className="text-xs text-gray-500">{nameFor(entry.submittedBy) || 'Unknown'}</div>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {statusPhaseConfigs.length > 0 && (
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
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
                            // Stacked bubble (not pill). Phase label on line 1,
                            // age on line 2 so a 140px column still fits the
                            // worst labels. min-h locks the bubble to the same
                            // height whether age is present or not — AND same
                            // height as the "No Status" variant below so every
                            // phase cell renders identically. Henry 2026-10-16.
                            <span
                              className={`flex flex-col items-center justify-center w-full px-2 py-1 rounded-md border text-center !text-black min-h-[48px] ${phaseColorClasses(cfg.color)}`}
                              title={age ? `${cfg.label} · ${age}` : cfg.label}
                            >
                              <span className="text-xs font-semibold leading-tight">{cfg.label}</span>
                              {age && <span className="text-[11px] font-medium leading-tight mt-0.5 !text-black">{age}</span>}
                            </span>
                          )
                        })() : (
                          // Non-admin "No Status" — same min-h as the phased
                          // variant so rows look uniform across the dashboard.
                          <span className="flex items-center justify-center w-full px-2 py-1 rounded-md border bg-white border-gray-200 text-gray-500 text-xs font-semibold min-h-[48px]">
                            No Status
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <div>
            {filtered.length <= PAGE_SIZE ? (
              <>Showing {filtered.length} claim{filtered.length === 1 ? '' : 's'}</>
            ) : (
              <>
                Showing <span className="font-semibold text-gray-900">{pageStart + 1}</span>
                –<span className="font-semibold text-gray-900">{Math.min(pageStart + PAGE_SIZE, filtered.length)}</span>{' '}
                of <span className="font-semibold text-gray-900">{filtered.length}</span>
              </>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <span className="px-2 text-gray-600">
                Page <span className="font-semibold text-gray-900">{page}</span> of{' '}
                <span className="font-semibold text-gray-900">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={submitConfirmOpen}
        title={`Advance ${selectedCount} claim${selectedCount === 1 ? '' : 's'}?`}
        message={
          <>
            Moves the selected claim{selectedCount === 1 ? '' : 's'} to the next stage.
            Claims that can&apos;t advance from their current stage will be skipped.
          </>
        }
        confirmLabel="Advance"
        variant="primary"
        busy={bulkBusy}
        onConfirm={runBulkSubmit}
        onCancel={() => setSubmitConfirmOpen(false)}
      />

      <ConfirmDialog
        open={statusRequestConfirmOpen}
        title={`Send status request to ${selectedCount} claim${selectedCount === 1 ? '' : 's'}?`}
        message={
          <>
            A message goes to each claim&apos;s assignee: <i>&quot;[FirstName], can I please get a status?&quot;</i>.
            Claims with no assignee are skipped.
          </>
        }
        confirmLabel="Send"
        variant="primary"
        busy={bulkBusy}
        onConfirm={runBulkStatusRequest}
        onCancel={() => setStatusRequestConfirmOpen(false)}
      />

      <ConfirmDialog
        open={bulkSendBackConfirmOpen}
        title={`Send ${selectedCount} claim${selectedCount === 1 ? '' : 's'} back?`}
        message={
          <>
            Returns the selected claim{selectedCount === 1 ? '' : 's'} to <b>Appraiser</b> and reassigns {selectedCount === 1 ? 'it' : 'them'} to{' '}
            <b>
              {bulkSendBackAssignee
                ? (profiles.find(p => p.id === bulkSendBackAssignee)?.name
                   || profiles.find(p => p.id === bulkSendBackAssignee)?.email
                   || 'the chosen appraiser')
                : 'the handling appraiser on each file'}
            </b>.
          </>
        }
        confirmLabel="Send Back"
        variant="primary"
        busy={bulkBusy}
        onConfirm={runBulkSendBack}
        onCancel={() => setBulkSendBackConfirmOpen(false)}
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
        open={bulkCancelConfirmOpen}
        title={`Cancel ${selectedCount} claim${selectedCount === 1 ? '' : 's'}?`}
        message={
          <>
            Closes the selected claim{selectedCount === 1 ? '' : 's'} as <b>Cancelled</b>.
            {' '}They will show the red Cancelled badge on the All Claims list and be
            excluded from Settlement Analytics. Already-closed claims are skipped.
          </>
        }
        confirmLabel="Cancel claims"
        variant="danger"
        busy={bulkBusy}
        onConfirm={runBulkCancel}
        onCancel={() => setBulkCancelConfirmOpen(false)}
      />

      {bulkReopenConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                Reopen {selectedCount} claim{selectedCount === 1 ? '' : 's'}?
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Pick how they&apos;re reopened and which appraiser they&apos;re routed to.
                Any already-open claims in the selection are skipped.
              </p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Reopen as
                </div>
                <div className="flex gap-2">
                  <label className={`flex-1 flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm font-semibold ${bulkReopenKind === 'supplement' ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                    <input
                      type="radio"
                      name="bulk-reopen-kind"
                      checked={bulkReopenKind === 'supplement'}
                      onChange={() => setBulkReopenKind('supplement')}
                      className="accent-amber-600"
                    />
                    Supplement
                  </label>
                  <label className={`flex-1 flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm font-semibold ${bulkReopenKind === 'revision' ? 'bg-yellow-400 border-yellow-500 text-black' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                    <input
                      type="radio"
                      name="bulk-reopen-kind"
                      checked={bulkReopenKind === 'revision'}
                      onChange={() => setBulkReopenKind('revision')}
                      className="accent-yellow-600"
                    />
                    Revision
                  </label>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Assign to
                </div>
                <select
                  value={bulkReopenAssignee}
                  onChange={(e) => setBulkReopenAssignee(e.target.value)}
                  disabled={bulkBusy}
                  className="w-full bg-white border border-gray-200 rounded px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Pick a person —</option>
                  <option value="__unassign__">— Unassigned —</option>
                  {profiles
                    .filter(p =>
                      isPickerVisible(p) &&
                      (tableMemberIds === null || tableMemberIds.has(p.id)) &&
                      userHandlesClaimTypes(p, Array.from(selectedClaimTypes)),
                    )
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.email}</option>
                    ))}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
              <Button
                onClick={() => setBulkReopenConfirmOpen(false)}
                disabled={bulkBusy}
                variant="outline"
                className="text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={runBulkReopen}
                disabled={bulkBusy || !bulkReopenAssignee}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold"
              >
                {bulkBusy ? 'Reopening…' : `Reopen ${selectedCount} claim${selectedCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      )}

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
  col: 'ma' | 'owner' | 'client' | 'vehicle' | 'vin' | 'state' | 'created' | 'insco' | 'assignee' | 'assignedDate'
  sortBy: { col: string; dir: 'asc' | 'desc' } | null
  onClick: (col: 'ma' | 'owner' | 'client' | 'vehicle' | 'vin' | 'state' | 'created' | 'insco' | 'assignee' | 'assignedDate') => void
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
