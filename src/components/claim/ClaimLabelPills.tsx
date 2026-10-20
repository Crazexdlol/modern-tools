// Shared pill renderer for the three descriptive claim labels
// (Supp N / Revision / Specialty). Every surface that shows a claim's
// identity renders these alongside the Open/Submitted status pill —
// dashboard table rows, workspace toolbar, claim search, dashboard tiles.
//
// Pills always display left-to-right in a fixed order so rows scan
// consistently: Supp → Revision → Specialty. Nothing renders when all
// three are at their defaults (count=0 / false / false).

interface ClaimLabelPillsProps {
  supplementCount?: number | null
  isRevision?: boolean | null
  isSpecialty?: boolean | null
  // Rough-numbers workflow (2026-10-13). When true, renders a blue "Rough
  // Numbers" pill so admins can scan which claims will take the parked path.
  needsRoughNumbers?: boolean | null
  // Current claim status. When the claim is closed, the Supp pill is
  // suppressed — a supplement that's already been resolved and closed
  // is no longer "a live supplement in progress." If the claim gets
  // reopened as another supplement later, the counter increments and
  // the pill returns (now showing Supp 2, etc.). Henry 2026-10-12.
  claimStatus?: 'open' | 'closed' | null
  // When true, pills don't wrap — row extends horizontally instead of
  // bumping the row height. Default false (wrap).
  nowrap?: boolean
}

const PILL_BASE = 'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap'

export function ClaimLabelPills({ supplementCount, isRevision, isSpecialty, needsRoughNumbers, claimStatus, nowrap }: ClaimLabelPillsProps) {
  const supp = Number(supplementCount ?? 0)
  const isClosed = claimStatus === 'closed'
  // Supp pill hides on closed claims — see interface comment above.
  const hasSupp = supp >= 1 && !isClosed
  const hasRevision = isRevision === true
  const hasSpecialty = isSpecialty === true
  const hasRough = needsRoughNumbers === true
  if (!hasSupp && !hasRevision && !hasSpecialty && !hasRough) return null

  return (
    <span className={`inline-flex items-center gap-1 ${nowrap ? 'whitespace-nowrap' : 'flex-wrap'}`}>
      {hasRough && (
        <span
          className={`${PILL_BASE} text-blue-800 bg-blue-50 border-blue-200`}
          title="Rough Numbers workflow — first Submit parks the claim with the Rough Numbers inbox owner"
        >
          Rough
        </span>
      )}
      {hasSupp && (
        <span
          className={`${PILL_BASE} text-amber-800 bg-amber-100 border-amber-300`}
          title={`Reopened as a supplement ${supp} time${supp === 1 ? '' : 's'}`}
        >
          Supp {supp}
        </span>
      )}
      {hasRevision && (
        <span
          className={`${PILL_BASE} text-black bg-yellow-400 border-yellow-500`}
          title="Reopened as a revision"
        >
          Revision
        </span>
      )}
      {hasSpecialty && (
        <span
          className={`${PILL_BASE} text-indigo-800 bg-indigo-100 border-indigo-300`}
          title="Specialty claim"
        >
          Specialty
        </span>
      )}
    </span>
  )
}
