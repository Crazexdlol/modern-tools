import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadVoiceProfile } from './voice'
import { fillAwardPdf } from '@/lib/acv/award-pdf-filler'

export type NegotiationState =
  | 'oa_accepted_our_offer'    // OA has said yes to our number — send award, don't re-litigate
  | 'oa_counter_offered'       // OA has given us a specific counter figure to engage with
  | 'oa_argued_no_number'      // OA is making arguments (adjustments, comp critiques) but hasn't landed on a number
  | 'oa_stalling'              // No substance, just delays / nudges / "wrap this up" with NO prior acceptance of our offer
  | 'opening_move'             // First substantive exchange, no offer on the table yet
  | 'awaiting_oa_report'       // We've asked for their report, they haven't sent it — nothing else to say until it lands
  | 'other'

export interface DraftOutput {
  negotiation_state: NegotiationState
  state_reasoning: string        // short — why we classified this way, with quoted evidence
  vehicle_value: string
  oa_report_breakdown: string
  our_comps_defense: string
  tactic: string
  draft_email: string
  confidence: 'low' | 'medium' | 'high'
  missing_info: string[]
  // Populated by Claude ONLY when state === 'oa_accepted_our_offer'. The
  // dollar figure both sides agreed to. Server uses this to auto-file the
  // award PDF (see award_document_path below).
  agreed_amount?: number | null
  // Populated server-side after we build + upload the award PDF. UI renders
  // a "Download award" button when this is set.
  award_document_path?: string | null
  award_document_name?: string | null
}

export interface GenerateDraftArgs {
  supabase: SupabaseClient
  profileId: string
  threadId: string
  instructions: string | null
}

export interface GenerateDraftResult {
  draftId: string
  version: number
  output: DraftOutput
  model: string
}

const MAX_MSG_CHARS = 2_500  // per message in the thread; keeps prompt bounded

