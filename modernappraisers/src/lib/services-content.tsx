import type { ReactNode } from 'react'

// All 10 Modern Appraisers services. "Right to Appraisal" is the umbrella
// category that encompasses ACV, DV, and Cost of Repair — the three
// valuation / dispute types that most commonly invoke the appraisal clause.
// Loss of Use, Storage, Subrogation, Umpire, Desk Reviews, and Full
// Appraisals are standalone offerings alongside the RTA umbrella.
//
// Icons are inline SVG (lucide-style, 1.5px stroke). Served via iconFor()
// so colors/sizes come from the consuming component.

export type ServiceCategory = 'rta' | 'loss-costs' | 'review' | 'field'

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  'rta':        'Right to Appraisal',
  'loss-costs': 'Loss & Recovery Costs',
  'review':     'Review & Dispute',
  'field':      'Field & Remote Services',
}

export const CATEGORY_DESCRIPTIONS: Record<ServiceCategory, string> = {
  'rta':        'When the appraisal clause is invoked, we provide the independent valuation. ACV, DV, and Cost of Repair are the three disputes that most commonly go to appraisal — all handled under one roof.',
  'loss-costs': 'Dollar components of a claim that often get disputed separately — rental, downtime, storage, and subrogation audits.',
  'review':     'Independent audit, umpire, and third-opinion services when another appraiser or estimator has already weighed in.',
  'field':      'In-person inspection and remote-only options to fit the file.',
}

export interface Service {
  slug: string
  title: string
  // 10–15 word pitch — fits in a compact home-page card.
  shortPitch: string
  // 2–3 sentence card copy for the services page.
  description: string
  // Scannable key points — appear as bullets on the services page.
  bullets: string[]
  category: ServiceCategory
  // Where "Learn more" links to. ACV, DV, Cost of Repair, Loss of Use,
  // Storage, and Right to Appraisal have dedicated detail pages;
  // Subrogation, Umpire, Desk Reviews, Full Appraisals link to services
  // page #slug for now.
  href: string
}

