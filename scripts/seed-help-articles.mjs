#!/usr/bin/env node
// One-off seeder: inserts curated Q&A articles into help_articles.
// Skips any question that's already present (dedup on exact question text).
//
// SECURITY: These articles are visible to every signed-in user AND used as
// retrieval context for the Ask Henry AI. Content MUST be purely "how do I
// do X in the app" — no tech names, no vendor names, no rulebook names, no
// data-source references, no real user names, no backend/infra details.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-help-articles.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const seeds = [
  {
    question: 'How do I create a new claim?',
    answer: `On the Dashboard, click the blue "New Claim" button in the top-right. You'll only see the button if you're an admin, or if an admin has given you the ability to create claims. It opens a fresh workspace on the Claim Info tab — fill in the Claim Type (ACV / DV / Estimate / Other), MA #, Client, Owner, Insurance Company, and Vehicle. The first save creates the claim and unlocks the other tabs.`,
    tags: ['claims', 'basics', 'creating'],
  },
  {
    question: 'How do I reassign a claim to another appraiser?',
    answer: `Open the claim, then click the reassign dropdown next to the current assignee name in the workspace toolbar. Pick someone (or Unassigned). Admins can reassign any claim. If you're not an admin, you'll only see the dropdown for claims currently assigned to you — and only if an admin has given you the reassign ability on your profile. Bulk reassign is available from the Dashboard: check the boxes next to multiple claims, pick a person in the toolbar that appears, click Confirm.`,
    tags: ['assignment', 'reassign', 'permissions'],
  },
  {
    question: 'What do the phase colors mean?',
    answer: `Every claim can have one status phase, shown as a colored pill in the Phase column and in the phase-filter chips above the table:

- Pending Payment — purple
- Rush — red (urgent turnaround)
- Umpire — amber (in umpire proceedings)
- Hold — teal (paused, usually waiting on the client or insurance)
- DV Response — fuchsia (waiting on the DV response from the other side)
- Completed — green (auto-set when a claim is submitted)

Click a chip above the Dashboard table to filter to just that phase. Click again to clear.`,
    tags: ['phases', 'dashboard', 'workflow'],
  },
  {
    question: 'How do I submit a claim for admin review?',
    answer: `From inside the claim, hit the Submit button in the toolbar. This locks the claim (no more editing), records who submitted and when, and auto-sets the phase to "Completed" so it shows up green on the Dashboard. If you need to unlock it after submitting, an admin can "Send Back" (returns to editable without closing) or "Reopen" (returns to open + editable). You can only submit claims that are assigned to you unless you're an admin.`,
    tags: ['submit', 'workflow', 'permissions'],
  },
  {
    question: 'What is the difference between ACV, DV, and Estimate Dispute?',
    answer: `These are the three main tools in the claim workspace. Toggle which apply by checking Claim Type boxes on the Claim Info tab:

- ACV Report (Actual Cash Value) — determine what the vehicle is worth using comparable vehicles. Comp Finder searches for comparables; Loss Search finds comparable losses. Produces the ACV Report PDF.
- DV (Diminished Value) — quantify how much the vehicle lost in resale value due to the accident/repair. Four template flavors (Nationwide / W-Loss × Attorney / Sedgwick).
- Estimate Dispute — review the other side's repair estimate for over-writing. Upload their estimate plus optional invoices, photos, and reference guidelines; the review flags issues.

A claim can use one, two, or all three. Leaving Claim Type empty shows every tool.`,
    tags: ['tools', 'acv', 'dv', 'estimate'],
  },
  {
    question: 'How do I upload documents to a claim?',
    answer: `Open the claim, go to the Documents tab. Drag files in from your desktop (PDF, JPG, PNG, TIFF, etc.) or click to browse. Files are stored privately for the claim and visible to every signed-in team member. Report PDFs that Modern Tools generates (ACV Report, Award, Closing Notes, DV Report, Invoice, Estimate Review) auto-file here when you produce them.`,
    tags: ['documents', 'upload'],
  },
  {
    question: 'How does the Estimate Review tool work?',
    answer: `Inside a claim, open the Estimate Dispute tab. Upload the other side's estimate (PDF or image). Optionally attach: reference photos, parts invoices (up to 100), and up to 3 reference guideline documents from the Repair Library. Fill in your asserted labor rates. Hit Run Review — the review returns findings across five categories:

- Over-writing (not-included / overlap / excess labor / duplicate / inflated manual entry)
- Labor rate discrepancies vs. your asserted rates
- Parts invoice mismatches (price/qty vs estimate)
- Guideline conflicts (missing / forbidden / conflicting per uploaded reference docs)
- Sales tax errors (per the state's rule vs. the estimate)

Each finding shows a dollar impact. The total disputed amount appears in a banner at the top of the review card. The full review PDF auto-files to Documents.`,
    tags: ['estimate', 'review'],
  },
  {
    question: 'How do I add parts invoices to a review?',
    answer: `In the Estimate Review upload form, use the "Parts invoices (optional)" drop zone. Drag up to 100 PDFs or images. Each invoice's line items get matched to the parts on the estimate — by part number first, description similarity second. You'll see per-part findings: price mismatch, quantity mismatch, invoice-only, or estimate-only. Only price/qty mismatches produce a dollar impact; orphans are informational.`,
    tags: ['estimate', 'invoices', 'parts'],
  },
  {
    question: 'How do I set my labor rates for a review?',
    answer: `Below the file upload zones on the Estimate Review form, there's a "Your asserted labor rates" table. Five default categories are pre-listed (Body, Paint, Mechanical, Frame, Structural). Enter the $/hr you believe is correct for each. Leave a row at 0 to skip it. Click "+ Add rate" for custom categories. Rates persist per-claim so when you review another estimate on the same claim, the values are already there. Any category the estimate uses at a different rate gets flagged with per-hour delta and total dollar impact (delta × hours actually billed at that rate).`,
    tags: ['estimate', 'labor', 'rates'],
  },
  {
    question: 'What is the Repair Library?',
    answer: `A shared library of reference documents used during estimate reviews. Admins add documents at Admin → Repair Library. When running an Estimate Review, any user can pick up to 3 library documents to attach — the review checks the estimate against them and flags missing/forbidden/conflict findings, citing document and section for each one. Only admins can add or archive documents.`,
    tags: ['library', 'estimate'],
  },
  {
    question: 'How does the automatic sales-tax check work?',
    answer: `Every Estimate Review runs a sales-tax check automatically — you don't need to enable it. The system uses the claim's loss state, looks up that state's rule (configured at Admin → Tax Rules), and flags anything the estimate charged tax on that shouldn't have been taxed (or vice-versa). Rules include: no tax / everything taxable / parts+materials only / parts only / parts+materials+refinish only. If your state isn't configured, you'll see one informational "no rule configured" finding and the check is skipped — an admin should add the rule at Admin → Tax Rules to enable it.`,
    tags: ['estimate', 'tax'],
  },
  {
    question: 'Why does my claim show a red "Forbidden" badge next to the state?',
    answer: `Modern Appraisers can't handle claims in certain states — currently just Massachusetts (MA). If the claim's loss address is in a forbidden state, the State column on the Dashboard shows a red FORBIDDEN pill and you should reassign or decline the claim immediately. Admins manage the forbidden list at Admin → Licensed States.`,
    tags: ['dashboard', 'licensing', 'states'],
  },
  {
    question: 'How do I search for a specific claim on the dashboard?',
    answer: `Use the search box in the top-right of the claims table. It filters live across MA #, VIN, claim number, vehicle, insured name, client name, insurance company, and assignee name. Combine with the phase filter chips above the table to narrow further. The Dashboard shows open claims only — use All Claims (top nav) to include closed ones.`,
    tags: ['dashboard', 'search'],
  },
  {
    question: `What's the difference between the two "Guidelines" pages in admin?`,
    answer: `They're different features that share a similar name:

- Admin → Guidelines = per-insurance-company notes (things like "this carrier prefers ACV method X") tied to the carrier.
- Admin → Repair Library = reference documents used during Estimate Reviews.

The first is business-partner-specific text; the second is documents attached to reviews.`,
    tags: ['admin', 'guidelines'],
  },
  {
    question: 'Who is Henry (the assistant on this page)?',
    answer: `Henry is the built-in help assistant for Modern Tools. Type a question in the search box and click "Ask Henry" — Henry answers using the curated articles above and knowledge about how the app is used. Henry only answers "how do I do X in Modern Tools" questions. For business rules, pricing, or anything Henry says he doesn't know, ask an admin directly.`,
    tags: ['help', 'henry'],
  },
  {
    question: 'Can Henry answer questions about how the app is built, its data, or its setup?',
    answer: `No. Henry only answers "how do I do X in Modern Tools." He won't discuss technology, security, data storage, integrations, business policy, pricing, or anything beyond how to use the app. Those questions get politely refused. If you're an admin or developer who needs that info, contact the tech lead directly.`,
    tags: ['help', 'henry'],
  },

  // ── Second batch: 20 additional how-to articles ─────────────────────────
  {
    question: 'How do I close a claim?',
    answer: `Admins can close a claim from the workspace toolbar (there's a Close/Approve action once it's been submitted). From the Dashboard, admins can also bulk-close: check the boxes next to multiple claims and click Close in the toolbar that appears. Closing removes the claim from the Dashboard's "open claims" view but keeps it visible on the All Claims page.`,
    tags: ['claims', 'close', 'workflow'],
  },
  {
    question: 'How do I reopen a closed claim?',
    answer: `Only admins can reopen. Find the claim on the All Claims page (it won't show on the Dashboard once closed), open it, and use the Reopen button in the workspace toolbar. That flips it back to Open and unlocks it for editing again.`,
    tags: ['claims', 'reopen', 'workflow'],
  },
  {
    question: `What's the difference between "Send Back" and "Reopen"?`,
    answer: `Both are admin-only and both undo a submitted state, but they're used for different situations:

- Send Back — the claim was submitted for review but needs edits. Send Back returns it to editable, keeps it Open, and clears the Completed phase. The assignee can continue working on it.
- Reopen — the claim was fully closed and needs to come back. Reopen flips Status from Closed back to Open, clears submitted state, and lets you continue working on it.

Rule of thumb: Send Back for "still open, just unlock for edits", Reopen for "bring back from closed".`,
    tags: ['claims', 'admin', 'workflow'],
  },
  {
    question: 'How do I bulk-submit multiple claims?',
    answer: `On the Dashboard (admin view), check the boxes next to the claims you want to submit. A blue toolbar appears at the top with a "Submit All" button. Click it and confirm — every selected claim that's currently Open gets submitted. Claims already submitted or closed are skipped, and the toolbar reports how many were skipped vs succeeded.`,
    tags: ['dashboard', 'bulk', 'submit'],
  },
  {
    question: 'How do I bulk-reassign multiple claims?',
    answer: `On the Dashboard (admin view), check the boxes next to the claims you want to move. A blue toolbar appears with a "Reassign to" dropdown — pick a person (or Unassigned), then click Confirm. All selected claims flip to the new assignee at once. Any failures are reported so you can retry.`,
    tags: ['dashboard', 'bulk', 'reassign'],
  },
  {
    question: 'How do I bulk-delete claims?',
    answer: `Admin only. On the Dashboard, check the boxes next to the claims, then click Delete in the blue toolbar. You'll get a confirmation prompt — deletion is permanent, so be sure. If you're just archiving a batch of finished work, use Close instead.`,
    tags: ['dashboard', 'bulk', 'delete'],
  },
  {
    question: 'How do I filter the Dashboard to just Completed claims?',
    answer: `Admins have a "Completed" toggle button at the top-right of the Dashboard next to New Claim. Click it to show only claims currently in the Completed phase (i.e. submitted claims that haven't been closed yet). Click it again to clear the filter. Non-admins don't see this button — Completed claims stay mixed in with the rest of their queue.`,
    tags: ['dashboard', 'filter', 'phases'],
  },
  {
    question: 'How do I download the ACV Report PDF?',
    answer: `Inside the claim, go to the ACV Report tool. Once you've picked comps and calculated ACV, there's a "Generate PDF" (or similarly labeled) button that produces the final ACV Report. It downloads to your browser and also auto-files into the claim's Documents tab so anyone on the team can grab it later.`,
    tags: ['acv', 'reports', 'pdf'],
  },
  {
    question: 'How do I generate the Award letter?',
    answer: `Inside the claim, open the Award tab. Fill in the ACV amount and any other required fields. Hit the Generate button and the Award letter PDF downloads to your browser plus auto-files to the Documents tab.`,
    tags: ['award', 'reports', 'pdf'],
  },
  {
    question: 'How do I generate the Closing Notes PDF?',
    answer: `Inside the claim, open the Closing Notes tab. Fill in the notes for the relevant type (ACV, ACV → Umpire, or DV). Click Generate — the PDF downloads and auto-files to Documents.`,
    tags: ['notes', 'reports', 'pdf'],
  },
  {
    question: 'How do I generate an Invoice for a claim?',
    answer: `Inside the claim, open the Invoice tab. Add line items (description + amount). The invoice picks a long or very-long template automatically depending on how many line items you have. Hit Generate — the PDF downloads and auto-files to Documents.

There's also a standalone Invoice builder at Reports → Invoice for one-off invoices that don't belong to a specific claim.`,
    tags: ['invoice', 'reports', 'pdf'],
  },
  {
    question: `What's the Summary tab for?`,
    answer: `The Summary tab produces a one-page recap of the claim (dates, vehicle, ACV amount, notes) that you can print or attach to correspondence. It pulls from the other tabs (Claim Info, ACV, DV) so you don't retype anything. Every claim gets one Summary and it lives at the same URL — updates auto-save alongside the rest of the workspace.`,
    tags: ['summary', 'reports'],
  },
  {
    question: `What is Comp Finder and how do I use it?`,
    answer: `Comp Finder is inside the ACV Report tool. It searches for comparable vehicles based on the loss vehicle's year, make, model, trim, mileage, and ZIP. You pick which comparables to include, adjust for mileage and year differences, and Modern Tools computes the ACV from your selections. Toggle between Comp Finder and Loss Search using the switch inside the ACV tab.`,
    tags: ['acv', 'comp-finder', 'tools'],
  },
  {
    question: 'What is Loss Search?',
    answer: `Loss Search is the second data source inside the ACV Report tool, alongside Comp Finder. Instead of retail listings, it finds comparable losses (vehicles that were actually sold or salvaged) so you can build an ACV based on similar loss transactions. Use the toggle inside the ACV tab to switch between Comp Finder and Loss Search.`,
    tags: ['acv', 'loss-search', 'tools'],
  },
  {
    question: 'How do I add adjustments to an ACV calculation?',
    answer: `Inside the ACV Report tool, after you've picked your comparables, scroll to the Adjustments section. There you can set the Dealer vs. Private adjustment (default -$500), tax rate, and any custom adjustments. The Live ACV Preview at the top updates in real time as you change values. Adjustments apply to the average of your selected comps before tax.`,
    tags: ['acv', 'adjustments'],
  },
  {
    question: 'What are the four Diminished Value report templates?',
    answer: `The Diminished Value tab produces the report using one of four template variants, based on who the report is for:

- Nationwide + Attorney
- Nationwide + Sedgwick
- W-Loss + Attorney
- W-Loss + Sedgwick

Pick the report type (Insurance vs Attorney) and the specific carrier (Nationwide vs W-Loss) at the top of the DV tab, then fill in the vehicle and damage details. Generate produces the correctly-branded PDF and auto-files it to Documents.`,
    tags: ['dv', 'reports', 'templates'],
  },
  {
    question: 'How do I send a message about a claim to another team member?',
    answer: `Every claim has a message thread. Open the claim, look for the Messages icon in the workspace, and post there — you can pick which teammates to notify (admins + the current assignee). Messages are per-claim and stay in the thread so anyone opening the claim later sees the history.`,
    tags: ['messages', 'communication'],
  },
  {
    question: 'Where do I see unread messages?',
    answer: `The Messages link in the top nav (or on the Dashboard header) shows a small blue badge with your unread count. Click it to see every claim with an unread message for you. Opening a claim's message thread marks its messages as read for your user.`,
    tags: ['messages', 'unread'],
  },
  {
    question: 'How do I update my own profile (name, phone, address, password)?',
    answer: `Click your name in the top-right of the header to open the menu. Two options there:

- My Profile — edit your display name, phone, and address. Admins also set your role, licensed states, and fees here.
- Account & Password — change your login email or password.

Changes save immediately.`,
    tags: ['profile', 'account'],
  },
  {
    question: 'What does the license expiration banner mean?',
    answer: `The yellow banner at the top of the Dashboard warns you when one of your appraiser licenses is expiring soon (or has already expired). It shows which state and the expiration date. Update it at your profile page: click your name in the top-right → My Profile → Licenses. Add the new expiration date or upload the renewal document.`,
    tags: ['licenses', 'dashboard', 'banner'],
  },
]

// Dedup: don't re-insert a question that's already there (case-insensitive).
const { data: existing } = await admin.from('help_articles').select('question')
const existingSet = new Set((existing ?? []).map((r) => r.question.trim().toLowerCase()))
const toInsert = seeds.filter((s) => !existingSet.has(s.question.trim().toLowerCase()))
if (toInsert.length === 0) {
  console.log('All seed questions already present. Nothing to insert.')
  process.exit(0)
}

const { data, error } = await admin.from('help_articles').insert(toInsert).select('id, question')
if (error) { console.error(error); process.exit(1) }
console.log(`Inserted ${data.length} articles:`)
for (const r of data) console.log('  -', r.question)