export async function generateDraft(args: GenerateDraftArgs): Promise<GenerateDraftResult> {
  const { supabase, profileId, threadId, instructions } = args

  const { data: thread, error: threadErr } = await supabase
    .from('email_threads')
    .select('id, subject_normalized, negotiation_case_id')
    .eq('id', threadId)
    .maybeSingle()
  if (threadErr || !thread) throw new Error('Thread not found')
  if (!thread.negotiation_case_id) throw new Error('Thread not linked to a claim')

  const { data: caseRow } = await supabase
    .from('negotiation_cases')
    .select('id, claim_id, company_id, oa_email, oa_name')
    .eq('id', thread.negotiation_case_id)
    .maybeSingle()
  if (!caseRow) throw new Error('Case row missing')

  const { data: claim } = await supabase
    .from('acv_history')
    .select('id, ma_number, vehicle, vin, status, claim, comps, adjustments, result, reports_state')
    .eq('id', caseRow.claim_id)
    .maybeSingle()
  if (!claim) throw new Error('Linked claim not found')

  const { data: messages } = await supabase
    .from('email_messages')
    .select('id, from_addr, from_name, sent_at, folder, subject, text_body')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })

  const voice = await loadVoiceProfile(supabase, profileId)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Compose the thread as chronological text.
  const threadText = (messages ?? []).map(m => {
    const dir = m.folder.toLowerCase().includes('sent') ? 'US → OA' : 'OA → US'
    const body = (m.text_body ?? '').slice(0, MAX_MSG_CHARS)
    return `[${dir}] ${m.sent_at}
From: ${m.from_name ? `${m.from_name} <${m.from_addr}>` : m.from_addr}
Subject: ${m.subject}

${body}`
  }).join('\n\n---\n\n')

  const claimSummary = summarizeClaim(claim)
  const voiceBlock = voice ? formatVoiceBlock(voice) : 'No voice profile trained yet. Use a firm, professional, appraiser tone.'

  const system = `You are the AI writing assistant for Henry, an independent insurance appraiser who represents insureds against opposing appraisers (OAs) and insurance-company adjusters in auto total-loss (ACV) and diminished-value (DV) disputes.

You draft Henry's REPLY to the most recent inbound message in a negotiation thread. He copies your draft into Outlook and sends it himself — you never send anything.

## CRITICAL: Detect the negotiation state FIRST, then draft accordingly.

Before writing any email, read the ENTIRE chronological thread and determine which state applies. This determines the entire strategy — get it wrong and the draft will be useless or embarrassing.

**oa_accepted_our_offer**: The OA has agreed to our last dollar offer. In appraiser-to-appraiser language, acceptance often looks like:
  - "Lets go ahead and get this one wrapped up!" (after our offer is on the table)
  - "Sounds good, let's finalize"
  - "I'll agree to that number"
  - "Let's wrap this / close this out / move forward"
  - "did you see my note here?" (chasing us for the award after agreement)
  Anything that reads as "yes let's finalize" after Henry sent a specific offer = acceptance. When in doubt about this state, LEAN toward acceptance if the OA has stopped arguing about substance and is only asking to close.

**oa_counter_offered**: OA gave a specific counter dollar figure ("I have $X" / "my number is $X"). Engage on that figure specifically.

**oa_argued_no_number**: OA is making substantive arguments (adjustment amounts, comp critiques, feature premiums) but hasn't landed on a final number. Engage the arguments.

**oa_stalling**: Just nudges/delays with NO prior acceptance of any offer AND no substantive counter. E.g. "any update?" when we've been waiting on their report.

**awaiting_oa_report**: We asked for their report; they've promised but haven't sent it. Nothing to negotiate until it lands — draft is a firm nudge.

**opening_move**: First substantive exchange, no offer on the table yet.

Sequence rule: if Henry made a specific offer (e.g. "$29,000") and the OA's most recent messages after that offer are ONLY nudges to close ("wrap this up", "let's finalize", "did you see my note?") with NO new number and NO new substantive arguments, that is **oa_accepted_our_offer**. NOT stalling. NOT "still arguing." Look at chronological sequence.

## Draft strategy by state

- **oa_accepted_our_offer** → SHORT, warm, professional email. Confirm the agreed number in ONE line. State that the award is attached (Henry attaches it before sending — you always assume it will be). NO re-litigating comps, NO defending our number, NO demanding their report. Do not undermine an agreement you already have. tactic = "Send the award for $X. Confirm and finalize." missing_info can be empty or trivial.
- **oa_counter_offered** → engage the counter figure directly; hold / counter / concede as appropriate; cite specific comps.
- **oa_argued_no_number** → address each argument; demand a number and supporting comps; keep our position anchored.
- **oa_stalling** → firm nudge with a specific deadline; hint at appraisal-clause / umpire escalation if applicable.
- **awaiting_oa_report** → firm nudge, deadline, no substance beyond "send your report".
- **opening_move** → concise, professional, state our ACV with confidence, invite discussion.

## Non-negotiables

- Every dollar figure and every comp you cite MUST be grounded in the claim data or the thread. NEVER fabricate.
- Match Henry's voice + tactics from the voice profile.
- If missing info, list it in missing_info instead of inventing.
- Do not re-argue points the OA has already conceded or dropped.
- Do not treat agreement as ongoing dispute.

## HARD-BANNED language and content

Henry represents the insured and CANNOT appear to have delayed the claim. Never write, mention, or excuse delay under any circumstances:
- NEVER say "sorry for the delay", "apologies for the delay", "apologies for the wait", "sorry it took", "thanks for your patience", "appreciate your patience", or ANY phrase that acknowledges, explains, or apologizes for a lag in response.
- NEVER offer a reason for why a reply took time (busy schedule, other cases, holidays, etc). The email should feel like it was sent when it was needed — not late.
- If timing needs to be acknowledged, Henry will add it himself via the instructions field. Do not add it preemptively.

Deductible is NOT relevant to ACV or DV negotiations:
- NEVER include "deductible", "deductible amount", or any deductible-related note in missing_info for an ACV or DV thread.
- NEVER mention the deductible in the draft_email itself. It's a separate accounting concern between the insured and their carrier; it does not affect our ACV/DV number or the OA's number.

Do NOT list "award/agreement document template" or similar system-plumbing items in missing_info. If the state is oa_accepted_our_offer, the award PDF is auto-generated separately, do not treat its absence as missing info.

## Draft email formatting rules — STRICT

These apply to every draft you write, without exception:

- **NEVER use em-dashes (—) or en-dashes (–)** for any purpose. Use commas, semicolons, colons, or full stops instead. Regular hyphens in compound words ("well-known") and phone numbers (702-321-5930) are fine, but the long dashes are banned.
- **NEVER restate the vehicle year/make/model, VIN, or claim number** in the body of the email. The email subject line and the quoted thread already carry that context. Referencing "the vehicle" or "this claim" is fine; naming "the 2017 Tesla Model X" or "Claim# AU10838577" is redundant and looks robotic.
- **End the draft with the closing salutation ONLY** (e.g. "Kind regards,"). NO name, NO title, NO contact block, NO company name, NO office/email/website lines. Henry's Outlook auto-appends his signature block on send; if you include one, it will duplicate. This is non-negotiable — the last non-blank line of every draft_email must be a bare closing salutation followed by a comma.
- Keep drafts as SHORT as the state permits. Acceptance replies should be 3-4 short sentences plus the closing. Do not pad.

Call the save_negotiation_draft tool exactly once with your analysis. Verbatim quotes with punctuation are fine — the tool handles escaping.`

  const user = `## HENRY'S VOICE PROFILE
${voiceBlock}

## THE CLAIM
${claimSummary}

## THE EMAIL THREAD (chronological)
${threadText}

${instructions ? `## SPECIAL INSTRUCTIONS FOR THIS DRAFT\n${instructions}\n` : ''}
Now produce the JSON.`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6_000,
    system,
    tools: [{
      name: 'save_negotiation_draft',
      description: 'Persist the negotiation-state analysis + drafted reply.',
      input_schema: {
        type: 'object',
        properties: {
          negotiation_state: {
            type: 'string',
            enum: ['oa_accepted_our_offer', 'oa_counter_offered', 'oa_argued_no_number', 'oa_stalling', 'awaiting_oa_report', 'opening_move', 'other'],
            description: "Read the whole thread and classify the current state per the state rules in the system prompt.",
          },
          state_reasoning: { type: 'string', description: '1-3 sentences with quoted evidence establishing the state. Cite messages by date and phrase.' },
          agreed_amount:   { type: ['number', 'null'], description: "REQUIRED if state is oa_accepted_our_offer (the dollar figure both sides agreed to, e.g. 29000). Null in every other state." },
          vehicle_value:      { type: 'string', description: "1-3 sentences on the vehicle's determined value." },
          oa_report_breakdown:{ type: 'string', description: 'What the OA has claimed and issues with it.' },
          our_comps_defense:  { type: 'string', description: "Defense of our comps if the state is a live dispute; otherwise 'N/A — not in dispute'." },
          tactic:             { type: 'string', description: 'The recommended play in one paragraph. Must match the state.' },
          draft_email:        { type: 'string', description: "The actual reply in plain text, in Henry's voice. Length + tone matches the state. NO delay apologies, NO deductible, NO em-dashes, NO signature block after the closing salutation." },
          confidence:         { type: 'string', enum: ['low', 'medium', 'high'] },
          missing_info:       { type: 'array', items: { type: 'string' }, description: "Items you couldn't find. Must NOT include deductible or award-doc-template items." },
        },
        required: [
          'negotiation_state', 'state_reasoning', 'vehicle_value',
          'oa_report_breakdown', 'our_comps_defense', 'tactic', 'draft_email',
          'confidence', 'missing_info',
        ],
      },
    }],
    tool_choice: { type: 'tool', name: 'save_negotiation_draft' },
    messages: [{ role: 'user', content: user }],
  })

  const toolUse = resp.content.find(c => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'save_negotiation_draft') {
    throw new Error('Claude did not call save_negotiation_draft — got: ' + resp.content.map(c => c.type).join(', '))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = toolUse.input as any

  const STATES: NegotiationState[] = ['oa_accepted_our_offer', 'oa_counter_offered', 'oa_argued_no_number', 'oa_stalling', 'awaiting_oa_report', 'opening_move', 'other']
  const agreedAmountRaw = Number(parsed.agreed_amount)
  const agreedAmount = Number.isFinite(agreedAmountRaw) && agreedAmountRaw > 0 ? agreedAmountRaw : null
  const output: DraftOutput = {
    negotiation_state: STATES.includes(parsed.negotiation_state) ? parsed.negotiation_state : 'other',
    state_reasoning: String(parsed.state_reasoning ?? ''),
    vehicle_value: String(parsed.vehicle_value ?? ''),
    oa_report_breakdown: String(parsed.oa_report_breakdown ?? ''),
    our_comps_defense: String(parsed.our_comps_defense ?? ''),
    tactic: String(parsed.tactic ?? ''),
    draft_email: scrubBannedPhrases(String(parsed.draft_email ?? '')),
    confidence: (['low', 'medium', 'high'] as const).includes(parsed.confidence) ? parsed.confidence : 'medium',
    missing_info: (Array.isArray(parsed.missing_info) ? parsed.missing_info.map(String) : [])
      .filter((item: string) => !isBannedMissingInfo(item)),
    agreed_amount: agreedAmount,
    award_document_path: null,
    award_document_name: null,
  }

  // If the negotiation reached acceptance, auto-generate + file the Award PDF
  // so Henry can download it right from the workspace and the claim's
  // Documents tab picks it up on next open.
  if (output.negotiation_state === 'oa_accepted_our_offer' && agreedAmount && agreedAmount > 0) {
    try {
      const filed = await buildAndFileAward({
        supabase,
        claim,
        agreedAmount,
      })
      if (filed) {
        output.award_document_path = filed.path
        output.award_document_name = filed.name
      }
    } catch (e) {
      console.error('[draft] award auto-generation failed:', e)
      // Non-fatal — the draft still lands, Henry can generate the award
      // manually from the Award tab if this failed.
    }
  }

  // Persist a new version.
  const { data: existing } = await supabase
    .from('negotiation_drafts')
    .select('version')
    .eq('case_id', caseRow.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const version = (existing?.version ?? 0) + 1

  const { data: inserted, error } = await supabase
    .from('negotiation_drafts')
    .insert({
      case_id: caseRow.id,
      version,
      instructions,
      output,
      model: 'claude-sonnet-4-6',
    })
    .select('id')
    .single()
  if (error || !inserted) throw new Error(`Draft insert failed: ${error?.message ?? 'unknown'}`)

  // Flip the denormalized has_draft flag so the inbox list can show a
  // "Draft ready" indicator without joining negotiation_drafts on every read.
  await supabase.from('email_threads').update({ has_draft: true }).eq('id', threadId)

  return { draftId: inserted.id, version, output, model: 'claude-sonnet-4-6' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeClaim(row: any): string {
  const c = (row.claim ?? {}) as Record<string, unknown>
  const r = (row.result ?? {}) as Record<string, unknown>
  const a = (row.adjustments ?? {}) as Record<string, unknown>
  const comps = Array.isArray(row.comps) ? row.comps : []

  const compsText = comps.slice(0, 5).map((cp: Record<string, unknown>, i: number) => {
    return `  Comp ${i + 1}: ${cp.year ?? '?'} ${cp.make ?? ''} ${cp.model ?? ''} ${cp.trim ?? ''}
    price=$${cp.price ?? '?'} · miles=${cp.miles ?? '?'} · dealer=${cp.dealerName ?? '?'} · dist=${cp.distanceMi ?? '?'}mi
    URL: ${cp.vdpUrl ?? '?'}
    mileageAdj=$${cp.mileageAdjDollar ?? 0} · yearAdj=$${cp.yearAdjDollar ?? 0} · compValue=$${cp.compValue ?? '?'}`
  }).join('\n')

  return `MA #: ${row.ma_number ?? '?'}
