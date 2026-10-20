import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface VoiceProfile {
  tone_summary: string
  opening_patterns: string[]
  closing_patterns: string[]
  negotiation_moves: string[]
  common_phrases: string[]
  concessions_style: string
  escalation_patterns: string[]
  style_dos: string[]
  style_donts: string[]
  builtFrom: {
    messageCount: number
    oldest: string | null
    newest: string | null
    ownerEmail: string
  }
  builtAt: string
}

// Bumped from 200 → 300 to give the trainer more signal once Henry backfills
// older sent history. Char cap tightened so total prompt stays comfortably
// inside Sonnet's 200k context window (300 × 2000 ≈ 150k tokens).
const MAX_EMAILS = 300
const MAX_CHARS_PER_EMAIL = 2_000

interface RawSent {
  subject: string
  sent_at: string
  text_body: string | null
}

export async function loadVoiceProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<VoiceProfile | null> {
  const { data } = await supabase
    .from('negotiation_config')
    .select('data')
    .eq('profile_id', profileId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = (data?.data as any)?.voice_profile
  return profile ?? null
}

export async function buildVoiceProfile(args: {
  supabase: SupabaseClient
  profileId: string
  ownerEmail: string
}): Promise<{ profile: VoiceProfile; usedMessages: number }> {
  const { supabase, profileId, ownerEmail } = args

  // Pull recent Sent-folder messages from Henry.
  const { data: sent } = await supabase
    .from('email_messages')
    .select('subject, sent_at, text_body, from_addr')
    .ilike('folder', '%sent%')
    .eq('from_addr', ownerEmail.toLowerCase())
    .not('text_body', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(MAX_EMAILS)

  const raw: RawSent[] = (sent ?? []).map(r => ({
    subject: r.subject,
    sent_at: r.sent_at,
    text_body: r.text_body,
  }))

  if (raw.length === 0) {
    throw new Error('No sent emails found for voice training. Sync your Sent folder first.')
  }

  const corpus = raw.map((m, i) => {
    const body = (stripQuotedReply(m.text_body ?? '') || '').slice(0, MAX_CHARS_PER_EMAIL)
    const date = new Date(m.sent_at).toISOString().slice(0, 10)
    return `--- Email ${i + 1} — ${date} — Subject: ${m.subject}\n${body}`
  }).join('\n\n')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const system = `You are a writing-style analyst. You will receive real negotiation emails written by an insurance appraiser named Henry, who represents insureds against opposing appraisers (OAs) and insurance-company adjusters in auto total-loss and diminished-value disputes.

Your job is to reverse-engineer Henry's voice + tactics so a future AI can draft new emails that sound like him and use the same negotiation strategy.

Call the save_voice_profile tool exactly once with your analysis. Be concrete and specific. Prefer verbatim quotes from the emails when listing phrases — quotes with punctuation and apostrophes are fine, the tool handles escaping.`

  const user = `Analyze the following ${raw.length} sent emails and call save_voice_profile:

${corpus}`

  // Tool-use mode so Anthropic validates the shape server-side and returns a
  // clean JS object — no JSON string parsing on our side (verbatim email
  // quotes were breaking manual JSON.parse before).
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4_000,
    system,
    tools: [{
      name: 'save_voice_profile',
      description: 'Persist the extracted voice profile for Henry.',
      input_schema: {
        type: 'object',
        properties: {
          tone_summary:        { type: 'string', description: '2-3 sentences describing his overall voice' },
          opening_patterns:    { type: 'array', items: { type: 'string' }, description: 'How he opens emails (verbatim phrases)' },
          closing_patterns:    { type: 'array', items: { type: 'string' }, description: 'How he signs off (verbatim phrases)' },
          negotiation_moves:   { type: 'array', items: { type: 'string' }, description: 'Tactical patterns he uses' },
          common_phrases:      { type: 'array', items: { type: 'string' }, description: 'Distinctive turns of phrase he uses repeatedly' },
          concessions_style:   { type: 'string', description: '1-2 sentences on how/when he concedes' },
          escalation_patterns: { type: 'array', items: { type: 'string' }, description: 'Moves he uses to escalate (appraisal clause, umpire, etc)' },
          style_dos:           { type: 'array', items: { type: 'string' }, description: 'Things to always do when writing like Henry' },
          style_donts:         { type: 'array', items: { type: 'string' }, description: 'Things Henry never or rarely does' },
        },
        required: [
          'tone_summary', 'opening_patterns', 'closing_patterns',
          'negotiation_moves', 'common_phrases', 'concessions_style',
          'escalation_patterns', 'style_dos', 'style_donts',
        ],
      },
    }],
    tool_choice: { type: 'tool', name: 'save_voice_profile' },
    messages: [{ role: 'user', content: user }],
  })

  const toolUse = resp.content.find(c => c.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'save_voice_profile') {
    throw new Error('Claude did not call save_voice_profile — got: ' + resp.content.map(c => c.type).join(', '))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = toolUse.input as any

  const profile: VoiceProfile = {
    tone_summary: String(parsed.tone_summary ?? ''),
    opening_patterns: arr(parsed.opening_patterns),
    closing_patterns: arr(parsed.closing_patterns),
    negotiation_moves: arr(parsed.negotiation_moves),
    common_phrases: arr(parsed.common_phrases),
    concessions_style: String(parsed.concessions_style ?? ''),
    escalation_patterns: arr(parsed.escalation_patterns),
    style_dos: arr(parsed.style_dos),
    style_donts: arr(parsed.style_donts),
    builtFrom: {
      messageCount: raw.length,
      oldest: raw[raw.length - 1]?.sent_at ?? null,
      newest: raw[0]?.sent_at ?? null,
      ownerEmail: ownerEmail.toLowerCase(),
    },
    builtAt: new Date().toISOString(),
  }

  // Store on negotiation_config, merged with any existing data.
  const { data: existing } = await supabase
    .from('negotiation_config')
    .select('data')
    .eq('profile_id', profileId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = { ...((existing?.data as any) ?? {}), voice_profile: profile }
  await supabase
    .from('negotiation_config')
    .upsert({ profile_id: profileId, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })

  return { profile, usedMessages: raw.length }
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => String(x)).filter(s => s.trim().length > 0) : []
}

// Trim the "> ... quoted..." reply chain so Claude analyzes what Henry
// actually wrote, not what he was replying to.
function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (/^(on .{5,60} wrote:|from:|sent:|to:|subject:|-----+original message-----+)/i.test(line.trim())) break
    if (line.startsWith('>')) continue
    out.push(line)
  }
  return out.join('\n').trim()
}
