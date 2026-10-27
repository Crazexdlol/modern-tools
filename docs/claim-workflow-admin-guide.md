# Claim Workflow — Admin Onboarding Guide

Written for someone who just joined Modern Appraisers / HamsPortal and is in charge of creating claims and reassigning them to appraisers. No prior insurance or HamsPortal knowledge assumed.

Last updated: 2026-10-21

---

## Background — what Modern Appraisers does

Modern Appraisers is an **independent appraisal company**. When an insurance company and a vehicle owner can't agree on what a damaged vehicle is worth (or how much a repair should cost), the vehicle owner can invoke the "appraisal clause" in their auto insurance policy. That triggers a formal process where each side hires their own vehicle appraiser, those two appraisers try to settle on a number, and if they can't agree, a neutral third party called an **umpire** decides.

**We work for the vehicle owner (the insured).** We write a professional valuation / damage report backing up our number, and then we negotiate against the insurance company's appraiser to reach a settlement.

Three people / roles show up on every claim:

| Role | Short name used in the app | Who they are |
|---|---|---|
| **Our Appraiser** | "Appraiser" | A Modern Appraisers employee working on the vehicle owner's behalf. The person doing the field inspection, writing the report, and negotiating. |
| **Opposing Appraiser** | "OA" or "IA" (Independent Appraiser) | The insurance company's hired appraiser on the other side. We negotiate against them. |
| **Umpire** | "Umpire" | Neutral third party, only invoked if our appraiser and the OA can't agree. Decides the final number. |

Clients that send us work (Sedgwick, Progressive, Claim Solution, GEICO, etc.) are mostly third-party claims-handling platforms that route insurance claims to us. The actual carrier (the insurance company) sits behind them.

---

## The lifecycle of a claim in one picture

Every claim goes through **four stages**, in order:

1. **Main** — the appraiser is actively working the file (inspecting, writing the report, negotiating).
2. **QC** — Quality Control. Admin reviews the finished report before it goes out.
3. **Billing / Delivery** — the invoice is prepared and the report is delivered.
4. **Payment** — we're waiting for the client to pay.

When payment lands, the claim is **closed**.

The stages are rigid and claims always flow forward through them. Separately, a claim can carry a **status phase** (Hold, Pending Information, Umpire, etc.) — see the Phases section below.

---

## The three fields you need to understand

| Field | What it means | Who sets it |
|---|---|---|
| **Assignee** | Who is actively working the claim right now at the current stage. This changes every time the claim moves forward (Main → QC → Billing → Payment) because a different person owns each stage. | Admin — you pick it when creating the claim and you can change it anytime via the Reassign button. |
| **Negotiating Appraiser** | The person who will be named on the final report and who will actually negotiate against the OA. This is a label on the claim — it doesn't automatically move the claim anywhere. | Admin — dropdown in the top-right corner of the claim view. |
| **Rough Numbers Inbox Owner** | ONE single person (currently **Wendy Castro**) who receives every claim flagged "needs rough numbers" after the appraiser's first pass. Her job is to send that preliminary number to the client, get the client's approval, then hand the claim back to the appraiser so they can write the full report. | Site setting — admins change it in the Settings area. |