Insurance Claim #: ${c.claimNumber ?? '?'}
Vehicle: ${row.vehicle ?? '?'} (VIN ${row.vin ?? '?'})
Mileage at loss: ${c.mileage ?? '?'}
Date of loss: ${c.dateOfLoss ?? '?'}
Zip / radius: ${c.zip ?? '?'} / ${c.radius ?? '?'}mi

Insured: ${c.insuredName ?? '?'} — ${c.ownerEmail ?? '?'} — ${c.ownerPhone ?? '?'}
Client type: ${c.clientType ?? '?'} — Client name: ${c.clientName ?? '?'}

Insurance company: ${c.insuranceCompany ?? '?'}
Adjuster: ${c.adjuster ?? '?'} — ${c.adjusterEmail ?? '?'} — ${c.adjusterPhone ?? '?'}

--- OUR VALUATION ---
Comp 1 value: $${r.comp1Value ?? '?'}
Comp 2 value: $${r.comp2Value ?? '?'}
Comp 3 value: $${r.comp3Value ?? '?'}
Average: $${r.averageValue ?? '?'}
Total adjustments: $${r.totalAdjustments ?? '?'}
Tax: $${r.taxAmount ?? '?'} @ ${a.taxRate ?? '?'}%
Vehicle history adj: $${a.vehicleHistory ?? 0} (${a.vehicleHistoryNote ?? ''})
Prior damages adj: $${a.priorDamages ?? 0} (${a.priorDamagesNote ?? ''})
Additions: $${a.additions ?? 0} (${a.additionsNote ?? ''})
Deductions: $${a.deductions ?? 0} (${a.deductionsNote ?? ''})
FINAL ACV: $${r.acv ?? '?'}

