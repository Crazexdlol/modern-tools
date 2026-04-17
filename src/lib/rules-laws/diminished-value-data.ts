export interface DVMethodology {
  name: string
  description: string
  status: 'accepted' | 'criticized' | 'rejected'
  details: string[]
}

export interface DVCourtCase {
  name: string
  year: number
  court: string
  holding: string
  significance: string
}

export interface DVStateEntry {
  state: string
  stateCode: string
  firstParty: 'yes' | 'no' | 'limited'
  thirdParty: 'yes' | 'no' | 'limited'
  statuteOfLimitations: string
  summary: string
  statute?: string
  keyPoints: string[]
  courtCases?: DVCourtCase[]
  notes?: string
  sourceUrl?: string
  sourceName?: string
  additionalLinks?: { label: string; url: string }[]
}

// ─── Methodologies ───

export const dvMethodologies: DVMethodology[] = [
  {
    name: '17c Formula (State Farm / Mabry)',
    description: 'The most commonly used formula by insurance companies. Originated from the 2001 Georgia class action State Farm v. Mabry. Uses a 10% cap on ACV with damage and mileage modifiers.',
    status: 'criticized',
    details: [
      'Formula: 10% of ACV × Damage Modifier (0.00–1.00) × Mileage Modifier (0.00–1.00) = Diminished Value',
      'Base loss capped at 10% of the vehicle\'s pre-accident retail value — this is the MAXIMUM the formula will ever produce',
      'Damage Modifier: 1.00 (severe structural), 0.75 (major damage to structure/panels), 0.50 (moderate), 0.25 (minor), 0.00 (no structural damage/panel replacement)',
      'Mileage Modifier: 1.00 (0–19,999 mi), 0.80 (20,000–39,999), 0.60 (40,000–59,999), 0.40 (60,000–79,999), 0.20 (80,000–99,999), 0.00 (100,000+)',
      'Created specifically for the Mabry class action to process ~25,000 claims quickly — not designed as a universal standard',
      'The Georgia Insurance Commissioner instructed insurers NOT to use 17c as a legal or determinative calculation',
      'Widely criticized for: arbitrary 10% cap, mileage modifier that zeros out vehicles over 100k miles, damage modifier that oversimplifies structural impact, and geographic data that is unreliable',
      'Most insurance companies still use it (or a variation) because it consistently produces LOW payouts favorable to the insurer',
    ],
  },
  {
    name: 'Market Analysis / Before-and-After Method',
    description: 'Compares the vehicle\'s pre-accident market value to its post-repair market value using actual comparable sales data. Considered the most accurate methodology.',
    status: 'accepted',
    details: [
      'Determines pre-accident fair market value using comparable vehicle sales (clean history)',
      'Determines post-repair fair market value using comparable vehicle sales (accident history)',
      'Diminished value = Pre-accident value minus Post-repair value',
      'Uses real market data from dealer listings, auction results, and private party sales',
      'Accounts for the "stigma" of accident history on vehicle reports (CARFAX, AutoCheck)',
      'Recognized by courts, insurance companies, IRS, and financial institutions when properly performed',
      'Often performed by certified appraisers following USPAP standards',
      'More accurate than formula-based methods because it reflects actual market conditions',
      'North Carolina courts use this "before-and-after" rule as the standard',
    ],
  },
  {
    name: 'USPAP-Compliant Professional Appraisal',
    description: 'A formal appraisal performed by a certified appraiser following the Uniform Standards of Professional Appraisal Practice (USPAP). The gold standard for court-admissible DV claims.',
    status: 'accepted',
    details: [
      'USPAP = Uniform Standards of Professional Appraisal Practice — the nationally recognized standard for ethics, competency, and methodology in appraisal work',
      'Requires appraiser to have formal education, training, and demonstrated competency',
      'Appraisal must be performed "without bias and in a manner that is objective and impartial"',
      'Includes: pre-loss market value analysis, post-repair market comparison, comparable vehicle sales data, damage severity review, structural impact analysis, methodology explanation, and clear valuation conclusion',
      'Non-USPAP appraisals are considered "un-credible, biased, and improper" and are easily discredited in court',
      'If asked in litigation whether your appraisal is USPAP-compliant and it isn\'t, it may not be admitted as evidence',
      'USPAP-compliant appraisals are accepted by insurance companies, IRS, courts, and financial institutions',
      'Insurance adjusters take USPAP-trained appraisers more seriously and are more likely to negotiate',
      'Typical cost: $275–$500 for a professional DV appraisal',
    ],
  },
  {
    name: 'Dealer Certification / Quote Method',
    description: 'Obtains written statements from licensed dealers about how much less they would pay for the vehicle given its accident history.',
    status: 'accepted',
    details: [
      'Contact 2–3 licensed dealers and ask what they would pay for the vehicle WITH and WITHOUT the accident on record',
      'The difference in quotes represents the diminished value',
      'Dealers can provide written statements or formal appraisals',
      'Effective because it reflects real-world buying behavior — dealers pay less for accident-history vehicles',
      'Can be combined with market analysis for stronger claims',
      'Some courts accept dealer testimony as expert evidence on vehicle value',
    ],
  },
  {
    name: 'CCC / Mitchell / Audatex Valuation Tools',
    description: 'Insurance company internal valuation tools used to calculate DV. Often criticized for producing artificially low values.',
    status: 'criticized',
    details: [
      'Used internally by insurance companies for DV calculations',
      'Often based on proprietary formulas that are not transparent to the claimant',
      'May not account for local market conditions or actual comparable sales',
      'Frequently produce values significantly lower than independent appraisals',
      'Claimants should request the full methodology and data behind any insurer DV calculation',
      'Can be effectively challenged with an independent USPAP-compliant appraisal',
    ],
  },
]