Mental model: **Assignee is a stage-level role (who's working it now). Negotiating Appraiser is a claim-level label (whose name is on the report). Rough Numbers Inbox is a client-approval relay (one person).**

The same person can hold more than one role. Example: George can be both the Assignee AND the Negotiating Appraiser on his own claim — meaning he writes the report AND he negotiates it himself.

---

## Creating a claim — what to fill in

1. Go to the new-claim screen.
2. Fill in **Claim Info**: owner name, VIN (the 17-character Vehicle Identification Number stamped on the dashboard), insurance company, date of loss, etc.
3. Pick the **Claim Types** chips. These describe what kind of work this claim is:
   - **ACV** = Actual Cash Value. A total-loss valuation of the vehicle.
   - **DV** = Diminished Value. The reduction in a vehicle's market value after a repair.
   - **Estimate** = Repair cost dispute (the shop and the insurance company disagree on the cost of repair).
   - **Storage** = Storage fee negotiation (vehicle has been sitting at a shop/yard and the insurer owes storage fees).
   - **LOU** = Loss of Use (daily rental-equivalent fees owed to the owner while their car is out of service).
   - **Salvage** = Salvage value negotiation.
   - **Desk** = Desk review (no field inspection — appraiser works from photos/paperwork only).
   - **Specialty** = Classic / exotic / modified vehicles.
   - **Full** = Full-detail report (usually larger scope).
   - **Umpire** = This claim is going to or came from umpire.
   - **RTA** = Right To Appraisal. **This is important.** Flip it on if we're actually going to NEGOTIATE on behalf of the owner. If RTA is OFF, this claim is **report-only** — we write a report, send it to the client, and the file never goes through a negotiation step. If RTA is ON, there will be an OA to negotiate against.
   - **Other** = catch-all. Shows every tool tab (used when the claim doesn't fit a specific category).

   Most Sedgwick assignments automatically turn RTA on because Sedgwick's client-default is set to RTA. Many other clients don't.
4. If the claim is ACV / DV / Estimate AND RTA is ON, you MUST fill in two more fields before the Create Claim button will light up:
   - **Opposing Appraiser** (the OA's name)
   - **Ins. Co. Offer** (the insurance company's current offer, in dollars)
5. **Needs Rough Numbers?** toggle. Leave this ON if the client needs to approve a preliminary number before the appraiser writes the full report. (Sedgwick's default is ON.) Flip it OFF if the appraiser should just go straight to writing the final report.
6. Set the **Negotiating Appraiser** dropdown. Think about who's going to NEGOTIATE this file, not just who writes the report:
   - If one person is doing the whole thing (field work + report + negotiation): set Negotiating Appraiser = Assignee. The claim stays with them end-to-end.
   - If one appraiser is going to write the report and a DIFFERENT one is going to negotiate: set Negotiating Appraiser = the person who will negotiate (not the person writing the report). When the report-writer finishes, the system will automatically prompt them to hand the file off to the negotiator.
7. Click **Create Claim**. The MA# (our internal file number) is assigned automatically.

---

## The two "handoff" flows — the thing most admins get confused by

There are **two completely separate** handoff concepts. They can both apply to the same claim, or neither. Order matters: **Rough Numbers always happens first, Negotiator handoff always happens second.**

---

### Handoff 1 — Rough Numbers (Wendy's loop, optional)

Only applies when the claim was created with **Needs Rough Numbers = ON**.

What a "rough number" is: before an appraiser spends 2-5 hours writing a full valuation report, the client sometimes wants to see a preliminary number — essentially "based on your first look, roughly what are we settling at?" — and get their own internal sign-off before authorizing the full report. This saves everyone time if the number is wildly different from what the client expected.

The flow:

1. **An admin (usually Wendy) creates the claim** with Needs Rough Numbers ON and assigns it to an appraiser.
2. **The appraiser works the file** — inspects the vehicle, pulls comps, calculates a preliminary number inside the report. When they're done with that first pass, they click **Submit for Rough Numbers**. (The Submit button automatically renames itself to this when the claim is in rough-numbers mode — it's the same button, different label.)
3. **The claim is handed to Wendy Castro.** She's now the assignee.
4. **Wendy sends the preliminary number to the client and waits for their approval.** This is a HUMAN step on her end — email, phone call, whatever. She's not doing math; she's the relay between us and the client.
5. **Once the client approves**, Wendy reassigns the claim back to the appraiser. **This reassign marks the claim "rough-numbers approved" — the claim is now permanently out of rough-numbers mode on this file.** It cannot go back into rough-numbers mode even if someone tries to resubmit.
6. **The appraiser finalizes the report** — writes the full version around the now-approved preliminary number.
7. From here, the normal "either Submit for QC OR hand off to the negotiator" decision happens (see Handoff 2).

---

### Handoff 2 — Negotiator (optional, only applies to RTA claims)

Only applies when **all three** of these are true at the moment the appraiser is ready to send the claim onward:

1. The claim has the **RTA** chip (we're actually negotiating this file, not just writing a report).
2. The **Negotiating Appraiser** on the claim is set AND is a **different person** than the current assignee.
3. Rough Numbers is either not needed on this claim OR already approved (Wendy's loop is done).

When all three are true, the appraiser's normal "Submit for QC" button is **hidden** and replaced with a **Complete Report** button. Clicking it hands the claim off to the Negotiating Appraiser (so THEY can do the negotiation). On ACV claims the appraiser gets a small picker where they can confirm the target or override it to a different person; on non-ACV claims it just hands off directly without a picker.

If any of those three conditions is false, Complete Report doesn't show — the appraiser just sees **Submit for QC** and the claim goes directly to QC when they're done.

---

## What the appraiser sees — button logic in one table

Assuming the claim is assigned to them and in the Main stage:

| State of the claim | Button they see | What happens on click |
|---|---|---|
| Needs Rough Numbers = ON AND Wendy hasn't reassigned back yet | **Submit for Rough Numbers** | Claim goes to Wendy |
| Rough numbers done or not needed, AND RTA is on + a different person is the Negotiating Appraiser | **Complete Report** | Claim hands off to the Negotiating Appraiser (ACV claims get a picker to override) |
| Rough numbers done or not needed, AND (no RTA OR Negotiating Appraiser = this same appraiser) | **Submit for QC** | Claim moves to QC stage |

---

## Reassigning a claim (admin)

In the claim toolbar, click the **Reassign** button. A dialog opens:

1. **Target picker** — pick who the claim is being reassigned to. You can also pick "Unassigned."
2. **Phase handling** — this section only shows up if the claim currently has a phase set:
   - If the phase is **Completed** → italic note "Phase will be cleared (new assignee hasn't submitted)." No choice; this is enforced because the Completed marker belongs to the prior appraiser's submit, not the new assignee.
   - If the phase is anything else (Hold / Umpire / Pending Information / Pending Repairs / etc.) → a **Keep | Drop** choice. Default is Keep. The Keep option shows a colored pill with the phase name next to it so you can see exactly what you'd be preserving.
3. Click Reassign to confirm.

What the reassign actually does (so you can explain it if someone asks):

- Changes the assignee to the new person.
- Resets the clock on time-based reminders (fresh 48-hour status-request window).
- Clears any pending submission the prior appraiser had made — the new assignee starts fresh.
- Keeps, drops, or auto-clears the phase per the rule above.
- **Preserves the Negotiating Appraiser.** Reassigning the stage-level worker does NOT change who's named as the negotiator on the file — that's a separate decision made via the Negotiating Appraiser dropdown.

**Common question: "I want person X to negotiate this claim."**
Answer: **don't use Reassign** for that. Use the **Negotiating Appraiser dropdown** at the top-right of the claim. Reassign changes who's actively working the file right now at this stage; the dropdown changes who's named as the negotiator on the file.

---

## Phases (the colored pill at the top of the claim)

A phase is an optional LABEL that tells everyone the current situation on this claim — things like "waiting for information from the client" or "on hold" or "went to umpire." Phases are different from stages: stages are the forward pipeline (Main → QC → Billing → Payment), phases are a sticky label that can be anything the admin wants.

- Each phase has a distinct color (green / red / orange / blue / etc.). The chip at the top of the claim renders in that color, matching the color in the dashboard view and the reassign dialog.
- The **Completed** phase gets set automatically when the appraiser submits — it means "the appraiser is done, waiting for admin review."
- Some phases "pause cycle time," meaning the time a claim spends in that phase doesn't count toward turnaround metrics. Hold, Pending Information, and Pending Repairs are typical examples. Which phases pause cycle time is admin-configurable per phase.
- Phases are changed via the **Finalize dropdown → Change Phase** in the claim toolbar.

---

## Full lifecycle example — Sedgwick RTA claim with rough numbers

Walking a full file end-to-end so you can see every piece in context.

1. **Wendy creates the claim.** Owner is John Smith, 2023 Honda Civic, Sedgwick, total-loss ACV dispute. Needs Rough Numbers = ON (Sedgwick default). Claim Types: RTA + ACV. Negotiating Appraiser dropdown = Alex (he'll negotiate). Assignee = George (he'll do the field work and write the report).
2. **George inspects the car, pulls market comps, calculates a preliminary total-loss number.** He writes a first-pass report around that number. His Submit button says "Submit for Rough Numbers." He clicks it. The claim moves to Wendy.
3. **Wendy emails Sedgwick with the preliminary number.** Sedgwick replies two days later saying "OK, write it up."
4. **Wendy reassigns the claim back to George.** The claim is now marked rough-numbers-approved — permanently out of rough-numbers mode.
5. **George finalizes the report** (writes the full version). When he's done, his Submit button now says "Complete Report" (because RTA is on and the Negotiating Appraiser is Alex, not George). He clicks Complete Report. The claim hands off to Alex.
6. **Alex negotiates with Sedgwick's OA.** They email back and forth for a week and eventually agree on a number. When Alex is ready, his button says "Submit for QC" (he's the negotiator, so no further handoff needed). He submits.
7. **Claim enters QC stage.** Phase becomes Completed automatically. Admin reviews the final report and approves → stage flips to Billing/Delivery.
8. **Invoice is prepared and sent to Sedgwick. Claim moves to Payment stage.** When Sedgwick pays, the claim is closed.

For comparison — a non-RTA report-only Progressive claim: Wendy creates it, assigns to George, Needs Rough Numbers OFF, RTA OFF. George inspects, writes the report, clicks **Submit for QC** directly. One pass, no rough-numbers loop, no negotiator handoff. Done.

---

## Red flags / things that will trip you up

- **"The Submit for QC button disappeared from my appraiser's view."** The appraiser is on an RTA claim with a different Negotiating Appraiser and rough-numbers is done. The system is correctly asking them to Complete Report (hand off). If that's wrong for this file, either (a) change the Negotiating Appraiser to equal the Assignee so no handoff is needed, or (b) remove the RTA chip if this isn't actually a value negotiation. Otherwise let the appraiser hit Complete Report — it'll hand off correctly.
- **"The claim keeps going to Wendy."** The Needs Rough Numbers flag is still on and Wendy hasn't reassigned back yet. Either Wendy needs to complete the client-approval step and reassign the claim back to the appraiser (which marks it rough-numbers-done), or Needs Rough Numbers was turned on at creation by mistake and should be flipped off.
- **"I reassigned a claim and the phase disappeared."** You probably picked Drop in the reassign dialog. Default is Keep. If you did this by accident, re-set the phase via Finalize → Change Phase in the toolbar.
- **"The Negotiating Appraiser keeps auto-changing after I reassign."** It doesn't. Reassign explicitly preserves the Negotiating Appraiser. If the dropdown is showing stale data in your tab, hard-refresh the page.
- **"An appraiser is stuck on Complete Report but should go straight to QC."** They're on an RTA claim with a different Negotiating Appraiser set. Three ways out: (a) change the Negotiating Appraiser dropdown to the current Assignee (easiest), (b) take RTA off the claim if it isn't actually a value negotiation, or (c) let them click Complete Report — the picker on ACV claims lets them override the target.
- **"Wendy is drowning in rough-numbers claims."** Every claim with Needs Rough Numbers = ON that an appraiser submits lands with her. If a client has rough-numbers default on but a particular file genuinely doesn't need the client-approval loop (e.g. a straightforward case where the client has already pre-approved the appraiser going straight to the final report), flip the toggle off at creation.

---

## Glossary

| Term | Meaning |
|---|---|
| **ACV** | Actual Cash Value — a total-loss valuation of the vehicle. |
| **Appraisal Clause** | A standard provision in auto insurance policies that lets both the owner and the insurer invoke a formal appraisal when they can't agree on value. |
| **Appraiser** | The person doing the valuation / damage report. "Our appraiser" is a Modern Appraisers employee. |
| **Assignee** | The person currently responsible for working the claim at its current stage. |
| **Carrier** | The actual insurance company (GEICO, Progressive, etc.) — as opposed to the third-party platform (Sedgwick, Claim Solution) that routes assignments to us. |
| **CL #** | Claim number assigned by the insurance company. |
| **Client** | Whoever hired us for this claim (usually Sedgwick, Progressive, Claim Solution, GEICO, etc.). |
| **Complete Report** | The button an appraiser clicks to hand the claim off to the Negotiating Appraiser (only shows up on RTA claims where someone different is set as the Negotiating Appraiser). |
| **DV** | Diminished Value — the loss in resale value a vehicle suffers after being repaired. |
| **Estimate (claim type)** | A repair-cost dispute (the shop and the insurance company disagree on the cost of fixing the vehicle). |
| **Finalize dropdown** | A button in the claim toolbar that opens a menu for admin-only actions: Change Phase, Cancel Claim, Delete Claim, etc. |
| **IA** | Independent Appraiser — the insurance company's appraiser on the other side (we negotiate against them). Same as "Opposing Appraiser" / "OA." |
| **Ins. Co. Offer** | The insurance company's current settlement offer, in dollars. Required field at creation on RTA ACV/DV/Estimate claims. |
| **Insured** | The vehicle owner (the person whose policy was triggered). We work on their behalf. |
| **LOU** | Loss of Use — daily rental-equivalent fees the owner is owed while their vehicle is out of service. |
| **MA #** | Modern Appraisers file number — our internal reference, auto-assigned when the claim is created. |
| **Main (stage)** | The first stage of a claim — the appraiser is actively working the file. |
| **Negotiating Appraiser** | The person named on the final report who will negotiate the file against the OA. |
| **OA** | Opposing Appraiser — same as IA. |
| **Phase** | An optional status label on a claim (Hold, Pending Information, Umpire, Completed, etc.). Separate from stages. |
| **QC** | Quality Control — the stage after Main where admin reviews the appraiser's finished report before it goes out. |
| **Rough Numbers** | A preliminary number sent to the client for approval BEFORE the appraiser writes the full report. Used when the client wants to pre-approve the ballpark before authorizing the full work. |
| **Rough Numbers Inbox Owner** | The one person (currently Wendy Castro) who receives rough-numbers claims from appraisers and relays them to the client for approval. |
| **RTA** | Right To Appraisal — a claim-type chip that means we're actually going to negotiate this file (not just write a report). If RTA is off, no negotiation step happens; the file is report-only. |
| **Salvage** | Salvage value negotiation. |
| **Stage** | A step in the forward pipeline a claim moves through: Main → QC → Billing/Delivery → Payment → Closed. |
| **Status Phase** | Same as Phase — the colored label pill at the top of the claim. |
| **Submit for QC** | The normal "I'm done with this stage" button an appraiser clicks to send the claim to QC. |
| **Submit for Rough Numbers** | The same button, auto-renamed when the claim is in rough-numbers mode. Sends the claim to the Rough Numbers Inbox Owner (Wendy) instead of QC. |
| **Umpire** | A neutral third party invoked when our appraiser and the OA can't reach agreement. Decides the final number. |
| **VIN** | Vehicle Identification Number — the 17-character code stamped on the dashboard that uniquely identifies a vehicle. |