--- COMPS USED ---
${compsText || '  (none)'}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatVoiceBlock(v: any): string {
  const lines: string[] = []
  lines.push(`Tone: ${v.tone_summary}`)
  if (v.opening_patterns?.length) lines.push(`Openers: ${v.opening_patterns.join(' | ')}`)
  if (v.closing_patterns?.length) lines.push(`Closers: ${v.closing_patterns.join(' | ')}`)
  if (v.negotiation_moves?.length) lines.push(`Moves he uses:\n- ${v.negotiation_moves.join('\n- ')}`)
  if (v.escalation_patterns?.length) lines.push(`Escalation:\n- ${v.escalation_patterns.join('\n- ')}`)
  if (v.common_phrases?.length) lines.push(`Common phrases: ${v.common_phrases.join(' | ')}`)
  if (v.concessions_style) lines.push(`Concessions: ${v.concessions_style}`)
  if (v.style_dos?.length) lines.push(`DO:\n- ${v.style_dos.join('\n- ')}`)
  if (v.style_donts?.length) lines.push(`DON'T:\n- ${v.style_donts.join('\n- ')}`)
  return lines.join('\n\n')
}

// Belt-and-suspenders: even with the strong system-prompt ban, if Claude
// slips in a delay apology, strip the offending sentence entirely rather
// than send Henry an email that says "sorry for the delay". Case-insensitive.
const BANNED_APOLOGY_PATTERNS: RegExp[] = [
  /(^|\.\s+|\n)[^.\n]*\b(sorry|apolog(y|ies|ize)|my apologies|regret|please forgive)\b[^.\n]*\b(delay|wait|slow|late|slow to (respond|reply)|got back|circling back|time to respond|took (?:so|a while|awhile) (?:long|to))\b[^.\n]*\.?/gi,
  /(^|\.\s+|\n)[^.\n]*\b(thanks?|thank you|appreciate)\b[^.\n]*\b(patience|understanding|waiting)\b[^.\n]*\.?/gi,
]

