// Loss of Use FAQ database for the Loss of Use detail page.
// 40 Q&As covering definitions, qualifications, calculation methods,
// jurisdictional rules, commercial vehicles, and common disputes.
// Neutral, independent-expert tone — serves carriers, vehicle owners, and attorneys.

export interface FAQ {
  id: string
  question: string
  answer: string
  category:
    | 'basics'
    | 'qualification'
    | 'calculation'
    | 'jurisdiction'
    | 'rental-class'
    | 'duration'
    | 'total-loss'
    | 'commercial'
    | 'household'
    | 'documentation'
    | 'disputes'
    | 'misconceptions'
}

export const LOSS_OF_USE_FAQS: FAQ[] = [
  // ── BASICS (Definition, framing, related concepts) ──
  {
    id: 'faq-001',
    question: 'What is loss of use in an auto insurance claim?',
    answer:
      'Loss of use is the cost of renting a vehicle while the insured\'s car is being repaired or, in total-loss claims, while the owner is arranging a replacement. It compensates the policyholder for the inconvenience and transportation cost of being without their vehicle during the claim process. The amount is typically calculated as the daily rental rate for a comparable vehicle multiplied by the number of days the vehicle was unavailable.',
    category: 'basics',
  },
  {
    id: 'faq-002',
    question: 'Difference between loss of use and rental reimbursement?',
    answer:
      'Loss of use and rental reimbursement are often used interchangeably, but technically differ. Rental reimbursement covers the cost of an actual rental car the insured paid for during repair. Loss of use is broader — it can compensate for the hypothetical rental value even if the insured never rented a vehicle (for example, borrowing a friend\'s car or using public transit). Most policies cover rental reimbursement; loss of use depends on state law and policy language.',
    category: 'basics',
  },
  {
    id: 'faq-003',
    question: 'What about "loss of income" vs. "loss of use"?',
    answer:
      'Loss of use is the rental-equivalent daily rate, applicable to personal vehicles. Loss of income (or lost profits) applies to commercial vehicles — taxi, delivery, contractor trucks — where the repair prevents the owner from earning revenue. Loss of income is calculated differently (daily revenue minus operating costs) and is more heavily disputed than personal loss of use.',
    category: 'basics',
  },
  {
    id: 'faq-004',
    question: 'Is loss of use a covered benefit in most auto policies?',
    answer:
      'Rental reimbursement is a standard (though often limited) add-on to personal auto policies, typically capping daily rental at $30–$50 and total duration at 12–30 days. Whether loss of use extends beyond policy limits is determined by state law. Some states allow recovery beyond policy limits if the insured can prove a reasonable daily rental rate for a comparable vehicle; others cap it at the policy limit. Check state statute and policy language for your jurisdiction.',
    category: 'basics',
  },
  {
    id: 'faq-005',
    question: 'Can I recover loss of use from the at-fault party\'s policy?',
    answer:
      'Yes, if you pursue a claim against the liable party\'s liability policy. Loss of use is a consequential damage typically covered under third-party liability claims. The liable party\'s insurer must pay a reasonable loss-of-use amount based on rental-market evidence and repair duration, regardless of what the injured party\'s policy limit is.',
    category: 'basics',
  },

  // ── QUALIFICATION (Who, what vehicles, circumstances) ──
  {
    id: 'faq-006',
    question: 'Who can claim loss of use in an auto insurance claim?',
    answer:
      'Any vehicle owner or lessee whose car is out of service due to a covered loss (collision, comprehensive, uninsured motorist) and who incurs transportation costs or arranges a rental. This includes personal vehicle owners, commercial vehicle operators, and fleet managers. The claimant must be the policyholder or authorized driver and must have a reasonable transportation need.',
    category: 'qualification',
  },
  {
    id: 'faq-007',
    question: 'Do I need rental reimbursement coverage to claim loss of use?',
    answer:
      'No. Rental reimbursement coverage is one way to cover loss of use, but if your policy doesn\'t include it (or has low limits), you may still recover loss of use under state law by demonstrating the reasonable daily rental value of a comparable vehicle and the duration of the repair. The carrier may dispute the amount, but the legal right to recover does not depend on having rental coverage.',
    category: 'qualification',
  },
  {
    id: 'faq-008',
    question: 'Can leased vehicle owners claim loss of use?',
    answer:
      'Yes, but the recovery flows through the lessor (the leasing company), not the driver. The lease agreement is the "owner" for insurance purposes. A driver of a leased vehicle should report the claim to the lessor\'s insurer; the lessor\'s policy and the lease gap-insurance provisions determine whether loss of use is covered. Personal renters (daily rental agreements) are not entitled to loss of use — only owners and lessees are.',
    category: 'qualification',
  },
  {
    id: 'faq-009',
    question: 'What if I have a second vehicle at home — can I still claim loss of use?',
    answer:
      'Some carriers and states impose a mitigation duty: if you have another serviceable vehicle in the household, your loss-of-use period may be reduced or eliminated. The reasoning is that you were not actually without transportation. This is a frequent dispute point — it depends on state law and carrier policy. An independent appraisal can document whether a second vehicle materially reduces the need for a rental.',
    category: 'qualification',
  },
  {
    id: 'faq-010',
    question: 'Can a business claim loss of use for a vehicle used for commuting only?',
    answer:
      'Yes, but the recovery is limited to loss of use (rental value), not lost business income. A business vehicle used primarily for commuting is treated as a personal vehicle for loss-of-use purposes. If the vehicle is a dedicated business asset (delivery, taxi, contractor vehicle), lost-income analysis applies instead — and that is more complex and heavily disputed.',
    category: 'qualification',
  },

  // ── CALCULATION (Methods, rates, daily allowances) ──
  {
    id: 'faq-011',
    question: 'How is loss of use calculated?',
    answer:
      'Loss of use = daily rental rate for a comparable vehicle × number of days the vehicle was unavailable. The daily rate is researched from local rental companies (Hertz, Enterprise, Budget, Turo, or local operators) for the same class of vehicle. The duration runs from the date of loss until the vehicle is repaired and available for pickup, excluding unreasonable owner-caused delays.',
    category: 'calculation',
  },
  {
    id: 'faq-012',
    question: 'What daily rental rates apply in different states?',
    answer:
      'Rental rates vary by location, vehicle class, and rental company. Mid-size sedan rentals typically range $30–$60/day in mid-size markets and $50–$100/day in major metros. Economy cars are lower; SUVs and luxury vehicles are higher. Rates should be benchmarked against actual local rental quotes (Enterprise, Hertz, Budget, or regional operators) for the same make/model class, not a nationwide average.',
    category: 'calculation',
  },
  {
    id: 'faq-013',
    question: 'Can I claim loss of use without actually renting a vehicle?',
    answer:
      'Yes, in jurisdictions that recognize hypothetical loss of use (most states except a few). Even if you borrowed a car or used public transit, you can claim the reasonable rental value for a comparable vehicle for the repair period. You must document the duration and provide evidence of local rental rates for a comparable class, but an actual rental invoice is not required.',
    category: 'calculation',
  },
  {
    id: 'faq-014',
    question: 'Does loss of use include the cost of a rental place reservation I cancelled?',
    answer:
      'No. Loss of use covers the period the vehicle was actually unavailable due to repair or replacement. A cancelled reservation is a separate contract matter. However, if the insured can show they incurred costs to cancel the reservation (e.g., cancellation fees for a pre-booked trip), that may be a different claim component (trip interruption insurance, not loss of use).',
    category: 'calculation',
  },
  {
    id: 'faq-015',
    question: 'Do higher-mileage vehicles qualify for lower loss-of-use rates?',
    answer:
      'No. Loss of use is based on the rental value of a comparable vehicle in the same class at the time of loss, regardless of the insured\'s vehicle\'s mileage or condition. A 150,000-mile Toyota Camry rents for roughly the same daily rate as a 50,000-mile Camry. The ACV of the damaged vehicle does not affect loss-of-use rate; only the vehicle class and rental market do.',
    category: 'calculation',
  },

  // ── JURISDICTION (State-specific rules) ──
  {
    id: 'faq-016',
    question: 'Which states allow hypothetical rental value without an actual rental?',
    answer:
      'Most states (approximately 47–48) allow loss of use based on hypothetical rental value even without an actual rental receipt. A small minority of states require proof of an actual rental expense. The safest approach is to verify the specific state\'s statute or case law before relying on hypothetical damages. Courts in California, Texas, New York, and most other major states routinely award hypothetical loss of use.',
    category: 'jurisdiction',
  },
  {
    id: 'faq-017',
    question: 'What are New York\'s loss of use rules?',
    answer:
      'New York recognizes loss of use and allows recovery based on a reasonable daily rental rate for a comparable vehicle. Repairs must be necessary and completed within a reasonable timeframe. The insured is not required to have rented a vehicle to recover; hypothetical rental value is permitted. Carriers must prove the rate or duration is unreasonable if they dispute it — the burden is not on the claimant to prove every market quote.',
    category: 'jurisdiction',
  },
  {
    id: 'faq-018',
    question: 'What are California\'s loss of use rules?',
    answer:
      'California recognizes loss of use as a form of damages. Most carriers cover rental up to a policy limit (often $30–$50/day for 14–30 days). Beyond the policy limit, California courts have permitted recovery of the reasonable rental value of a comparable vehicle based on market evidence. The insured need not have rented a vehicle to recover; market research suffices.',
    category: 'jurisdiction',
  },
  {
    id: 'faq-019',
    question: 'What are Texas loss of use rules?',
    answer:
      'Texas recognizes loss of use as recoverable damages. Many insurers cover rental through policy limits. For claims exceeding the policy limit, the insured can recover based on the reasonable market rental value of a comparable vehicle and the reasonable repair period. Texas courts apply a reasonableness standard to both the daily rate and duration.',
    category: 'jurisdiction',
  },
  {
    id: 'faq-020',
    question: 'What are Colorado loss of use rules?',
    answer:
      'Colorado statute C.R.S. § 10-4-627 governs loss of use for rental vehicles. Under this statute, rental income is capped at a formula (typically $12/day, though this amount updates), unless the insured can demonstrate a higher market rate for a comparable vehicle. Personal auto claims typically exceed this threshold, allowing market-rate recovery instead.',
    category: 'jurisdiction',
  },

  // ── COMPARABLE VEHICLE STANDARD ──
  {
    id: 'faq-021',
    question: 'What is a "comparable" rental vehicle for loss of use?',
    answer:
      'A comparable vehicle is the same class as the damaged vehicle — sedan, SUV, truck, or luxury — in similar condition (not necessarily the same make/model, but the same size and category). A Toyota Camry is comparable to a Honda Accord (both mid-size sedans); a Toyota RAV4 SUV is not comparable (different class). The rental rate must come from a legitimate local rental vendor (Hertz, Enterprise, Budget, Turo, or regional company).',
    category: 'rental-class',
  },
  {
    id: 'faq-022',
    question: 'Can I rent a luxury car if my vehicle was a luxury car?',
    answer:
      'Yes, if the damaged vehicle was actually a luxury model (e.g., BMW, Mercedes, Porsche). The rental rate must match the class of the damaged vehicle. Luxury rentals are significantly higher ($100–$300+/day) than economy vehicles ($30–$50/day). You must document the model/year of the damaged vehicle and provide rental quotes for comparable luxury vehicles, not economy cars.',
    category: 'rental-class',
  },
  {
    id: 'faq-023',
    question: 'Can I rent an SUV if my vehicle was an SUV?',
    answer:
      'Yes. Vehicle class matters. If the damaged vehicle was a full-size SUV, the comparable rental is another full-size SUV in the same market — not a compact crossover. If the damaged vehicle was a compact SUV, a comparable compact SUV rental applies. The rental rate must match the actual class, not a lower-priced alternative.',
    category: 'rental-class',
  },
  {
    id: 'faq-024',
    question: 'What if the only rental available is more expensive than the damaged vehicle\'s class?',
    answer:
      'The insured can claim the market rate for the correct class. If only luxury rentals are available at the rental location, but the damaged vehicle was a standard sedan, the rate is based on standard sedans elsewhere (within the same geographic market). If no rental company has the comparable class available, pricing from nearby markets or higher-end rental companies (Turo, specialty rental) may be used, but the rate must still reflect the appropriate vehicle class, not a downgrade.',
    category: 'rental-class',
  },

  // ── DURATION (Repair timeline, reasonable period) ──
  {
    id: 'faq-025',
    question: 'How many days of loss of use is reasonable?',
    answer:
      'Loss of use covers the time from the date of loss until the vehicle is repaired and ready for pickup — typically 1–4 weeks for most collision repairs, longer for complex jobs or part availability delays. The duration must be reasonable given the repair scope. A 3-day repair justifies 3 days of loss of use; a 45-day repair requires justification (e.g., part order delay, shop capacity) to avoid carrier dispute. Repair timeline is documented by the repair shop\'s estimate, supplements, and final invoice.',
    category: 'duration',
  },
  {
    id: 'faq-026',
    question: 'What if the repair takes longer than expected?',
    answer:
      'The insured can claim loss of use for the entire actual repair period, provided the delay is not the insured\'s fault and the repair shop did not unreasonably prolong the work. Delays caused by parts availability, manufacturer backorders, or shop capacity are generally recoverable. If the shop is slow without justification, or the insured repeatedly postpones the repair, the carrier may limit the claim to a "reasonable" duration. Documentation from the repair shop is essential.',
    category: 'duration',
  },
  {
    id: 'faq-027',
    question: 'Does loss of use include time for the insurance company to approve the repair?',
    answer:
      'Yes, generally. If the insurer delays approving the repair estimate, that time is added to the loss-of-use period. The insured is not responsible for waiting time caused by the insurance company\'s process. However, delays caused by the insured (e.g., requesting a second estimate from a different shop) are not covered.',
    category: 'duration',
  },
  {
    id: 'faq-028',
    question: 'What if the owner caused the delay in completing repairs?',
    answer:
      'Loss of use does not extend beyond the period reasonably required to repair the vehicle. If the owner postpones repair, changes shops mid-way, or delays approving a supplemental estimate, those days may not be recoverable. The repair timeline is measured from the date the repair shop receives authorization to begin work until the vehicle is finished and ready for pickup — not from the date of loss if there was a delay in approval or authorization.',
    category: 'duration',
  },
  {
    id: 'faq-029',
    question: 'Is loss of use capped at the rental reimbursement limit on the policy?',
    answer:
      'Rental reimbursement coverage has explicit limits (e.g., $30/day, 14 days = $420 max). However, in most states, the insured can recover loss of use beyond the policy limit if they can prove a higher reasonable daily rate or longer repair duration. The policy limit is a floor for basic coverage; state law and third-party liability claims allow higher recovery. Verify your state\'s statute for the specific rule.',
    category: 'duration',
  },

  // ── TOTAL LOSS CASES ──
  {
    id: 'faq-030',
    question: 'Is loss of use recoverable after a total loss settlement?',
    answer:
      'Yes, but with limits. If the vehicle is a total loss, loss of use is measured from the date of loss until a reasonable time for the owner to find a replacement vehicle — typically 30–60 days, depending on market availability. The owner cannot claim loss of use indefinitely while shopping for a vehicle. Once the owner has had a reasonable time (and had the opportunity to purchase a replacement with the settlement proceeds), loss of use stops.',
    category: 'total-loss',
  },
  {
    id: 'faq-031',
    question: 'How long after a total-loss settlement can I claim loss of use?',
    answer:
      'The standard is 30–60 days from the date of loss, though this can vary by state and case. The theory is that a reasonable buyer should locate and purchase a replacement vehicle within 30–60 days. If the owner proves a longer period is necessary (e.g., special-order custom vehicle, rare model), the duration can be extended with documentation. The insured must act diligently to mitigate — shopping delays caused by the owner do not extend the period.',
    category: 'total-loss',
  },
  {
    id: 'faq-032',
    question: 'Does rental reimbursement apply after a total loss?',
    answer:
      'In some cases, yes. If the insured is arranging replacement transportation while searching for a replacement vehicle, rental reimbursement may cover that period. However, most policies have limits that effectively cap total-loss loss of use at a modest amount ($30/day × 14 days = $420). Beyond the policy limit, state law determines whether higher recovery is allowed. Check the policy language and your state\'s statute.',
    category: 'total-loss',
  },

  // ── COMMERCIAL VEHICLES ──
  {
    id: 'faq-033',
    question: 'How is loss of use calculated for commercial vehicles (trucks, taxis)?',
    answer:
      'Commercial vehicle loss of use is calculated as daily lost revenue (gross revenue during the repair period minus variable operating costs like fuel, driver wages) rather than a rental rate. This is "loss of income" or "lost profits." The calculation requires documentation of the vehicle\'s daily revenue (dispatch records, lease agreements, prior income statements) and variable costs. The fixed costs (insurance, depreciation) are excluded. This is substantially more complex and disputed than personal loss of use.',
    category: 'commercial',
  },
  {
    id: 'faq-034',
    question: 'What documentation do I need for commercial vehicle loss of income?',
    answer:
      'Documentation includes: (a) business records showing daily/weekly revenue during the relevant period (dispatch records, delivery logs, trip sheets, revenue receipts); (b) a calculation of variable operating costs (fuel, per-mile maintenance, driver wages if per-trip); (c) repair timeline documentation from the shop; and (d) evidence that a replacement or backup vehicle was not available at reasonable cost. Without these records, the claim is difficult to prove and carriers frequently dispute it.',
    category: 'commercial',
  },
  {
    id: 'faq-035',
    question: 'Can a rideshare or delivery driver claim loss of use?',
    answer:
      'Yes, rideshare and delivery drivers can claim loss of income for the period the vehicle is out of service. However, the claim is based on documented lost revenue, not a rental rate. Drivers must provide: (a) platform statements (Uber, DoorDash, etc.) showing trips and earnings; (b) mileage/trip data; and (c) repair timeline. Gig economy claims are increasingly common but heavily scrutinized — carriers often dispute earnings documentation and variable cost deductions.',
    category: 'commercial',
  },
  {
    id: 'faq-036',
    question: 'Is loss of income or loss of use recoverable for a business vehicle used part-time?',
    answer:
      'If the vehicle is used primarily for business (e.g., contractor truck used 5 days/week), loss of income applies to the business-use period. If it is a personal vehicle occasionally used for business deliveries, loss of use (rental rate) applies. The distinction depends on the vehicle\'s primary purpose. Mixed-use vehicles often trigger disputes — document the primary use and percentage of time used for business.',
    category: 'commercial',
  },

  // ── HOUSEHOLD / MITIGATION ──
  {
    id: 'faq-037',
    question: 'What is the mitigation duty in loss of use claims?',
    answer:
      'The insured has a duty to mitigate damages — to take reasonable steps to minimize loss. In loss of use, this means: (a) repairing the vehicle reasonably quickly (not delaying repair unnecessarily); (b) using another household vehicle if available; (c) not upgrading to a more expensive rental than necessary. Failure to mitigate can reduce or eliminate the claim. However, mitigation duties vary by state; some are more lenient than others.',
    category: 'household',
  },
  {
    id: 'faq-038',
    question: 'If I borrowed a friend\'s car, can I still claim loss of use?',
    answer:
      'Yes, in most states. Borrowing a car is not a mitigation of loss of use; it is a separate arrangement. The insured can still claim the market rental value of a comparable vehicle for the repair period, even if they did not actually incur a rental cost. The reasoning is that the friend is not obligated to lend indefinitely, and the insured may need a long-term rental. However, some carriers argue that a free borrowed car negates the need for damages; state law determines the outcome.',
    category: 'household',
  },

  // ── DOCUMENTATION ──
  {
    id: 'faq-039',
    question: 'What documents do I need to support a loss of use claim?',
    answer:
      'Essential documentation includes: (a) repair shop estimate and final invoice showing repair scope and timeline; (b) rental quotes from local companies (Hertz, Enterprise, Budget, Turo) for a comparable vehicle class, showing the date of quote and daily rate; (c) repair timeline (date of loss, date repair started, date completed); (d) if applicable, actual rental receipts and invoices; (e) any correspondence with the insurance company about repair approval timing. For commercial vehicles, add business records (dispatch logs, revenue statements, tax returns).',
    category: 'documentation',
  },
  {
    id: 'faq-040',
    question: 'Can I prove loss of use damages without a rental invoice?',
    answer:
      'Yes, in most states. An actual rental invoice is strong evidence but not required. You can use rental quotes from local companies, online rental aggregators, or Turo listings showing the market rate for a comparable vehicle on the date of loss. You must also document the repair duration with the shop\'s estimate and invoice. Written proof of the daily rate and the number of days is sufficient; an actual receipt strengthens the claim but is not mandatory.',
    category: 'documentation',
  },
]
