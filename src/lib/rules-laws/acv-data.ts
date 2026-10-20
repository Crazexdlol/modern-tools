// State-by-state ACV reference. Two orthogonal questions:
//
//   1. LICENSING — Can an independent appraiser handle Right-to-Appraisal
//      (ACV disputes under a policy's appraisal clause) without a state-
//      issued license? If a license is required, which one, and under
//      which exemption (if any)?
//
//   2. METHODOLOGY — What rules govern the ACV calculation in the
//      report? Are comparable vehicles allowed, are book values allowed
//      or required, what's the distance/mileage cap on comparables, and
//      what time window do listings have to fall inside?
//
// Every answer must trace back to a Source — a statute citation, a
// regulation citation, a state DOI bulletin, or a published case. If no
// explicit source exists, the field is NULL or 'unclear' and the Source[]
// explains that honestly instead of fabricating a rule.
//
// This is reference material for the appraiser's work; it is NOT legal
// advice. Verify before relying on any entry in an active case.

export type Trilean = 'yes' | 'no' | 'unclear'
export type BookTrilean = 'yes' | 'no' | 'required' | 'unclear'

export type SourceType =
  | 'statute'       // state insurance code / revised statutes
  | 'regulation'    // administrative code / rules
  | 'bulletin'      // DOI bulletin, advisory, or notice
  | 'case_law'      // reported appellate decision
  | 'doi_guidance'  // DOI website / FAQ page
  | 'other'         // treatise, NAIC model, bar journal

export interface Source {
  type: SourceType
  // Human-readable citation shown in the UI, e.g. "Ga. Comp. R. & Regs.
  // 120-2-52-.06" or "Alaska DOI Bulletin B 23-12 (Dec 7, 2023)".
  citation: string
  // Title of the source as it appears when a user clicks through.
  title: string
  url: string
  // Optional short quote (<=300 chars) illustrating the point. Omit when
  // the whole source is relevant.
  excerpt?: string
  // ISO date (YYYY-MM-DD) the source was last fetched or verified.
  accessedAt: string
}

export interface LicensingBlock {
  // Does an appraiser serving under the policy's appraisal clause need a
  // state-issued license? 'yes' means a license is required even for the
  // one-off role. 'no' means an explicit exemption exists for appraisal-
  // clause work. 'unclear' means we found no explicit regulation and are
  // not willing to speculate.
  requiresLicense: Trilean
  // The specific license required, when requiresLicense === 'yes'.
  // e.g. "Independent Adjuster License" or "Public Adjuster License".
  licenseType: string | null
  // The licensing authority / agency. e.g. "Alabama Department of Insurance".
  licensingAuthority: string | null
  // Narrative notes. e.g. an exemption's exact scope, reciprocity, or
  // historical practice. May span several sentences.
  notes: string | null
  // At least one source. If the field is 'unclear', the sources explain
  // what we looked at and what we didn't find.
  sources: Source[]
}

export interface MethodologyBlock {
  comparablesAllowed: Trilean
  bookValuesAllowed: BookTrilean
  // Numeric caps stored as human-readable strings — some states express
  // caps as miles, some as radius, some as "the same market area".
  // Null = no explicit cap found; see notes.
  comparableDistanceCap: string | null
  comparableMileageCap: string | null
  // How recent the comparable sale / listing must be. Null = no explicit
  // rule.
  comparableTimeframe: string | null
  // Any other methodology constraints — equipment adjustments, condition
  // adjustments, sales-tax treatment, title-fee treatment, etc.
  notes: string | null
  sources: Source[]
}

export interface ACVStateEntry {
  state: string
  stateCode: string
  licensing: LicensingBlock
  methodology: MethodologyBlock
  // ISO date the whole entry was last reviewed end-to-end.
  lastReviewed: string
  // Transparency notes about the research itself. e.g. "No DOI
  // regulation on comparable distance; practice derived from the general
  // 'fair and reasonable' standard in NRS 686A.310."
  researchNotes?: string
}

