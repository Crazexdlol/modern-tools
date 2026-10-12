export interface ServiceContent {
  slug: string
  title: string
  shortTitle: string
  summary: string
  whenYouNeedIt: string[]
  howItWorks: string[]
  typicalRecovery?: string
}

export const SERVICES: ServiceContent[] = [
  {
    slug: 'acv',
    title: 'Actual Cash Value (ACV)',
    shortTitle: 'ACV',
    summary: 'When your car is a total loss and the insurer\'s payout undershoots real market value, we document what the vehicle was actually worth the day before the loss.',
    whenYouNeedIt: [
      'Your car was declared a total loss and you believe the offer is too low',
      'The insurer\'s valuation report uses stale or non-comparable listings',
      'Your vehicle had features / low mileage / recent work that\'s been ignored',
    ],
    howItWorks: [
      'We pull current market comparables matched to your exact spec',
      'Mileage and condition adjustments documented against actual listings',
      'Final report delivered with a defensible market value and the paper trail',
    ],
    typicalRecovery: '$3,000–$6,000 above initial offer',
  },
  {
    slug: 'diminished-value',
    title: 'Diminished Value (DV)',
    shortTitle: 'DV',
    summary: 'After a collision repair, a vehicle with a history is worth less — even when the repair is perfect. We measure that loss and build the claim.',
    whenYouNeedIt: [
      'Your vehicle was in an at-fault-other-party accident and has been repaired',
      'You\'re noticing lower trade-in or private-sale offers because of the accident history',
      'The insurer denied or lowballed a diminished-value claim',
    ],
    howItWorks: [
      'Pre-loss and post-repair valuation on comparable market data',
      'Severity, repair-quality, and resale-impact adjustments documented',
      'Formal DV report ready for insurer negotiation or appraisal clause',
    ],
    typicalRecovery: '$2,000–$5,000 depending on severity',
  },
  {
    slug: 'estimate-dispute',
    title: 'Estimate Dispute',
    shortTitle: 'Estimate Dispute',
    summary: 'When the insurer\'s repair estimate underpays the body shop and leaves you holding the difference, we review the estimate line by line.',
    whenYouNeedIt: [
      'The insurer\'s estimate doesn\'t cover the shop\'s actual labor rates',
      'OEM parts are being swapped for aftermarket without consent',
      'Supplements are being denied',
    ],
    howItWorks: [
      'Line-by-line review of the insurer\'s estimate vs. the shop\'s',
      'OEM / labor-rate / supplement documentation',
      'Written dispute ready for negotiation',
    ],
  },
  {
    slug: 'post-repair-inspection',
    title: 'Post-Repair Inspection',
    shortTitle: 'Post-Repair',
    summary: 'An independent inspection to confirm the shop actually did the work — and did it right.',
    whenYouNeedIt: [
      'You suspect the repair wasn\'t fully performed',
      'You\'re documenting repair quality for a DV claim',
      'You want paper on the record before selling or trading',
    ],
    howItWorks: [
      'In-person inspection with structural, paint, and parts check',
      'Comparison against the insurer-approved estimate',
      'Written report with photos',
    ],
  },
  {
    slug: 'appraisal-clause',
    title: 'Appraisal Clause',
    shortTitle: 'Appraisal Clause',
    summary: 'When you and the insurer can\'t agree on value, your policy\'s appraisal clause is the formal dispute path. We serve as your appraiser.',
    whenYouNeedIt: [
      'Negotiation has stalled on either ACV or DV',
      'You\'ve been told to go to appraisal by the insurer',
      'You want a third party to force the issue',
    ],
    howItWorks: [
      'We serve as your appointed appraiser',
      'Opposing appraisers nominate a neutral umpire',
      'A written award is binding under your policy',
    ],
  },
]