// Strip any signature block Claude tacks on after the closing salutation.
// Henry's Outlook adds his real signature on send, so a duplicated name +
// title + office block is worse than useless. Everything after a recognized
// closer + comma gets removed.
const CLOSER_ALTS = 'kind regards|best regards|warm regards|sincerely|regards|thanks|thank you|cheers|best'
function stripSignatureBlock(text: string): string {
  const re = new RegExp(`([ \\t]*(?:${CLOSER_ALTS}))[,.]?[\\s\\S]*$`, 'i')
  return text.replace(re, (_full, closer: string) => `${closer.trim()},`)
}

// Replace em-dashes (—) and en-dashes (–) with punctuation Henry actually
// uses. Regular hyphens (-) are untouched so phone numbers and compound
// words survive.
function stripLongDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')  // em-dash → comma (with any surrounding whitespace)
    .replace(/\s*–\s*/g, '-')   // en-dash → plain hyphen
}

function scrubBannedPhrases(text: string): string {
  let out = text
  for (const re of BANNED_APOLOGY_PATTERNS) out = out.replace(re, '')
  out = stripLongDashes(out)
  out = stripSignatureBlock(out)
  // Collapse resulting whitespace / double blank lines from stripped sentences.
  return out.replace(/[ \t]+/g, ' ').replace(/ ,/g, ',').replace(/\n{3,}/g, '\n\n').trim()
}