export const acvData: ACVStateEntry[] = [
  // ── ALABAMA ────────────────────────────────────────────────────────────────
  {
    state: 'Alabama',
    stateCode: 'AL',
    licensing: {
      // Alabama does NOT license public adjusters at all. Independent
      // adjusters are licensed, but the statute scopes "adjuster" to
      // someone acting on behalf of an insurer. An appraiser serving an
      // insured (or as a neutral umpire) under the policy's appraisal
      // clause falls outside that definition in Alabama's regime.
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'Alabama Department of Insurance',
      notes:
        'Alabama is one of a small number of states that does not license public adjusters at all. The Independent Adjuster license applies to those "acting on behalf of an insurer." Appraisers serving under the policy\'s appraisal clause are not acting on behalf of the insurer, and widely-cited industry guidance treats appraisal clause work as not requiring an Alabama adjuster license. There is no explicit statutory exemption; the conclusion comes from the scope of the licensure statute and widespread practice.',
      sources: [
        {
          type: 'doi_guidance',
          citation: 'ALDOI — Adjuster Requirements',
          title: 'Alabama Department of Insurance: Adjuster Licensing Requirements',
          url: 'https://aldoi.gov/licensing/adjusterreq.aspx',
          excerpt:
            'An independent adjuster is defined as someone who undertakes on behalf of an insurer to ascertain and determine the amount of any claim or settle claims under property, casualty, or workers\' compensation insurance.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'other',
          citation: 'Industry commentary — Alabama has no public adjuster license',
          title: 'Alabama Public Adjuster FAQs — Noble Public Adjusting Group',
          url: 'https://www.noblepagroup.com/state-specific-faqs/alabama-public-adjuster-faqs/',
          excerpt:
            'Alabama doesn\'t license public adjusters, unlike about 45 other states. However, every insurance policy sold in Alabama includes an Appraisal clause … individuals can still provide insurance claim assistance through the appraisal process without needing a license.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'unclear',
      comparableDistanceCap: 'Reasonable distance of insured\'s residence (no specific mile limit)',
      comparableMileageCap: 'Must be "similar mileage" to insured vehicle (no numeric cap)',
      comparableTimeframe: 'No explicit timeframe in the regulation',
      notes:
        'Ala. Admin. Code r. 482-1-125-.08 permits two methods: (a) offer a replacement vehicle "by the same manufacturer, same or newer year, similar body style, similar options and mileage" available "within a reasonable distance of the insured\'s residence"; or (b) cash settlement based on the cost to purchase a comparable automobile including all applicable taxes, license fees, and transfer fees. The rule allows reference to "Alabama Department of Revenue Regulations regarding total loss" for pricing but does not explicitly list NADA / KBB / other books. Any deviation from (a) or (b) must be documented, measurable, itemized, and specified as to dollar amount. Betterment deductions must likewise be itemized and documented.',
      sources: [
        {
          type: 'regulation',
          citation: 'Ala. Admin. Code r. 482-1-125-.08',
          title: 'Alabama Administrative Code — Settlement of Automobile Total Losses',
          url: 'https://www.law.cornell.edu/regulations/alabama/Ala-Admin-Code-r-482-1-125-.08',
          excerpt:
            'The insurer may elect to offer a replacement automobile that is at least comparable in that it will be by the same manufacturer, same or newer year, similar body style, similar options and mileage … available for inspection within a reasonable distance of the insured\'s residence.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'regulation',
          citation: 'Ala. Admin. Code r. 482-1-125 (chapter)',
          title: 'Alabama DOI Regulation 482-1-125 — Unfair Claims Settlement Practices',
          url: 'https://aldoi.gov/pdf/legal/125r-2014.pdf',
          excerpt:
            'Standards for prompt, fair and equitable settlements applicable to automobile insurance.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Licensing conclusion ("no license required") rests on statutory scope + near-universal industry practice, not an explicit DOI exemption bulletin. If a specific carrier challenges this, confirm directly with ALDOI before proceeding.',
  },

  // ── ALASKA ─────────────────────────────────────────────────────────────────
  {
    state: 'Alaska',
    stateCode: 'AK',
    licensing: {
      // AS § 21.96.035 (mandatory appraisal) only requires the appraiser
      // be "competent" — no license requirement. Alaska's general adjuster
      // licensing statutes apply to those acting on behalf of insurers.
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'Alaska Division of Insurance',
      notes:
        'Alaska\'s mandatory appraisal statute (AS § 21.96.035) requires each party to select a "competent" appraiser; it imposes no license requirement on the appraiser. Alaska\'s separate adjuster-licensing regime scopes "adjuster" to those acting on behalf of an insurer, which does not reach appraisers serving an insured or as a neutral umpire under the appraisal clause.',
      sources: [
        {
          type: 'statute',
          citation: 'Alaska Stat. § 21.96.035',
          title: 'AS § 21.96.035 — Mandatory appraisal',
          url: 'https://codes.findlaw.com/ak/title-21-insurance/ak-st-sect-21-96-035/',
          excerpt:
            'Within 10 days of the written demand, the insured and insurer must notify the other of the competent appraiser each has selected, and the two appraisers will promptly choose a competent and impartial umpire.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: 'Local market area, expandable in 25-mile increments until two comparables are found',
      comparableMileageCap: 'Not specified in miles — comparables must be "comparable" overall',
      comparableTimeframe: 'Available in the last 90 days; expandable in 30-day increments if fewer than two comparables found',
      notes:
        '3 AAC 26.080 permits three valuation methods for a motor-vehicle total loss: (1) the cost of a comparable motor vehicle in the local market area, (2) the average retail value of a comparable motor vehicle from "two industry sources published on a regular basis" (NADA, KBB, Edmunds, etc. in practice), or (3) a computerized database valuation that produces "statistically valid fair market values." When fewer than two comparables are found in the local market, the search area expands in 25-mile increments; for database valuations the time window can be expanded in 30-day increments. Settlement must include all applicable taxes, license fees, destination/delivery charges, and other transfer fees.',
      sources: [
        {
          type: 'regulation',
          citation: '3 AAC 26.080',
          title: 'Alaska Admin. Code 3 AAC 26.080 — Additional standards for prompt, fair, and equitable settlements of motor vehicle claims',
          url: 'https://www.law.cornell.edu/regulations/alaska/3-AAC-26.080',
          excerpt:
            'The search area may be expanded to areas surrounding the local market area in 25-mile increments until two quotes are obtained … the search period may be expanded in 30-day increments.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
  },

  // ── ARKANSAS ───────────────────────────────────────────────────────────────
  {
    state: 'Arkansas',
    stateCode: 'AR',
    licensing: {
      // Arkansas does not license public adjusters. Independent adjuster
      // licensing under AR Code § 23-64-209 is scoped to those acting on
      // behalf of an insurer. The only express exemption text covers
      // out-of-state adjusters sent in on behalf of an insurer for a
      // catastrophe. Industry practice treats appraisal-clause appraisers
      // (serving the insured or as neutral) as outside the licensure
      // regime.
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'Arkansas Insurance Department',
      notes:
        'Arkansas is one of a small number of states that does not license public adjusters. Public adjuster activities offered by professionals in other states are generally not available in Arkansas, and may even be treated as the unauthorized practice of law. Appraiser work under the policy\'s appraisal clause remains available; the Arkansas adjuster statute addresses persons acting on behalf of insurers, which does not reach appraisal-clause appraisers.',
      sources: [
        {
          type: 'statute',
          citation: 'Ark. Code § 23-64-209',
          title: 'Arkansas Code § 23-64-209 — Qualifications for adjuster\'s license',
          url: 'https://law.justia.com/codes/arkansas/title-23/subtitle-3/chapter-64/subchapter-2/section-23-64-209/',
          excerpt:
            'An adjuster who is sent into this state on behalf of an insurer for the purpose of investigating or making adjustment of a loss resulting from a catastrophe … is not required to be qualified or licensed under this section.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'other',
          citation: 'Industry guidance — Arkansas does not license public adjusters',
          title: 'Arkansas Public Adjuster FAQs — Noble Public Adjusting Group',
          url: 'https://www.noblepagroup.com/state-specific-faqs/arkansas-public-adjuster-faqs/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'unclear',
      comparableDistanceCap: '"Local market area" (no numeric mile radius specified in the rule)',
      comparableMileageCap: 'Not specified',
      comparableTimeframe: 'Not specified',
      notes:
        'Arkansas Rule 43 (Unfair Claims Settlement Practices) permits two methods for total loss cash settlement: (a) the cost of a comparable automobile in the local market area, or (b) when no comparable automobile is available in the local market area, the average of two or more quotations from two or more qualified dealers or appraisal services located within the local market area. All applicable taxes, license fees, and other transfer fees must be included at no cost to the insured beyond the policy deductible. Ark. Code § 23-89-211 reinforces that total loss settlements must include sales tax with an itemized statement of the amount attributable to the vehicle value vs. sales tax.',
      sources: [
        {
          type: 'regulation',
          citation: '054-00-15 Ark. Code R. § 005 (Rule 43)',
          title: 'Arkansas Rule 43 — Unfair Claims Settlement Practices',
          url: 'https://www.law.cornell.edu/regulations/arkansas/054-00-15-Ark-Code-R-SS-005',
          excerpt:
            'The cost of a comparable automobile in the local market area when a comparable automobile is available in the local market area … or use of one of two or more quotations obtained by the insurer from two or more qualified dealers or appraisal services located within the local market area when a comparable automobile is not available.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'statute',
          citation: 'Ark. Code § 23-89-211',
          title: 'Arkansas Code § 23-89-211 — Total loss settlements',
          url: 'https://law.justia.com/codes/arkansas/title-23/subtitle-3/chapter-89/subchapter-2/section-23-89-211/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      '"Local market area" is undefined in the rule — leaves room for carrier interpretation. The rule also does not list book-value sources explicitly; dealer / appraisal-service quotations are the enumerated fallback when no comparable exists.',
  },

  // ── CALIFORNIA ─────────────────────────────────────────────────────────────
  {
    state: 'California',
    stateCode: 'CA',
    licensing: {
      // California does not have a dedicated auto-damage appraiser
      // license. Public / independent adjuster licensing exists but is
      // scoped to persons who hold themselves out as such for compensation.
      // Insurance Code § 2071 requires each appraiser be "competent and
      // disinterested" with no licensure requirement for the appraisal-
      // clause role itself.
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'California Department of Insurance (CDI)',
      notes:
        'California does not license auto damage appraisers specifically. The statutory appraisal clause (Insurance Code § 2071, applicable to the standard fire policy, and the equivalent in auto policies) requires each party to select "a competent and disinterested appraiser" with no license requirement. The CDI\'s public adjuster license (§ 15006 et seq.) and independent adjuster license apply to persons acting as adjusters in the course of the business; a one-off appointment as the insured\'s appraiser under the policy\'s appraisal clause is generally outside that framework.',
      sources: [
        {
          type: 'statute',
          citation: 'Cal. Ins. Code § 2071',
          title: 'California Standard Fire Policy — Appraisal Clause',
          url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=INS&sectionNum=2071.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'doi_guidance',
          citation: 'CDI — Independent Adjuster Licensing',
          title: 'California Department of Insurance — Adjuster Licensing',
          url: 'https://www.insurance.ca.gov/0200-industry/0050-renew-license/0100-indep-insur-adj-license/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'no',
      comparableDistanceCap: '"Local market area" (not quantified in the valuation subsection); inspection travel capped elsewhere at 15 miles in cities ≥100k population, 25 miles otherwise',
      comparableMileageCap: 'Not specified in miles — comparable must have "similar" options and mileage',
      comparableTimeframe: '90 days — the comparable must have been available for retail purchase within 90 calendar days of the final settlement offer',
      notes:
        '10 CCR § 2695.8(b) prescribes four methods, in preferred order: (1) average of two or more comparable automobiles available (or available in the last 90 days) in the local market area; (2) if no comparable is available, the average of two or more quotations from licensed dealers; (3) a computerized valuation service that produces statistically valid fair market values; or (4) if none of the above is possible, a documented and fully explained alternative. Settlement must include all applicable taxes and one-time transfer fees, plus the pro-rata portion of the loss vehicle\'s current registration. When the claimant retains the salvage, sales tax is paid on the comparable net of sales tax attributable to the salvage. Note: traditional "book values" (NADA / KBB) are not one of the four enumerated methods, though computerized valuation services (method 3) are permitted.',
      sources: [
        {
          type: 'regulation',
          citation: '10 CCR § 2695.8(b)',
          title: 'California Code of Regulations Title 10 § 2695.8 — Additional Standards Applicable to Automobile Insurance',
          url: 'https://www.law.cornell.edu/regulations/california/10-CCR-2695.8',
          excerpt:
            'A comparable automobile must have been available for retail purchase by the general public in the local market area within ninety (90) calendar days of the final settlement offer.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
  },

  // ── COLORADO ───────────────────────────────────────────────────────────────
  {
    state: 'Colorado',
    stateCode: 'CO',
    licensing: {
      // Colorado is one of about 16 states that does not license insurance
      // adjusters at all. There is also no auto-damage appraiser license.
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'Colorado Division of Insurance',
      notes:
        'Colorado does not license insurance adjusters — one of about 16 non-licensing states. Residents who want a "home state" designation typically obtain a Florida DHS (designated home state) non-resident license. Colorado also does not license auto damage appraisers. Appraisers acting under a policy\'s appraisal clause need no Colorado-issued license to serve.',
      sources: [
        {
          type: 'doi_guidance',
          citation: 'Colorado Division of Insurance — producer / adjuster licensing',
          title: 'Colorado Division of Insurance',
          url: 'https://doi.colorado.gov/',
          accessedAt: '2026-10-12',
        },
        {
          type: 'other',
          citation: 'AdjusterPro — Colorado is a non-licensing state',
          title: 'Colorado Insurance Claims Adjuster License',
          url: 'https://adjusterpro.com/colorado-insurance-claims-adjuster-license/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: 'No specific cap in statute or regulation',
      comparableMileageCap: 'No specific cap in statute or regulation',
      comparableTimeframe: 'No specific window in statute or regulation',
      notes:
        'CRS § 10-4-639 requires every insurer to "establish a fair and consistent method for determining total loss of a motor vehicle, including consideration of the vehicle\'s unique characteristics and use of a credible source of valuation" and to make its written methodology available to the Commissioner on request. The statute leaves specific methodology (comparable sourcing, distance, mileage caps, time windows) to the insurer\'s own written procedures — Colorado has no DOI regulation codifying numeric caps. In practice carriers use CCC/Mitchell/Audatex valuation services, NADA, KBB, and local market comparables; none is prohibited.',
      sources: [
        {
          type: 'statute',
          citation: 'C.R.S. § 10-4-639',
          title: 'Colorado Revised Statutes § 10-4-639 — Motor vehicle total loss settlements',
          url: 'https://codes.findlaw.com/co/title-10-insurance/co-rev-st-sect-10-4-639/',
          accessedAt: '2026-10-12',
        },
        {
          type: 'statute',
          citation: 'C.R.S. § 10-3-1104(1)(h)',
          title: 'Colorado Unfair Claim Settlement Practices Act',
          url: 'https://codes.findlaw.com/co/title-10-insurance/co-rev-st-sect-10-3-1104/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Colorado is intentionally light-touch: no license, no numeric methodology caps. The practical constraint is the insurer\'s written methodology (§ 10-4-639) plus general unfair-claim-settlement obligations. Any methodology an appraiser uses needs to be defensible against the "credible source of valuation" standard.',
  },

  // ── CONNECTICUT ────────────────────────────────────────────────────────────
  {
    state: 'Connecticut',
    stateCode: 'CT',
    licensing: {
      // CT § 38a-790 requires a Motor Vehicle Physical Damage Appraiser
      // license for anyone who "practices as a business" the appraisal of
      // damage to insured motor vehicles. The scope reaches third-party
      // claimant appraisals too. A professional appraiser doing appraisal-
      // clause work routinely in CT needs this license.
      requiresLicense: 'yes',
      licenseType: 'Motor Vehicle Physical Damage Appraiser License',
      licensingAuthority: 'Connecticut Insurance Department (CID)',
      notes:
        'Connecticut § 38a-790 defines a "motor vehicle physical damage appraiser" as "any person, partnership, association, limited liability company or corporation that practices as a business the appraising of damages to motor vehicles insured under automobile physical damage policies or on behalf of third party claimants." No person may act as such an appraiser on behalf of any insurer or firm engaged in motor vehicle claim appraisal/adjustment without first securing a CID license. Non-residents who hold an equivalent license from another state may have the exam requirement waived by the Commissioner. The statute\'s "practices as a business" language is broad enough to reach appraisers who routinely handle appraisal-clause work; a strictly one-off, non-commercial appointment arguably falls outside, but the conservative read is to be licensed if working in CT.',
      sources: [
        {
          type: 'statute',
          citation: 'Conn. Gen. Stat. § 38a-790',
          title: 'Connecticut General Statutes § 38a-790 — Licensing of motor vehicle physical damage appraisers',
          url: 'https://law.justia.com/codes/connecticut/title-38a/chapter-702/section-38a-790-formerly-sec-38-92b/',
          excerpt:
            'No person shall act as an appraiser for motor vehicle physical damage claims on behalf of any insurance company or firm or corporation engaged in the adjustment or appraisal of motor vehicle claims unless such person has first secured a license from the Insurance Commissioner.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'doi_guidance',
          citation: 'CID — MVPD Appraiser Licensing',
          title: 'Connecticut Insurance Department — Motor Vehicle Physical Damage Appraiser License',
          url: 'https://portal.ct.gov/cid/licensing/license-types/mvpd-appraiser',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'required',
      comparableDistanceCap: 'Local market conditions (approved sources explicitly include "Autotrak for Connecticut local market conditions")',
      comparableMileageCap: 'Not specified in statute',
      comparableTimeframe: 'Not specified in statute',
      notes:
        'Conn. Gen. Stat. § 38a-353 mandates that when a motor vehicle is a constructive total loss, the insurer "shall … use at least the average of the retail values given such vehicle by (1) the National Automobile Dealers Association used car guide … and (2) one other automobile industry source that has been approved for such use by [the Insurance Commissioner]." The approved secondary sources include the National Market Reports Red Book and the ADP Autotrak Valuation Service calibrated to Connecticut local market conditions. Comparable automobiles may be offered as an alternative settlement option but the statutory floor is the two-source retail-value average. The insurer must provide the insured a detailed copy of the calculation and notice of the right to dispute it through the CID Consumer Affairs Division.',
      sources: [
        {
          type: 'statute',
          citation: 'Conn. Gen. Stat. § 38a-353',
          title: 'Connecticut General Statutes § 38a-353 — Motor vehicle total loss',
          url: 'https://codes.findlaw.com/ct/title-38a-insurance/ct-gen-st-sect-38a-353/',
          excerpt:
            'Use at least the average of the retail values given such vehicle by (1) the National Automobile Dealers Association used car guide … and (2) one other automobile industry source that has been approved for such use by said commissioner.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'bulletin',
          citation: 'CID — Approved Secondary Valuation Sources',
          title: 'Connecticut Insurance Department — Bulletin CL-3 / Red Book + Autotrak approvals',
          url: 'https://portal.ct.gov/cid/department-resources/bulletins/claims-bulletins/bulletin-cl-3',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Connecticut is a book-value jurisdiction, which is unusual — most states default to comparables. If an appraiser uses only comparables and ignores NADA + an approved second source, the carrier can cite non-compliance with § 38a-353.',
  },

  // ── DELAWARE ───────────────────────────────────────────────────────────────
  {
    state: 'Delaware',
    stateCode: 'DE',
    licensing: {
      // DE Code tit. 18 § 1707 creates a Property Damage Appraiser's
      // License separate from the adjuster license. The appraiser license
      // specifically authorizes "the appraisal of damage to motor vehicles."
      requiresLicense: 'yes',
      licenseType: 'Property Damage Appraiser License (motor vehicle appraisal authority)',
      licensingAuthority: 'Delaware Department of Insurance',
      notes:
        'Delaware distinguishes the adjuster license (§ 1707(d), scoped to investigating / negotiating settlement on behalf of insurers) from the Property Damage Appraiser license (§ 1707(c), which "shall convey authority for the appraisal of damage to motor vehicles"). An adjuster who negotiates settlement using someone else\'s appraisal falls under the adjuster license; an individual who personally assesses the vehicle\'s damage is performing a licensed appraiser act. There is no express statutory exemption for appraisal-clause appraisers, so a professional appraiser doing appraisal-clause work in Delaware should hold the Property Damage Appraiser license.',
      sources: [
        {
          type: 'statute',
          citation: 'Del. Code tit. 18 § 1707',
          title: 'Delaware Code Title 18 § 1707 — License',
          url: 'https://codes.findlaw.com/de/title-18-insurance-code/de-code-sect-18-1707/',
          excerpt:
            'A property damage appraiser\'s license shall convey authority for the appraisal of damage to motor vehicles as defined in § 101 of Title 21.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'doi_guidance',
          citation: 'DE DOI — Adjuster + Appraiser license information',
          title: 'Delaware Department of Insurance — Licensing',
          url: 'https://insurance.delaware.gov/divisions/producers/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: 'No specific cap in regulation',
      comparableMileageCap: 'No specific cap in regulation',
      comparableTimeframe: 'No specific window in regulation',
      notes:
        'Delaware does not have a numeric ACV methodology regulation like Arizona\'s R20-6-801 or California\'s § 2695.8(b). The applicable framework is 18 DE Admin Code 902 (Prohibited Unfair Claim Settlement Practices), which imposes good-faith / prompt-settlement duties and timing requirements (acknowledge within 15 working days, investigate within 10, affirm or deny within 30 after proof of loss) but does not prescribe comparable distance, mileage, or time-window caps. In practice carriers use CCC/Mitchell/Audatex, NADA, KBB, and local market comparables; the appraiser\'s methodology must be defensible under the general unfair-claims-practice standard and the appraiser license\'s own competency requirements.',
      sources: [
        {
          type: 'regulation',
          citation: '18 Del. Admin. Code 902',
          title: 'Delaware Insurance Regulation 902 — Prohibited Unfair Claim Settlement Practices',
          url: 'https://regulations.delaware.gov/AdminCode/title18/902',
          accessedAt: '2026-10-12',
        },
        {
          type: 'statute',
          citation: 'Del. Code tit. 21 § 2118',
          title: 'Delaware Code Title 21 § 2118 — Required insurance coverage; limits; loss of use',
          url: 'https://codes.findlaw.com/de/title-21-motor-vehicles/de-code-sect-21-2118.html',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Delaware is a license-required state for appraisal (unlike most of its neighbors), but a thin-regulation state for methodology. The appraiser license carries its own competency expectations under Reg 601 which practically governs how an appraisal should be conducted.',
  },

  // ── DISTRICT OF COLUMBIA ───────────────────────────────────────────────────
  {
    state: 'District of Columbia',
    stateCode: 'DC',
    licensing: {
      // DC licenses PUBLIC adjusters only (§ 31-1631.03). Independent /
      // company adjusters and auto appraisers are not separately licensed.
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'DC Department of Insurance, Securities and Banking (DISB)',
      notes:
        'DC licenses public insurance adjusters under D.C. Code § 31-1631.03, but does not license independent / company adjusters or auto damage appraisers. Appraisers acting under a policy\'s appraisal clause need no DC-issued license. Residents who want to adjust claims out-of-state typically obtain a Florida DHS designation.',
      sources: [
        {
          type: 'statute',
          citation: 'D.C. Code § 31-1631.03',
          title: 'DC Code § 31-1631.03 — Public Insurance Adjuster License requirement',
          url: 'https://code.dccouncil.gov/us/dc/council/code/sections/31-1631.03',
          excerpt:
            'No person shall, directly or indirectly, act as a public insurance adjuster without first procuring a license from the Commissioner.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'doi_guidance',
          citation: 'DISB — Public Insurance Adjusters',
          title: 'DC Department of Insurance, Securities and Banking — Public Insurance Adjusters',
          url: 'https://disb.dc.gov/page/public-insurance-adjusters',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: 'No specific cap in DC regulations',
      comparableMileageCap: 'No specific cap in DC regulations',
      comparableTimeframe: 'No specific window in DC regulations',
      notes:
        'DC does not have a dedicated numeric ACV methodology regulation. The applicable framework is DC\'s general Unfair Claim Settlement Practices rules and the 75% Total Loss Formula (TLF) threshold for declaring total loss. In practice carriers rely on CCC/Mitchell/Audatex valuation services, NADA, KBB, and local market comparables; appraisers can push back by presenting local-market comparables and invoking the policy\'s appraisal clause.',
      sources: [
        {
          type: 'doi_guidance',
          citation: 'DC DISB — Auto Insurance Claims Guidance',
          title: 'DC Department of Insurance, Securities and Banking',
          url: 'https://disb.dc.gov/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'DC has no numeric ACV methodology caps — regulation is light. Pricing is left to the carrier\'s own methodology subject to the general unfair-claim-settlement standard.',
  },

  // ── FLORIDA ────────────────────────────────────────────────────────────────
  {
    state: 'Florida',
    stateCode: 'FL',
    licensing: {
      // FL does not license auto damage appraisers specifically. However
      // Florida DFS has formally taken the position that an appraiser's
      // work falls within the statutory definition of "public adjuster"
      // and that appraisers are therefore subject to Florida Insurance
      // Code requirements. The conservative read is: get the public
      // adjuster license if you'll be doing appraisal-clause work for
      // Florida auto claims commercially. There has been active
      // regulatory debate (2023 Citizens filing) on explicitly requiring
      // adjuster licensure for appraisers.
      requiresLicense: 'yes',
      licenseType: 'Public Adjuster License (per DFS position on appraisers)',
      licensingAuthority: 'Florida Department of Financial Services (DFS) — Division of Agent and Agency Services',
      notes:
        'Florida does not have a dedicated auto appraiser license. Florida DFS has stated that "because the work of an appraiser falls within the statutory definition of \'public adjuster,\' an appraiser is subject to the requirements of the Florida Insurance Code." Insurers (notably Citizens in 2023) have pushed for even clearer licensure requirements. Appraisers who do this as a business in Florida should hold the Public Adjuster license. One-off / infrequent appointments arguably fall outside, but the formal DFS position does not create a bright-line exemption.',
      sources: [
        {
          type: 'doi_guidance',
          citation: 'FL DFS position — appraisers within public adjuster scope',
          title: 'Florida Department of Financial Services — Public Adjuster definition applied to appraisers',
          url: 'https://www.myfloridacfo.com/division/agents/licensure/general/public-adjuster',
          accessedAt: '2026-10-12',
        },
        {
          type: 'other',
          citation: 'Insurance Journal, March 2023',
          title: 'In Filing With Regulators, Florida Citizens Wants Appraisers to Be Licensed Adjusters',
          url: 'https://www.insurancejournal.com/news/southeast/2023/03/28/713977.htm',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: '"Local market area" + "reasonable distance of insured\'s residence" (no specific mile cap)',
      comparableMileageCap: 'Must be "similar mileage" — no specific numeric cap',
      comparableTimeframe: '90 days (for local-market comparables)',
      notes:
        'Fla. Stat. § 626.9743 permits three methods for cash settlement: (1) two or more comparable vehicles available in the local market area within the preceding 90 days; (2) retail cost determined from a generally recognized used motor vehicle industry source (electronic database or guidebook); or (3) two or more quotations from licensed dealers in the local market area. Comparables must be in as good or better overall condition and available for inspection within a reasonable distance of the insured\'s residence. The statute allows sales tax payment to be deferred until the obligation is actually incurred (unusual among states, which typically require immediate inclusion). Deductions from value must be itemized and documented when the settlement deviates from standard methods.',
      sources: [
        {
          type: 'statute',
          citation: 'Fla. Stat. § 626.9743',
          title: 'Florida Statutes § 626.9743 — Claim settlement practices; motor vehicle insurance',
          url: 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699%2F0626%2FSections%2F0626.9743.html',
          excerpt:
            'The cost of two or more such comparable motor vehicles available within the preceding 90 days … or the retail cost as determined from a generally recognized used motor vehicle industry source.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
  },

  // ── GEORGIA ────────────────────────────────────────────────────────────────
  {
    state: 'Georgia',
    stateCode: 'GA',
    licensing: {
      // GA requires adjuster licensing under § 33-23-43 but does not
      // impose a separate licensing requirement on a policyholder's
      // appraiser invoked under the policy's appraisal clause.
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'Georgia Office of Commissioner of Insurance (OCI)',
      notes:
        'Georgia does not have a dedicated auto appraiser license. Georgia requires an adjuster license under O.C.G.A. § 33-23-43, but does not impose a separate licensing requirement on an appraiser the policyholder retains under the policy\'s appraisal clause. Standard pre-licensing + exam waived for CPCU / UCC holders under Rule 120-2-3-.09(1)(k).',
      sources: [
        {
          type: 'statute',
          citation: 'O.C.G.A. § 33-23-43',
          title: 'Georgia Code § 33-23-43 — Authority of adjusters; penalty for violation',
          url: 'https://law.justia.com/codes/georgia/title-33/chapter-23/article-1/section-33-23-43/',
          accessedAt: '2026-10-12',
        },
        {
          type: 'regulation',
          citation: 'Ga. Comp. R. & Regs. 120-2-3',
          title: 'Georgia Rules & Regulations Subject 120-2-3 — Agents, Adjusters, etc.',
          url: 'https://rules.sos.ga.gov/gac/120-2-3',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: '50 miles from the county seat where the insured vehicle was principally garaged; 100 miles when no local comparable exists (the "Georgia 50-mile rule")',
      comparableMileageCap: 'Not specified — comparable must have "similar mileage"',
      comparableTimeframe: '30 days — comparables must be "available or were available within the last thirty (30) days to consumers in the local market area"',
      notes:
        'Ga. Comp. R. & Regs. R. 120-2-52-.06 is one of the most explicit ACV methodology regulations in the country. Insurer must use at least two comparables in the local market area (50 miles from the county seat where the vehicle was principally garaged), or at least two comparables within 100 miles if local comparables are not available, or two or more dealer quotations, or a statistically valid fair market valuation source meeting specified criteria. Comparable vehicles must be of the same manufacturer, same model year, similar body style, similar options, and similar mileage, in as good or better condition. Taxes, license fees, and transfer fees shall be limited to the amount that would have been paid on the totaled vehicle at the time of settlement.',
      sources: [
        {
          type: 'regulation',
          citation: 'Ga. Comp. R. & Regs. R. 120-2-52-.06',
          title: 'Georgia Rule 120-2-52-.06 — Total Loss Vehicle Claims',
          url: 'https://www.law.cornell.edu/regulations/georgia/Ga-Comp-R-Regs-R-120-2-52-.06',
          excerpt:
            'The cost of two or more comparable automobiles in the local market area — fifty (50) miles from the county seat where the insured vehicle was principally garaged — available or were available within the last thirty (30) days to consumers in the local market area.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Georgia\'s 50-mile rule is the clearest numeric cap of any state researched so far. If a carrier\'s comparables come from outside the 50-mile (or 100-mile fallback) radius without justification, that is a textbook methodology violation.',
  },

  // ── HAWAII ─────────────────────────────────────────────────────────────────
  {
    state: 'Hawaii',
    stateCode: 'HI',
    licensing: {
      requiresLicense: 'unclear',
      licenseType: 'General Adjuster License (if deemed to be acting as adjuster)',
      licensingAuthority: 'Hawaii Department of Commerce and Consumer Affairs — Insurance Division',
      notes:
        'Hawaii does not have a dedicated auto appraiser license. Hawaii requires a general adjuster license, no reciprocity (resident or non-resident must pass the Hawaii adjuster exam). Hawaii has not published a bright-line position on whether appraisal-clause appraisers fall inside or outside the adjuster regime. The conservative read is to hold the Hawaii adjuster license if doing appraisal-clause work in-state as a business; a one-off engagement is a grayer area.',
      sources: [
        {
          type: 'doi_guidance',
          citation: 'Hawaii DCCA — Adjuster Licensing',
          title: 'Hawaii Insurance Division — Adjuster Licensing',
          url: 'https://cca.hawaii.gov/ins/producer_licensing/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: 'No specific mile cap in statute',
      comparableMileageCap: 'Not specified',
      comparableTimeframe: '30-day post-settlement remedy (not a comparable-recency cap, but gives the insured a 30-day window to raise an inability to purchase)',
      notes:
        'Hawaii Revised Statutes § 431:10C-311 requires the cash settlement to be based on "retail value … determined from a source or sources which are reflective of the market value" of the loss vehicle. The statute explicitly prohibits "dealer quotations and newspaper advertisements" being used as sole sources — they must be combined with another market-reflective source. When vehicles aren\'t quoted in the insurer\'s usual source and aren\'t available for replacement, estimates from at least three licensed dealers may be used. All valuation determinations must be documented in the claim file; dealer quotations require VIN. "Get ready to go" and "dealer prep" charges may not be deducted. Critically, § 431:10C-311 includes a 30-day post-settlement protection: if within 30 days the insured can\'t purchase a comparable vehicle at the market value the insurer determined but has located one above that value, the insurer must (i) locate a comparable vehicle, (ii) pay the difference, (iii) pursue appraisal, or (iv) reopen the claim file.',
      sources: [
        {
          type: 'statute',
          citation: 'Haw. Rev. Stat. § 431:10C-311',
          title: 'Hawaii Revised Statutes § 431:10C-311 — Total loss motor vehicle claims: cash settlement',
          url: 'https://codes.findlaw.com/hi/division-2-business/hi-rev-st-sect-431-10c-311/',
          excerpt:
            'Dealer quotations and newspaper advertisements shall not be considered sole sources reflective of market values.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'statute',
          citation: 'Haw. Rev. Stat. § 431:10C-310',
          title: 'Hawaii Revised Statutes § 431:10C-310 — Total loss motor vehicle claims: replacement',
          url: 'https://law.justia.com/codes/hawaii/title-24/chapter-431/section-431-10c-310/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Hawaii\'s 30-day post-settlement remedy is unusual — practically it means the insured can push back after accepting a settlement if the quoted market value turns out to be unachievable in the real market.',
  },

  // ── IDAHO ──────────────────────────────────────────────────────────────────
  {
    state: 'Idaho',
    stateCode: 'ID',
    licensing: {
      // Idaho has an adjuster license but does NOT require a license for
      // the appraiser retained under the policy's appraisal clause.
      // Recent legislation (H0769) codified the mandatory appraisal clause
      // itself. The statute uses "competent and disinterested."
      requiresLicense: 'no',
      licenseType: null,
      licensingAuthority: 'Idaho Department of Insurance',
      notes:
        'Idaho requires every automobile insurer to include a policy appraisal clause when the insured and insurer disagree on ACV. The statute requires only that the appraiser be "competent and disinterested" — no separate licensing requirement. Idaho adjuster licensing (which does exist) explicitly exempts attorneys at law, salaried employees of insurers, licensed agents assisting with claims, and other categories; the appraisal-clause role is treated by industry practice as outside the licensing scope.',
      sources: [
        {
          type: 'doi_guidance',
          citation: 'Idaho DOI — Common Auto Claims Questions',
          title: 'Idaho Department of Insurance — Auto Claims FAQ',
          url: 'https://doi.idaho.gov/consumers/auto-insurance/auto-claims/common-auto-claims-questions/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'yes',
      comparableDistanceCap: 'No specific cap in statute or regulation',
      comparableMileageCap: 'No specific cap',
      comparableTimeframe: 'No specific window',
      notes:
        'Idaho does not have a dedicated numeric ACV methodology regulation. The applicable framework is Idaho Code § 41-1329 (Unfair Claim Settlement Practices Act), which prohibits an insurer from "refusing to pay claims without conducting a reasonable investigation based upon all available information" and from compelling an insured to litigate by offering substantially less than the amount ultimately recovered. Methodology (comparables, book values, dealer quotes, computerized valuation) is left to the insurer\'s discretion subject to the general reasonableness standard and the appraisal-clause process.',
      sources: [
        {
          type: 'statute',
          citation: 'Idaho Code § 41-1329',
          title: 'Idaho Code § 41-1329 — Unfair Claim Settlement Practices',
          url: 'https://legislature.idaho.gov/statutesrules/idstat/Title41/T41CH13/SECT41-1329/',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Idaho is a light-touch regulation state similar to Colorado and DC — no numeric methodology caps. Challenges to a carrier\'s valuation go through the appraisal clause or an unfair-claim-settlement-practices complaint.',
  },

  // ── ARIZONA ────────────────────────────────────────────────────────────────
  {
    state: 'Arizona',
    stateCode: 'AZ',
    licensing: {
      // The statute defines "adjuster" narrowly (acting on behalf of
      // insurer) and the only express exemption in ARS § 20-321.01(D) is
      // for out-of-state adjusters sent by an insurer. No explicit text
      // about appraisal-clause appraisers. Industry sources treat
      // appraisal-clause appraisers as outside the licensing requirement,
      // but it isn't spelled out — hence "unclear" with full narrative.
      requiresLicense: 'unclear',
      licenseType: 'Independent Adjuster License (if deemed to be acting as an adjuster)',
      licensingAuthority: 'Arizona Department of Insurance and Financial Institutions (DIFI)',
      notes:
        'ARS § 20-321.01 requires anyone acting as an "adjuster" to be licensed, with an express exemption only for out-of-state adjusters sent to Arizona for a particular loss or catastrophe. The statute does not address appraisers acting under a policy\'s appraisal clause. Arizona defines "adjuster" as a person who acts on behalf of an insurer; appraisers under the appraisal clause typically act for the insured or as neutrals, which many industry sources treat as outside the licensing requirement. There is no explicit DOI bulletin we found confirming the exemption, so the conservative read is "unclear"; practice treats it as not required. Verify with DIFI if in doubt on a specific engagement.',
      sources: [
        {
          type: 'statute',
          citation: 'ARS § 20-321.01',
          title: 'Arizona Revised Statutes § 20-321.01 — Licensing of adjusters; qualifications; exemption',
          url: 'https://www.azleg.gov/ars/20/00321-01.htm',
          excerpt:
            'An adjuster who is licensed or allowed to act as an adjuster in the state of the adjuster\'s domicile is not required to be licensed pursuant to this section if the adjuster is sent to this state on behalf of an insurer for the purpose of investigating or making adjustment of a particular loss.',
          accessedAt: '2026-10-12',
        },
        {
          type: 'doi_guidance',
          citation: 'DIFI — Adjuster Licensing',
          title: 'Arizona Department of Insurance and Financial Institutions: Adjuster License Application',
          url: 'https://difi.az.gov/producers/adjuster/adjuster-license-application-individual',
          accessedAt: '2026-10-12',
        },
      ],
    },
    methodology: {
      comparablesAllowed: 'yes',
      bookValuesAllowed: 'no',
      comparableDistanceCap: '50 miles from the county seat (local market area); extendable to 100 miles when no local comparable exists',
      comparableMileageCap: 'Not specified in miles — comparables must be "comparable" overall',
      comparableTimeframe: 'Available or available in the last 30 days',
      notes:
        'Ariz. Admin. Code R20-6-801(H) limits the insurer to three codified methods: (a) offer a specific comparable replacement vehicle, (b) cash settlement based on the cost of a comparable in the local market, with dealer quotations permitted only when no local comparable exists, or (c) a fully documented deviation from (a)/(b). "Local market area" is defined as within 50 miles of the county seat where the insured vehicle was principally garaged, with comparables available (or available within the last 30 days). If no local comparable exists, the search can extend to the "proximate market area" (100 miles from the county seat, including the closest major metro). R20-6-801(H)(6) requires every deduction to be itemized, specified as to dollar amount, and appropriate for that amount. Book values are notably not one of the three permitted sources — dealer quotations are allowed only as a fallback when no comparable exists in the local or proximate market.',
      sources: [
        {
          type: 'regulation',
          citation: 'Ariz. Admin. Code R20-6-801',
          title: 'Arizona Administrative Code R20-6-801 — Unfair Claims Settlement Practices',
          url: 'https://www.law.cornell.edu/regulations/arizona/Ariz-Admin-Code-SS-R20-6-801',
          excerpt:
            'Local market area means within 50 miles of the county seat where the insured vehicle was principally garaged … areas proximate to the local market area means within 100 miles of the county seat.',
          accessedAt: '2026-10-12',
        },
      ],
    },
    lastReviewed: '2026-10-12',
    researchNotes:
      'Book-value answer is "no" because R20-6-801(H) codifies three methods and book-value publications (NADA/KBB) are not among them; dealer quotations are a fallback only when no comparable is available. Carriers in practice still consult book values for internal benchmarking, but the regulatory methodology is comparable-based.',
  },
]

// Full list of US jurisdictions so the UI can show which states are
// researched (card rendered) vs. pending (grey placeholder).
export const ALL_STATE_CODES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },        { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },        { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },     { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },    { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },        { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },         { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },       { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },           { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },       { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },          { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },      { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },       { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },       { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },     { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },           { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },         { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },   { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },   { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },          { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },        { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },     { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },      { code: 'WY', name: 'Wyoming' },
]