// ─── Types of Diminished Value ───

export const dvTypes = [
  {
    name: 'Inherent Diminished Value',
    description: 'The loss in market value that exists simply because the vehicle has an accident on its history — even when repairs are perfect. This is the most common type claimed.',
    details: 'A buyer will pay less for a vehicle with an accident history (shown on CARFAX/AutoCheck) versus an identical vehicle with a clean history. This "stigma" exists regardless of repair quality. Inherent DV is the basis for most diminished value claims.',
  },
  {
    name: 'Repair-Related Diminished Value',
    description: 'Additional loss in value caused by incomplete or improper repairs — visible flaws, paint mismatch, panel gaps, mechanical issues.',
    details: 'This covers cosmetic defects remaining after repair (orange peel paint, color mismatch, uneven gaps) or mechanical/structural deficiencies. This is separate from inherent DV and can be claimed in addition to it.',
  },
  {
    name: 'Insurance-Related Diminished Value',
    description: 'Loss in value caused by the insurer\'s choice to use inferior parts (aftermarket, salvage, or reconditioned) instead of OEM parts.',
    details: 'When an insurer specifies non-OEM crash parts or used/salvage parts, the vehicle may be worth less than if OEM parts were used. This type of DV can be claimed when the policy or state law requires OEM-equivalent parts.',
  },
]

// ─── State Data ───