export const SERVICES: Service[] = [
  // ── RIGHT TO APPRAISAL UMBRELLA ──
  {
    slug: 'right-to-appraisal',
    title: 'Right to Appraisal',
    shortPitch: 'The umbrella — ACV, DV, and Cost of Repair disputes handled under one roof.',
    description: 'The appraisal clause in most auto policies lets either party demand an independent appraisal when valuation is disputed. We handle every type of dispute that can go to appraisal — Actual Cash Value, Diminished Value, and Cost of Repair — with defensible methodology formatted for the proceeding.',
    bullets: [
      'ACV, DV, and Cost of Repair proceedings',
      'Appraiser or umpire role, either side of the file',
      'Full comparables + methodology for the record',
    ],
    category: 'rta',
    href: '/righttoappraisal',
  },
  {
    slug: 'acv',
    title: 'Actual Cash Value',
    shortPitch: 'Independent total-loss valuations with every comparable documented.',
    description: 'Independent ACV for a total-loss claim. We pull live-market comparables, apply mileage and condition adjustments transparently, and document the methodology — defensible on-file, in negotiation, and at appraisal clause.',
    bullets: [
      'Comparables pulled from live retail + auction data',
      'Mileage, condition, and option adjustments shown line-by-line',
      'Compliant with state-specific ACV statutes (CA, GA, FL, TX, etc.)',
    ],
    category: 'rta',
    href: '/actualcashvalue',
  },
  {
    slug: 'dv',
    title: 'Diminished Value',
    shortPitch: 'Post-repair loss-in-value documented with jurisdiction-appropriate methodology.',
    description: 'Document the inherent loss in value after collision repair. We use 17c, modified 17c, or market-based methodology depending on jurisdiction, and cover both first-party DV (where allowed) and third-party DV demands.',
    bullets: [
      'Jurisdiction-appropriate methodology (17c / modified / market-based)',
      'First-party (GA, VA) and third-party (49 states) coverage',
      'Market comparables research for luxury / low-mileage vehicles',
    ],
    category: 'rta',
    href: '/diminishedvalue',
  },
  {
    slug: 'cost-of-repair',
    title: 'Cost of Repair Disputes',
    shortPitch: 'Line-by-line audit of a disputed collision estimate.',
    description: 'Independent audit of a disputed estimate — labor rates, hours, paint operations, parts procurement, OEM procedure compliance. We flag over-writes, duplicate operations, and missing operations, delivered as a corrected counter-estimate.',
    bullets: [
      'Line-item audit against P-pages + OEM procedures',
      'Labor rate validation against local market (SCRS, DRP surveys)',
      'Three-stage paint + ADAS calibration + supplement reviews',
    ],
    category: 'rta',
    href: '/costofrepair',
  },

  // ── LOSS & RECOVERY COSTS ──
  {
    slug: 'loss-of-use',
    title: 'Loss of Use',
    shortPitch: 'Reasonable loss-of-use calculated and documented for the file.',
    description: 'Independent calculation of defensible loss-of-use. Rental-market research for the comparable vehicle class, appropriate duration based on the repair timeline, and commercial-vehicle lost-revenue analysis when applicable.',
    bullets: [
      'Comparable rental class + daily market rate research',
      'Repair timeline analysis — reasonable duration vs. owner-caused delay',
      'Commercial vehicle lost-profits documentation',
    ],
    category: 'loss-costs',
    href: '/lossofuse',
  },
  {
    slug: 'storage-charges',
    title: 'Storage Charges',
    shortPitch: 'Independent audit of storage invoices for reasonableness and recoverability.',
    description: 'Audit storage invoices for inflated per-diem rates, non-compliant facilities, and extended holds. We benchmark rates against local market and state regulatory caps, and document which charges are recoverable from the at-fault party.',
    bullets: [
      'Per-diem rate benchmarking against state caps + local market',
      'Flags admin / environmental / after-hours fee inflation',
      'Day-by-day duration audit with authorization timeline',
    ],
    category: 'loss-costs',
    href: '/storage',
  },
  {
    slug: 'subrogation',
    title: 'Subrogation',
    shortPitch: 'Independent audit of a subrogation package before it is paid.',
    description: 'Line-item audit of a subrogation package — estimate, rental, storage, salvage. We flag inflated or non-recoverable costs so the demand can be adjusted appropriately before settlement, from either side of the subrogation.',
    bullets: [
      'Full line-item audit of the subrogation demand',
      'Flags non-recoverable or inflated costs',
      'Written adjustment recommendations for the file',
    ],
    category: 'loss-costs',
    href: '/services#subrogation',
  },

  // ── REVIEW & DISPUTE ──
  {
    slug: 'umpire',
    title: 'Umpire Services',
    shortPitch: 'Neutral umpire for appraisal-clause proceedings.',
    description: "When the two appraisers can't agree, we serve as neutral umpire — independent review of both sides' work, with a binding ruling on ACV, DV, or Cost of Repair, fully documented for the record.",
    bullets: [
      "Independent review of both appraisers' work",
      'Binding ruling formatted for the record',
      'ACV / DV / Cost of Repair proceedings',
    ],
    category: 'review',
    href: '/services#umpire',
  },
  {
    slug: 'desk-reviews',
    title: 'Desk Reviews',
    shortPitch: 'Full remote appraisal from photos and documents — no in-person inspection.',
    description: "Full remote appraisal from photos and documents. Estimate review, supplement handling, and (optionally) a secured agreed price with the chosen repair facility. Fastest-turnaround option for files that don't need an in-person inspection.",
    bullets: [
      'Fastest turnaround — no site visit required',
      'Full estimate review + supplement handling',
      'Optional secured agreed price with the shop',
    ],
    category: 'review',
    href: '/services#desk-reviews',
  },

  // ── FIELD & REMOTE ──
  {
    slug: 'full-appraisals',
    title: 'Full Appraisals',
    shortPitch: 'In-person inspection and complete appraisal in select locations.',
    description: "In-person inspection and complete appraisal in-market. Available in select service areas — call to confirm coverage for the vehicle's location before assigning.",
    bullets: [
      'In-person inspection by a licensed appraiser',
      'Full ACV / DV / Cost of Repair deliverables',
      'Location-dependent — call to confirm coverage',
    ],
    category: 'field',
    href: '/services#full-appraisals',
  },
]

// Inline SVG icons keyed by service slug. Line style, 1.5 stroke, uses
// currentColor so the parent controls color via Tailwind text-*.
export function iconFor(slug: string): ReactNode {
  const common = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (slug) {
    case 'right-to-appraisal':
      return (
        <svg {...common}>
          <path d="M12 3v18M3 7h18M6 7l-3 7h6zM18 7l-3 7h6zM3 14a3 3 0 006 0M15 14a3 3 0 006 0M8 21h8" />
        </svg>
      )
    case 'acv':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9.5a3 3 0 00-3-1.5c-1.5 0-3 1-3 2.5s1.5 2 3 2 3 .5 3 2.5-1.5 2.5-3 2.5a3 3 0 01-3-1.5M12 6v2M12 16v2" />
        </svg>
      )
    case 'dv':
      return (
        <svg {...common}>
          <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />
        </svg>
      )
    case 'cost-of-repair':
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5zM13 15l6 6" />
        </svg>
      )
    case 'loss-of-use':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'storage-charges':
      return (
        <svg {...common}>
          <path d="M3 9l9-6 9 6v12H3zM9 21v-6h6v6M9 13h6" />
        </svg>
      )
    case 'umpire':
      return (
        <svg {...common}>
          <path d="M14 4l6 6M12 6l6 6-4 4-6-6zM8 12l-5 5a2 2 0 002.8 2.8l5-5M4 20h16" />
        </svg>
      )
    case 'desk-reviews':
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4h6v3H9zM9 12h6M9 16h4" />
        </svg>
      )
    case 'subrogation':
      return (
        <svg {...common}>
          <path d="M7 7l-4 4 4 4M3 11h18M17 17l4-4-4-4M21 13H3" />
        </svg>
      )
    case 'full-appraisals':
      return (
        <svg {...common}>
          <path d="M12 21s-7-6-7-12a7 7 0 1114 0c0 6-7 12-7 12z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      )
    default:
      return null
  }
}
