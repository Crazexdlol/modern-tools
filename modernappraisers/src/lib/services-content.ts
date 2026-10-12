export interface ServiceContent {
  slug: string
  title: string
  shortTitle: string
  summary: string
  whenYouNeedIt: string[]
  howItWorks: string[]
  category: 'valuation' | 'dispute' | 'loss' | 'costs'
}

export const SERVICES: ServiceContent[] = [
  // ── Valuation ────────────────────────────────────────────────
  {
    slug: 'acv',
    title: 'Actual Cash Value',
    shortTitle: 'ACV',
    summary: 'Independent market-based ACV documentation for total-loss files. Comparable sales, mileage and condition adjustments, defensible methodology.',
    whenYouNeedIt: [
      'Total-loss settlements where the insured is disputing the carrier\'s valuation',
      'Internal valuation on first-party claims to verify a third-party vendor number',
      'Pre-litigation vehicle valuation on files headed to appraisal clause or trial',
    ],
    howItWorks: [
      'Market comparables pulled against the loss vehicle\'s exact spec',
      'Mileage, condition, and option adjustments documented line-by-line',
      'Final report delivered in 3–5 business days',
    ],
    category: 'valuation',
  },
  {
    slug: 'diminished-value',
    title: 'Diminished Value',
    shortTitle: 'DV',
    summary: 'Post-repair resale-value loss analysis. Documents the market impact of the accident history on the repaired vehicle.',
    whenYouNeedIt: [
      'Third-party DV claims from a claimant whose vehicle was repaired after a loss',
      'First-party DV disputes under coverage that includes DV',
      'Subrogation files where DV is being pursued against an at-fault carrier',
    ],
    howItWorks: [
      'Pre-loss and post-repair valuation against comparable market data',
      'Severity, repair-quality, and resale-impact adjustments documented',
      'Formal DV report ready for negotiation, settlement, or appraisal clause',
    ],
    category: 'valuation',
  },
  {
    slug: 'full-appraisal',
    title: 'Full Appraisal',
    shortTitle: 'Full Appraisal',
    summary: 'A complete independent appraisal package combining ACV, condition inspection, options verification, and comparable-sales documentation.',
    whenYouNeedIt: [
      'High-value or exotic vehicles that need a thorough valuation record',
      'Litigation-bound files requiring a full documentation chain',
      'Any file where a short-form ACV won\'t carry the record',
    ],
    howItWorks: [
      'In-person or photo-based condition verification',
      'Options, trim, and modifications verified against build records',
      'Comparable sales pulled with full adjustment methodology',
    ],
    category: 'valuation',
  },

  // ── Dispute Resolution ───────────────────────────────────────
  {
    slug: 'cost-of-repair-dispute',
    title: 'Cost of Repair Dispute',
    shortTitle: 'Cost of Repair',
    summary: 'Line-by-line review of repair estimates. Documents labor rates, parts choices, included and excluded operations, and supplements in dispute.',
    whenYouNeedIt: [
      'Shop estimates that significantly exceed the carrier\'s estimate',
      'OEM vs. aftermarket parts disputes',
      'Supplement denials or labor-rate disputes',
    ],
    howItWorks: [
      'Side-by-side review of the carrier\'s and shop\'s estimates',
      'Labor rate, part type, and operation-level analysis',
      'Written report with recommended cost of repair',
    ],
    category: 'dispute',
  },
  {
    slug: 'appraisal-clause',
    title: 'Appraisal Clause',
    shortTitle: 'Appraisal Clause',
    summary: 'Third-party vehicle valuation under the policy\'s standard appraisal clause. We serve as the appraiser named by the carrier.',
    whenYouNeedIt: [
      'The insured has invoked the appraisal clause on a disputed value',
      'The carrier wants an independent appraiser rather than relying on the staff adjuster',
      'A neutral umpire needs to be nominated and the carrier wants its appointed appraiser to lead',
    ],
    howItWorks: [
      'We serve as the carrier\'s appointed appraiser',
      'Opposing appraisers nominate a neutral umpire',
      'A written award is binding under the policy',
    ],
    category: 'dispute',
  },
  {
    slug: 'expert-witness',
    title: 'Expert Witness',
    shortTitle: 'Expert Witness',
    summary: 'Expert testimony on vehicle valuation, repair cost, diminished value, and salvage markets. Available for deposition and trial.',
    whenYouNeedIt: [
      'Pre-litigation files where carrier counsel needs valuation expert testimony lined up',
      'Depositions on vehicle value, repair cost, or DV',
      'Trial testimony with full documented methodology',
    ],
    howItWorks: [
      'CV, qualifications, and prior-testimony record provided on request',
      'Written expert report prepared to counsel\'s format',
      'Deposition and trial testimony scheduled with counsel',
    ],
    category: 'dispute',
  },

  // ── Loss Management ──────────────────────────────────────────
  {
    slug: 'desk-reviews',
    title: 'Desk Reviews',
    shortTitle: 'Desk Review',
    summary: 'Fast, remote valuation and estimate review when a full on-site appraisal is not required.',
    whenYouNeedIt: [
      'Low-complexity claims that still need an independent set of eyes',
      'Quick second opinions on vendor valuations',
      'Volume files where in-person inspection is not economical',
    ],
    howItWorks: [
      'File documents reviewed remotely',
      'Short-form report with findings and recommended value or cost',
      'Turnaround typically within 1–2 business days',
    ],
    category: 'loss',
  },
  {
    slug: 'subrogation',
    title: 'Subrogation',
    shortTitle: 'Subrogation',
    summary: 'Valuation and cost-of-repair documentation to support first-party carriers pursuing recovery against at-fault third parties.',
    whenYouNeedIt: [
      'First-party files where the carrier is pursuing subrogation',
      'Disputes with an at-fault carrier over the subro demand',
      'Arbitration files that need a documented valuation package',
    ],
    howItWorks: [
      'Valuation and repair documentation built to subro-arbitration standards',
      'DV documentation when covered under the recoverable damages',
      'Reports prepared to support both negotiation and arbitration filings',
    ],
    category: 'loss',
  },
  {
    slug: 'salvage-bids',
    title: 'Salvage Bids',
    shortTitle: 'Salvage',
    summary: 'Independent salvage value opinions and bid documentation to support total-loss settlement decisions.',
    whenYouNeedIt: [
      'Total-loss files where the salvage bid is being disputed',
      'High-value or exotic vehicles where standard salvage pools underprice the risk',
      'Internal validation of a vendor-provided salvage number',
    ],
    howItWorks: [
      'Independent salvage market research against the loss vehicle',
      'Written opinion on expected salvage recovery',
      'Documentation ready for file and arbitration if required',
    ],
    category: 'loss',
  },

  // ── Vehicle-Related Costs ────────────────────────────────────
  {
    slug: 'loss-of-use',
    title: 'Loss of Use',
    shortTitle: 'LOU',
    summary: 'Independent documentation of loss-of-use exposure, including rental-rate and down-time analysis for the loss vehicle.',
    whenYouNeedIt: [
      'LOU claims where the rate or duration is being disputed',
      'Commercial-vehicle down-time analysis',
      'Third-party LOU demands under coverage that includes loss-of-use',
    ],
    howItWorks: [
      'Rental rate verified against local market for the loss vehicle class',
      'Down-time analysis supported by repair-timeline documentation',
      'Written LOU opinion ready for file',
    ],
    category: 'costs',
  },
  {
    slug: 'towing-storage',
    title: 'Towing & Storage Charges',
    shortTitle: 'Towing/Storage',
    summary: 'Review and documentation of towing and storage charges in dispute. Market-based rate analysis and documented duration opinion.',
    whenYouNeedIt: [
      'Yard storage charges that significantly exceed market rates',
      'Extended duration that may not be reasonable or necessary',
      'Carrier-side analysis before paying or disputing an invoice',
    ],
    howItWorks: [
      'Local market tow / storage rate verification',
      'Duration analysis against the file\'s claim-handling timeline',
      'Written opinion on reasonable and necessary charges',
    ],
    category: 'costs',
  },
]