export const dvStateData: DVStateEntry[] = [
  {
    state: 'Alabama',
    stateCode: 'AL',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '2 years',
    summary: 'Alabama recognizes third-party diminished value claims but does not allow first-party claims against your own insurer.',
    keyPoints: [
      'Third-party DV claims recognized against at-fault driver\'s insurer',
      'First-party DV claims not recognized',
      '2-year statute of limitations from date of accident',
    ],
    courtCases: [
      { name: 'Pritchett v. State Farm Mutual Automobile Insurance Co.', year: 2002, court: 'Alabama Court of Civil Appeals', holding: 'Addressed DV claims in the context of property damage liability', significance: 'Established framework for third-party DV recovery in Alabama' },
    ],
  },
  {
    state: 'Alaska',
    stateCode: 'AK',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '2 years',
    summary: 'Alaska allows third-party diminished value claims. First-party claims are generally not recognized.',
    keyPoints: [
      'Third-party DV claims allowed',
      'First-party claims generally not permitted',
      '2-year statute of limitations',
    ],
    courtCases: [
      { name: 'R & Y, Inc. v. Municipality of Anchorage', year: 2001, court: 'Alaska Supreme Court', holding: 'Used diminution in value methodology for tort property damages', significance: 'Established DV recovery framework in Alaska tort claims' },
    ],
  },
  {
    state: 'Arizona',
    stateCode: 'AZ',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '2 years',
    summary: 'Arizona recognizes third-party DV claims. The state has case law supporting recovery of diminished value from at-fault parties.',
    keyPoints: [
      'Third-party DV claims recognized',
      'First-party claims not permitted under standard policies',
      '2-year statute of limitations',
    ],
    courtCases: [
      { name: 'Farmers Ins. Co. v. R.B.L. Investment, Inc.', year: 1983, court: 'Arizona Court of Appeals', holding: 'Allowed recovery for diminution in value of damaged property', significance: 'Key precedent for DV recovery in Arizona' },
    ],
  },
  {
    state: 'Arkansas',
    stateCode: 'AR',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'Arkansas allows both first-party and third-party diminished value claims.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      '3-year statute of limitations',
      'One of the more claimant-friendly states for DV',
    ],
  },
  {
    state: 'California',
    stateCode: 'CA',
    firstParty: 'limited',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'California allows third-party DV claims and has a specific jury instruction (CACI 3903J) addressing diminished value. First-party claims are heavily restricted.',
    statute: 'CACI 3903J',
    keyPoints: [
      'Third-party DV claims well-established',
      'First-party claims heavily restricted — no clear case law precedent supporting recovery against own insurer',
      'CACI 3903J (modified 2016): if vehicle can be repaired but is worth less after repair, damages = (pre-accident value - post-repair value) + cost of repairs, not to exceed pre-accident value',
      '3-year statute of limitations',
      'Professional appraisal strongly recommended for California DV claims',
    ],
    sourceUrl: 'https://www.justia.com/trials-litigation/docs/caci/3900/3903j/',
    sourceName: 'CACI 3903J - Damage to Personal Property',
  },
  {
    state: 'Colorado',
    stateCode: 'CO',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '2 years (modified comparative fault)',
    summary: 'Colorado recognizes third-party DV claims with strong case law support dating back to 1948. Colorado is a modified comparative fault state.',
    keyPoints: [
      'Third-party DV claims recognized with strong case law',
      'First-party claims not recognized under standard auto policies',
      'Modified comparative fault — DV recovery reduced by your percentage of fault',
      '2-year statute of limitations',
    ],
    courtCases: [
      { name: 'Trujillo v. Wilson', year: 1948, court: 'Colorado Supreme Court', holding: 'Permitted recovery for diminution in value of damaged property', significance: 'Early precedent establishing DV recovery in Colorado' },
      { name: 'Airborne v. Denver Air Center', year: 1992, court: 'Colorado Court of Appeals', holding: 'Reaffirmed DV recovery rights', significance: 'Modern confirmation of DV claim viability' },
    ],
  },
  {
    state: 'Florida',
    stateCode: 'FL',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '4 years',
    summary: 'Florida allows third-party DV claims with a relatively long 4-year statute of limitations. First-party claims are generally not permitted. Florida is a no-fault state for bodily injury but fault-based for property damage.',
    keyPoints: [
      'Third-party DV claims recognized — claim against at-fault driver\'s property damage liability coverage',
      'First-party DV claims generally not permitted',
      'Florida is no-fault for bodily injury but fault-based for property damage',
      '4-year statute of limitations',
      'Must prove the other driver was at fault',
    ],
    courtCases: [
      { name: 'McHale v. Farm Bureau Mutual Insurance Co.', year: 1982, court: 'Florida District Court of Appeal', holding: 'Recognized the right to recover diminished value in property damage claims', significance: 'Foundational case for DV recovery in Florida' },
      { name: 'Siegle v. Progressive Consumer\'s Insurance Company', year: 2002, court: 'Florida Supreme Court', holding: 'Addressed DV claims in context of comprehensive/collision coverage', significance: 'Clarified scope of DV recovery under Florida law' },
    ],
  },
  {
    state: 'Georgia',
    stateCode: 'GA',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '4 years',
    summary: 'Georgia is the ONLY state where insurers must proactively evaluate and pay diminished value on first-party claims. The landmark Mabry v. State Farm decision (2001) established this requirement. The 17c formula originated here but is NOT the required methodology.',
    statute: 'O.C.G.A. § 33-4-6; State Farm v. Mabry (2001)',
    keyPoints: [
      'ONLY state requiring insurers to proactively evaluate and offer DV payment on first-party claims',
      'Both first-party and third-party DV claims fully recognized',
      '4-year statute of limitations',
      'Mabry decision: insurer must evaluate every first-party physical damage claim for DV — not just when the customer asks',
      'Insurer must either affirm DV and pay it, or deny DV with explanation',
      '17c formula originated here but the Georgia Insurance Commissioner has instructed insurers NOT to use it as a legal or determinative calculation outside the Mabry class action',
      'Comparative fault: DV recovery allowed if claimant is less than 50% at fault',
      'Bad faith penalties under O.C.G.A. § 33-4-6 (50% penalty + attorney fees) apply to DV claims too',
    ],
    courtCases: [
      { name: 'State Farm Mutual Automobile Insurance Co. v. Mabry', year: 2001, court: 'Georgia Supreme Court', holding: 'Insurance companies have a duty to evaluate ALL first-party physical damage claims for diminished value, just as they evaluate other elements of damage. Invoked the 19th-century "value loss" doctrine.', significance: 'The most important DV case in the country. Made Georgia the only state requiring proactive DV evaluation on first-party claims. Created the framework for the 17c formula (though the formula was only approved for that specific class action).' },
      { name: 'Amica Mutual Insurance Co. v. Sanders', year: 2015, court: 'Georgia Court of Appeals', holding: 'Upheld using the 17c formula for DV calculations in certain contexts', significance: 'Confirmed 17c as one acceptable method, though not the only one' },
      { name: 'Perma Ad Ideas v. Mayville', year: 1981, court: 'Georgia Court of Appeals', holding: 'Allowed recovery for diminution in value of damaged property', significance: 'Early precedent for DV recovery in Georgia' },
    ],
    sourceUrl: 'https://law.justia.com/cases/georgia/supreme-court/2001/s01a0982-1.html',
    sourceName: 'Justia - State Farm v. Mabry (2001)',
    notes: 'Georgia is the gold standard for DV rights. The Mabry decision requires insurers to proactively evaluate DV — you don\'t even have to ask. However, many insurers still try to use the 17c formula to minimize payouts. An independent USPAP-compliant appraisal will almost always yield a higher value.',
  },
  {
    state: 'Illinois',
    stateCode: 'IL',
    firstParty: 'limited',
    thirdParty: 'yes',
    statuteOfLimitations: '5 years',
    summary: 'Illinois allows third-party DV claims with a long 5-year statute of limitations. First-party claims have been addressed by courts — "repair or replace" policy language generally does not cover DV.',
    keyPoints: [
      'Third-party DV claims recognized',
      'First-party claims limited — courts have held "repair or replace" policies don\'t cover DV',
      '5-year statute of limitations',
    ],
    courtCases: [
      { name: 'Trailmobile Division v. Higgs', year: 1973, court: 'Illinois Appellate Court', holding: 'Allowed recovery for diminution in value', significance: 'Established DV recovery in Illinois' },
      { name: 'Sims v. Allstate Insurance Co.', year: 2006, court: 'Illinois Appellate Court', holding: '"Repair or replace" policies do not cover diminished value', significance: 'Limited first-party DV claims under standard auto policies' },
    ],
  },
  {
    state: 'Louisiana',
    stateCode: 'LA',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '1 year',
    summary: 'Louisiana allows both first-party and third-party DV claims but has the SHORTEST statute of limitations in the country — just 1 year. Act quickly.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      'SHORTEST statute of limitations in the country: 1 YEAR from date of accident',
      'Must act quickly — missing the 1-year deadline = complete loss of claim rights',
      'Professional appraisal strongly recommended given the tight timeline',
    ],
    courtCases: [
      { name: 'Orillac v. Solomon', year: 2000, court: 'Louisiana Court of Appeal', holding: 'Supported recovery for diminished value in property damage claims', significance: 'Key Louisiana precedent for DV recovery' },
    ],
    notes: 'Louisiana\'s 1-year deadline is a trap for the unwary. If you suspect DV, get an appraisal and file your claim immediately.',
  },
  {
    state: 'Maryland',
    stateCode: 'MD',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'Maryland allows both first-party and third-party DV claims. Real-world recoveries significantly exceed insurer initial offers (e.g., $3,800 vs. $1,300 initial offer).',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      '3-year statute of limitations',
      'Independent appraisals often recover 2–3x the insurer\'s initial offer',
    ],
    courtCases: [
      { name: 'Fred Frederick v. Krause', year: 1971, court: 'Maryland Court of Appeals', holding: 'Permitted recovery for diminished value', significance: 'Foundational Maryland DV precedent' },
    ],
  },
  {
    state: 'Massachusetts',
    stateCode: 'MA',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'Massachusetts has evolving DV law — a 2021 case expanded DV rights under the 2008 Standard Policy, but a 2022 case restricted them under the 2016 Standard Policy. Policy language matters.',
    keyPoints: [
      'Third-party DV claims recognized',
      'First-party claims: depends on policy version — 2008 Standard Policy allows DV, 2016 Standard Policy may exclude it',
      '3-year statute of limitations',
      'Check your specific policy language — the edition year matters',
    ],
    courtCases: [
      { name: 'McGilloway v. Safety Insurance Co.', year: 2021, court: 'Massachusetts Appeals Court', holding: 'Broader 2008 Standard Policy language required DV payment', significance: 'Expanded DV rights under older policy forms' },
      { name: 'Merullo v. Amica Mutual Insurance Co.', year: 2022, court: 'Massachusetts Superior Court', holding: 'Restrictive 2016 Standard Policy language excluded third-party inherent DV damages', significance: 'Restricted DV rights under newer policy forms — shows policy language is critical' },
    ],
  },
  {
    state: 'Michigan',
    stateCode: 'MI',
    firstParty: 'limited',
    thirdParty: 'limited',
    statuteOfLimitations: '3 years',
    summary: 'Michigan severely limits DV claims through its mini-tort system. Recovery is capped at $3,000 (as of 2025) and excludes inherent diminished value.',
    statute: 'MCL 500.3135(3)(e)',
    keyPoints: [
      'DV claims limited to mini-tort system',
      'Recovery capped at $3,000',
      'Excludes inherent diminished value — only covers repair-related losses',
      '3-year statute of limitations',
      'One of the most restrictive states for DV claims',
    ],
  },
  {
    state: 'Nebraska',
    stateCode: 'NE',
    firstParty: 'no',
    thirdParty: 'no',
    statuteOfLimitations: '4 years',
    summary: 'Nebraska is the ONLY state that bans ALL diminished value claims — both first-party and third-party. This is based on the 1986 Chlopek decision.',
    keyPoints: [
      'ONLY state in the U.S. that completely bans diminished value claims',
      'Both first-party AND third-party DV claims are not legally viable',
      'Based on Chlopek v. Schmall (1986) precedent',
      '4-year statute of limitations (moot since DV claims are not recognized)',
    ],
    courtCases: [
      { name: 'Chlopek v. Schmall', year: 1986, court: 'Nebraska Supreme Court', holding: 'Rejected diminished value as a recoverable damage', significance: 'Made Nebraska the only state to completely ban all DV claims' },
    ],
    notes: 'If your accident occurred in Nebraska, you cannot recover diminished value under any circumstances under current law.',
  },
  {
    state: 'New Hampshire',
    stateCode: 'NH',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'New Hampshire recognizes third-party diminished value claims under general property damage tort law. The landmark Copadis v. Haymond (1946) decision established that a vehicle owner may recover the difference in value before and after repairs, in addition to repair costs and loss of use.',
    statute: 'RSA 508:4 (Statute of Limitations); Copadis v. Haymond, 94 N.H. 103 (1946)',
    keyPoints: [
      'Third-party DV claims (against at-fault driver\'s insurer) are permitted under general tort law',
      'First-party DV claims (against your own policy) are typically excluded by standard auto policy language',
      '3-year statute of limitations under RSA 508:4 for property damage actions',
      'Discovery rule may apply — the 3-year period can begin from the date the damage and its causal relationship were or should have been discovered',
      'NH Supreme Court in Copadis adopted Restatement (Second) of Torts § 928 as the damages standard',
      'Damages measure: cost of repair with due allowance for any difference between original value and value after repairs, plus loss of use',
      'USPAP-compliant professional appraisals using comparative market analysis carry the most weight',
      'The 17c formula is NOT binding law in NH — adjusters may present it, but it systematically undervalues DV',
      'DV reports should be based on real-world comparable sales data showing the market impact of accident/repair history',
      'Small claims court limit is $10,000 — DV claims within this amount can be filed without an attorney',
      'NH minimum property damage liability coverage is $25,000, which caps recovery from at-fault parties carrying minimums',
      'No specific DV statute exists — claims are supported by general property damage tort law and case law precedent',
    ],
    courtCases: [
      {
        name: 'Copadis v. Haymond',
        year: 1946,
        court: 'New Hampshire Supreme Court',
        holding: 'Vehicle owner may recover the difference in value before and after damage, or the reasonable cost of repair with allowance for any remaining value difference, plus loss of use',
        significance: 'Landmark NH case establishing the legal framework for DV recovery by adopting Restatement (Second) of Torts § 928 — upheld a verdict including diminished value when repairs did not fully restore the vehicle\'s value',
      },
    ],
    notes: 'While Copadis v. Haymond provides the legal framework allowing DV recovery, there is limited reported NH appellate case law specifically addressing post-repair residual diminished value. The Copadis standard is broadly applied when supported by credible appraisal evidence. A professional market-based DV appraisal is strongly recommended.',
    sourceUrl: 'https://www.courtlistener.com/opinion/3573957/copadis-v-haymond/',
    sourceName: 'CourtListener - Copadis v. Haymond, 94 N.H. 103 (1946)',
    additionalLinks: [
      { label: 'RSA 508:4 - Statute of Limitations', url: 'https://law.justia.com/codes/new-hampshire/title-lii/chapter-508/section-508-4/' },
      { label: 'RSA 417:4 - Unfair Claim Settlement Practices', url: 'https://law.justia.com/codes/new-hampshire/title-xxxvii/chapter-417/section-417-4/' },
    ],
  },
  {
    state: 'New Jersey',
    stateCode: 'NJ',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '6 years',
    summary: 'New Jersey allows both first-party and third-party DV claims with one of the longest statutes of limitations (6 years). Courts recognize the "scarlet letter" effect of accident history.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      '6-year statute of limitations — one of the longest in the country',
      'Courts recognize the "scarlet letter" of accident history affecting vehicle value',
    ],
    courtCases: [
      { name: 'Jones v. Lahn', year: 1949, court: 'New Jersey Supreme Court', holding: 'Damages limited to lesser of repair costs or pre/post-damage value difference', significance: 'Early NJ framework for property damage DV recovery' },
      { name: 'Financial Services Vehicle Trust v. Panter', year: 2019, court: 'New Jersey Appellate Division', holding: 'Third-party DV claims are cognizable; recognized "scarlet letter" of accident history', significance: 'Modern confirmation that accident history stigma is a compensable loss' },
    ],
  },
  {
    state: 'New York',
    stateCode: 'NY',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'New York recognizes third-party DV claims but nearly all first-party claims are rejected. Third-party claims require proving the other driver was at fault.',
    keyPoints: [
      'Third-party DV claims recognized',
      'Nearly all first-party claims rejected',
      '3-year statute of limitations',
      'Must prove other driver was at fault',
    ],
    courtCases: [
      { name: 'Rosenfield v. Choberka', year: 1988, court: 'New York Appellate Division', holding: 'Recognized diminution in value as compensable damage', significance: 'Established third-party DV recovery in New York' },
    ],
  },
  {
    state: 'North Carolina',
    stateCode: 'NC',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'North Carolina has a specific statute (GS 20-279.21) with a unique appraisal clause for DV disputes. If the insurer\'s and policyholder\'s DV estimates differ by more than $2,000 or 25% of fair market value, each party selects an appraiser.',
    statute: 'N.C. Gen. Stat. § 20-279.21(d)(1)',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      'Specific statutory appraisal procedure for DV disputes',
      'If DV estimates differ by >$2,000 OR >25% of fair market value, the appraisal process is triggered',
      'Each party selects a competent and disinterested appraiser; umpire as tiebreaker',
      'Appraisers and umpires MUST be licensed by the NC Department of Insurance as motor vehicle damage appraisers',
      '3-year statute of limitations',
      'Courts use the "before-and-after" rule for calculating DV',
    ],
    sourceUrl: 'https://www.ncdiminishedvalue.com/diminished-value-law-nc',
    sourceName: 'NC Diminished Value Law - GS 20-279.21',
    additionalLinks: [
      { label: 'NC 3rd Party Appraisal Clause', url: 'https://wreckcheckatlanta.com/north-carolinas-3rd-party-appraisal-clause/' },
    ],
  },
  {
    state: 'Ohio',
    stateCode: 'OH',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '2 years',
    summary: 'Ohio allows both first-party and third-party diminished value claims with a 2-year statute of limitations.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      '2-year statute of limitations',
    ],
  },
  {
    state: 'Oregon',
    stateCode: 'OR',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '6 years',
    summary: 'Oregon allows both DV claim types with a long 6-year statute of limitations, though the burden of proof is substantial.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      '6-year statute of limitations — one of the longest',
      'Burden of proof on the claimant is substantial',
    ],
    courtCases: [
      { name: 'EAM Advertising Agency v. Helies', year: 1998, court: 'Oregon Court of Appeals', holding: 'Permitted DV recovery but noted burden of proof is substantial', significance: 'Established DV recovery with high evidentiary standard' },
    ],
  },
  {
    state: 'Pennsylvania',
    stateCode: 'PA',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '2 years (42 Pa.C.S. § 5524(7))',
    summary: 'Pennsylvania allows third-party DV as a component of the common-law tort measure of damages, anchored in Holt v. Pariser (Pa. Super. 1947) adopting Restatement (First) of Torts § 928. First-party DV is not recoverable — standard PA auto policies contain an ISO-style "diminution in value" exclusion, and Lobozzo v. Adam Eidemiller (Pa. 1970) is routinely cited for the repair-cost-only rule in first-party claims.',
    statute: '42 Pa.C.S. § 5524(7) (SOL); 31 Pa. Code § 62.3 (appraisal standards)',
    keyPoints: [
      'Third-party DV is recoverable against the at-fault driver\'s liability insurer — based on common-law tort damages, not statute',
      'Controlling case: Holt v. Pariser (Pa. Super. 1947) adopts Restatement (First) of Torts § 928 — claimant may elect repair cost PLUS any residual diminution between original value and post-repair value',
      'First-party DV is NOT recoverable under standard PA collision/comprehensive coverage — ISO "diminution in value" exclusion is approved in PA and appears in State Farm, Progressive, GEICO, Allstate, and Nationwide forms',
      'Lobozzo v. Adam Eidemiller (Pa. 1970): where property is repaired, recovery is cost of repair without regard to diminution — cited against first-party DV',
      'UM/UIM does NOT cover DV — it is a first-party contract claim subject to the same exclusion analysis',
      '2-year statute of limitations under 42 Pa.C.S. § 5524(7) — runs from the date of the accident, not the date of repair or denial',
      'No PA appellate case has endorsed or rejected the 17c formula — carriers use 17c (or variants) to minimize; claimants should use market-based comparables (clean-history vs. accident-history) via a licensed MVPDA',
      'Burden: preponderance of the evidence, proven to reasonable certainty — speculative DV will not survive summary judgment',
      'Owner opinion on value is competent lay testimony, but in contested cases an independent MVPDA appraisal is effectively required',
      'RELEASE TRAP: third-party property damage releases routinely extinguish DV — carve out "excluding any claim for inherent/residual diminished value" before signing',
      'Leased/financed vehicles: check the contract — lienholders or lessors may have a claim on DV proceeds',
    ],
    courtCases: [
      { name: 'Holt v. Pariser', year: 1947, court: 'Pennsylvania Superior Court (161 Pa. Super. 315, 54 A.2d 89)', holding: 'Adopted Restatement (First) of Torts § 928: claimant may recover difference in pre/post value OR, at claimant\'s election, reasonable cost of repair WITH due allowance for any difference between original value and value after repairs.', significance: 'Foundational PA third-party DV authority. Never overruled. The "due allowance" language is the textual hook for residual post-repair diminished value.' },
      { name: 'Lobozzo v. Adam Eidemiller, Inc.', year: 1970, court: 'Pennsylvania Supreme Court (437 Pa. 360, 263 A.2d 432)', holding: 'Where a chattel or structure is repaired, the plaintiff may recover cost of repair or restoration without regard to diminution in value.', significance: 'Leading PA authority cited against first-party DV. Though originally a blasting-damage-to-realty case, its principle has been extended to first-party auto policy disputes.' },
      { name: 'Incollingo v. Ewing', year: 1971, court: 'Pennsylvania Supreme Court (444 Pa. 299, 282 A.2d 206)', holding: 'Damages must be "compensatory to the full extent of the injury."', significance: 'Cited by claimants to support full DV recovery as part of making the plaintiff whole.' },
      { name: 'Munoz v. Allstate Ins. Co.', year: 1999, court: 'Philadelphia Court of Common Pleas (No. 9906-2855)', holding: 'First-party collision coverage does not obligate the insurer to pay diminished value.', significance: 'Widely cited by carriers as PA authority for denying first-party DV under standard auto policies.' },
      { name: 'In re Paoli R.R. Yard PCB Litig.', year: 1994, court: 'U.S. Court of Appeals, Third Circuit (35 F.3d 717)', holding: 'Applying PA law: residual diminution in value is recognized even after remediation of damaged property.', significance: 'Confirms that stigma/residual DV remains a live concept under PA law.' },
      { name: 'Bumbarger v. Walker', year: 1960, court: 'Pennsylvania Superior Court (193 Pa. Super. 301, 164 A.2d 144)', holding: 'Lesser-of-two rule for measuring damages to realty (permanent vs. reparable damage).', significance: 'Often cited in PA measure-of-damages analysis; distinguishable from chattel DV under Restatement § 928 election.' },
    ],
    sourceUrl: 'https://casetext.com/case/holt-v-pariser-et-al',
    sourceName: 'Casetext — Holt v. Pariser (Pa. Super. 1947)',
    notes: 'Practical workflow: (1) confirm third-party claim (at-fault driver\'s liability carrier), (2) verify no release has been signed, (3) order independent market-based DV appraisal by a licensed PA MVPDA using clean-history vs. accident-history comparables, (4) document with repair invoice, photos, CarFax/AutoCheck, and comparable sales, (5) watch the 2-year SOL. PA has not blessed or rejected 17c at the appellate level — expect carrier-side appraisers to use 17c while claimant-side relies on market data. The strongest DV claims are on late-model, low-mileage vehicles with clean pre-accident history and visible/structural damage now disclosed on vehicle history reports.',
    additionalLinks: [
      { label: 'Lobozzo v. Adam Eidemiller (Pa. 1970) — Justia', url: 'https://law.justia.com/cases/pennsylvania/supreme-court/1970/437-pa-360-0.html' },
      { label: 'Incollingo v. Maurer (Pa. Super.) — Casetext', url: 'https://casetext.com/case/incollingo-v-maurer' },
      { label: '31 Pa. Code § 62.3 — MVPDA Appraisal Standards', url: 'https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/031/chapter62/s62.3.html&d=reduce' },
      { label: '42 Pa.C.S. § 5524 — 2-Year Statute of Limitations', url: 'https://codes.findlaw.com/pa/title-42-pacsa-judiciary-and-judicial-procedure/pa-csa-sect-42-5524/' },
      { label: 'Matthiesen, Wickert & Lehrer — 50-State DV Survey (PDF)', url: 'https://www.mwl-law.com/wp-content/uploads/2018/02/DIMINUTION-IN-VALUE-IN-ALL-50-STATES.pdf' },
    ],
  },
  {
    state: 'Rhode Island',
    stateCode: 'RI',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '10 years',
    summary: 'Rhode Island has the LONGEST statute of limitations for DV claims in the country — 10 years. Both claim types are allowed.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      'LONGEST statute of limitations in the country: 10 YEARS',
      'Very claimant-friendly for DV recovery',
    ],
  },
  {
    state: 'South Carolina',
    stateCode: 'SC',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'South Carolina allows both first-party and third-party DV claims.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      '3-year statute of limitations',
    ],
    courtCases: [
      { name: 'Newman v. Brown', year: 1955, court: 'South Carolina Supreme Court', holding: 'Allowed recovery for diminished value of damaged property', significance: 'Early precedent for DV claims in South Carolina' },
    ],
  },
  {
    state: 'Texas',
    stateCode: 'TX',
    firstParty: 'limited',
    thirdParty: 'yes',
    statuteOfLimitations: '2 years',
    summary: 'Texas allows third-party DV claims — the at-fault driver\'s insurer must pay DV. First-party claims are only permitted if specifically mentioned in the policy, which is rare. No official Texas formula for DV.',
    keyPoints: [
      'Third-party DV claims fully recognized — claim against at-fault driver\'s liability coverage',
      'First-party claims only if the policy specifically mentions DV coverage (rare)',
      'UM/UIM property damage coverage may cover DV if at-fault driver is uninsured',
      'No official Texas formula for DV — insurers often use variations of the 17c formula',
      'Professional appraisal with real market data recommended over formula-based approaches',
      '2-year statute of limitations',
      'Texas is a fault state — must prove other driver caused the damage',
    ],
    courtCases: [
      { name: 'Ludt v. McCollum', year: 1988, court: 'Texas Court of Appeals', holding: 'Legal liability for property damage includes diminished value', significance: 'Key Texas precedent establishing DV as part of property damage liability' },
      { name: 'Terminix International, Inc. v. Lucci', year: 1984, court: 'Texas Court of Appeals', holding: 'Supported diminution in value as compensable property damage', significance: 'Early Texas authority for DV recovery' },
    ],
    sourceUrl: 'https://www.tdi.texas.gov/bulletins/2000/b-0027-0.html',
    sourceName: 'Texas DOI Bulletin B-0027-00',
  },
  {
    state: 'Virginia',
    stateCode: 'VA',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '5 years',
    summary: 'Virginia allows both first-party and third-party DV claims with a long 5-year statute of limitations.',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      '5-year statute of limitations',
      'Virginia uses contributory negligence — if you are even 1% at fault, you may be barred from recovery',
    ],
    courtCases: [
      { name: 'Averett v. Shircliff', year: 1977, court: 'Virginia Supreme Court', holding: 'Recognized diminished value as compensable damage', significance: 'Established DV recovery in Virginia' },
    ],
    notes: 'Virginia\'s strict contributory negligence rule means you must be 0% at fault to recover DV. This is the harshest fault standard in the country.',
  },
  {
    state: 'Washington',
    stateCode: 'WA',
    firstParty: 'yes',
    thirdParty: 'yes',
    statuteOfLimitations: '3 years',
    summary: 'Washington allows both DV claim types. The landmark Moeller v. Farmers class action resulted in a $48.5 million settlement. The state distinguishes between "diminished value" (physical) and "stigma damages" (intangible).',
    keyPoints: [
      'Both first-party and third-party DV claims allowed',
      'Moeller v. Farmers: $48.5 million class action settlement for failure to pay DV',
      'State Farm also settled a WA DV class action for $2.09 million (2024)',
      'Washington distinguishes "diminished value" (physical damage) from "stigma damages" (intangible market perception)',
      'Stigma damages are generally disfavored by WA courts',
      '3-year statute of limitations',
    ],
    courtCases: [
      { name: 'Moeller v. Farmers Insurance Co. of Washington', year: 2011, court: 'Washington Supreme Court', holding: 'Policy language allowing "repair or replace to preloss condition" includes diminished value. Distinguished between physical DV and stigma damages.', significance: 'Landmark WA decision — led to $48.5 million class action settlement. Established that auto policies must cover DV when they promise to restore to preloss condition.' },
    ],
    sourceUrl: 'https://law.justia.com/cases/washington/supreme-court/2011/84500-0-1.html',
    sourceName: 'Justia - Moeller v. Farmers (2011)',
    notes: 'Two major class action settlements (Farmers $48.5M, State Farm $2.09M) show WA courts take DV seriously. If your insurer hasn\'t paid DV, you may have a strong claim.',
  },
  {
    state: 'Wisconsin',
    stateCode: 'WI',
    firstParty: 'no',
    thirdParty: 'yes',
    statuteOfLimitations: '6 years',
    summary: 'Wisconsin allows third-party DV claims but first-party claims have been rejected. Courts apply a nuanced approach — residual DV is recoverable if repairs don\'t fully restore value.',
    keyPoints: [
      'Third-party DV claims recognized',
      'First-party claims rejected — "repair or replace" policy language covers repairs only, not value restoration',
      '6-year statute of limitations',
      'Residual DV recoverable if repairs don\'t restore pre-injury value (Hellenbrand)',
    ],
    courtCases: [
      { name: 'Wildin v. American Family Mutual Insurance Co.', year: 2001, court: 'Wisconsin Court of Appeals', holding: 'First-party DV claim dismissed — policy covers repairs, not value restoration', significance: 'Blocked first-party DV claims in Wisconsin' },
      { name: 'Hellenbrand v. Hilliard', year: 2004, court: 'Wisconsin Court of Appeals', holding: 'Rejected blanket rule; residual DV is recoverable if repairs don\'t restore pre-injury value', significance: 'Nuanced third-party DV recovery — allows residual DV claims' },
    ],
  },
]

// All 50 states + DC
export const allStates = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]