// Filter items Claude tries to flag as missing that we've decided are noise
// (deductible has no effect on ACV/DV; the award template is auto-generated
// so it doesn't belong in a missing-info list either).
function isBannedMissingInfo(item: string): boolean {
  const s = item.toLowerCase()
  if (s.includes('deductible')) return true
  if (s.includes('award') && (s.includes('template') || s.includes('document'))) return true
  if (s.includes('agreement') && s.includes('template')) return true
  return false
}

// When the negotiation reaches acceptance, auto-fill the Award PDF using the
// existing MA/EV template + agreed amount, upload to the claim's document
// bucket, append to acv_history.documents (so it shows in the claim's
// Documents tab), and also mirror the agreed amount into
// reports_state.notesData.agreementAmountNum so the Closing Notes tab + the
// Claim Info Valuations panel + the printed Assignment Sheet all show the
// same figure.
async function buildAndFileAward(args: {
  supabase: SupabaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claim: any
  agreedAmount: number
}): Promise<{ path: string; name: string } | null> {
  const { supabase, claim, agreedAmount } = args

  // Look up the company slug (Modern Appraisers uses a different template
  // from Eagleview — resolve via companies.slug).
  const { data: company } = await supabase
    .from('companies')
    .select('slug')
    .eq('id', claim.company_id)
    .maybeSingle()
  const slug = (company?.slug as string | undefined) ?? 'modern-appraisers'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (claim.claim ?? {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reports = (claim.reports_state ?? {}) as any
  const awardType = (reports.awardType as 'acv' | 'dv' | 'estimate' | undefined) ?? 'acv'
  const today = new Date().toISOString().slice(0, 10)
  const money = `$${agreedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const pdfBytes = await fillAwardPdf(slug, {
    insuranceCompany: c.insuranceCompany ?? '',
    vehicleOwner: c.insuredName ?? '',
    vehicle: [c.year, c.make, c.model, c.trim].filter(Boolean).join(' '),
    dateOfLoss: c.dateOfLoss ?? '',
    claimDate: reports.awardData?.claimDate || today,
    claimNumber: c.claimNumber ?? '',
    acvAmount: money,
    signatureDate1: reports.awardData?.signatureDate1 || today,
    signatureDate2: reports.awardData?.signatureDate2 || '',
    signatureBlock1: reports.awardData?.signatureBlock1 || 'Henry Aleksanyan\nModern Appraisers',
    signatureBlock2: reports.awardData?.signatureBlock2 || '',
    variant: awardType,
  })

  const fileNumber = claim.ma_number || claim.id
  const filename = `${fileNumber}-award.pdf`
  const path = `${claim.id}/${Date.now()}-${filename}`

  const { error: uploadErr } = await supabase.storage
    .from('claim-documents')
    .upload(path, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (uploadErr) {
    console.error('[draft] award upload failed:', uploadErr.message)
    return null
  }

  // Append to acv_history.documents jsonb so the claim's Documents tab
  // shows it the next time Henry opens the claim.
  const existingDocs = Array.isArray(claim.documents) ? claim.documents : []
  const newDoc = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: filename,
    source: 'award',
    path,
    size: pdfBytes.byteLength,
    createdAt: new Date().toISOString(),
  }

  // Mirror the agreed amount into notesData.agreementAmountNum so the
  // Claim Info Valuations panel + Closing Notes + Assignment Sheet all
  // reflect the agreement (preserve every other reports_state field).
  const nextReports = {
    ...(reports ?? {}),
    notesData: {
      ...(reports?.notesData ?? {}),
      agreementAmountNum: agreedAmount,
    },
    // Also make sure awardData.acvAmountNum reflects the agreement so the
    // Award tab prefills the same figure.
    awardData: {
      ...(reports?.awardData ?? {}),
      acvAmountNum: agreedAmount,
    },
  }

  const { error: updateErr } = await supabase
    .from('acv_history')
    .update({
      documents: [...existingDocs, newDoc],
      reports_state: nextReports,
    })
    .eq('id', claim.id)
  if (updateErr) {
    console.error('[draft] claim update after award upload failed:', updateErr.message)
    // The file is up in storage even if the metadata write failed; return
    // path so Henry can still download.
  }

  return { path, name: filename }
}
