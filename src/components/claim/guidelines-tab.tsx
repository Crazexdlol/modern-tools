"use client"

import { useEffect, useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import {
  fetchGuidelineByCompanyBrowser,
  type InsuranceGuideline,
} from '@/lib/supabase/insurance-guidelines'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Read-only guidelines panel for the claim workspace. Matches the claim's
// insurance company (case-insensitive, whitespace-normalized) against the
// insurance_guidelines table. Admins edit content in Settings → Guidelines.
export function GuidelinesTab({ insuranceCompany }: { insuranceCompany: string | undefined | null }) {
  const [loading, setLoading] = useState(true)
  const [guideline, setGuideline] = useState<InsuranceGuideline | null>(null)

  useEffect(() => {
    if (!insuranceCompany || !insuranceCompany.trim()) {
      setLoading(false)
      setGuideline(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchGuidelineByCompanyBrowser(insuranceCompany).then(g => {
      if (!cancelled) {
        setGuideline(g)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [insuranceCompany])

  const company = (insuranceCompany ?? '').trim()

  if (!company) {
    return (
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-black text-lg font-bold tracking-tight">Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <div className="text-sm text-gray-500">
            No insurance company set on this claim yet.
            <br />
            Fill in <b>Insurance Company</b> in Claim Info to see guidelines here.
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-black text-lg font-bold tracking-tight">Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <Loader2 className="w-6 h-6 text-gray-300 mx-auto mb-3 animate-spin" />
          <div className="text-sm text-gray-400">Loading guidelines for {company}…</div>
        </CardContent>
      </Card>
    )
  }

  if (!guideline) {
    return (
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-black text-lg font-bold tracking-tight">Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <div className="text-sm text-gray-600">
            No guidelines on file for <b>{company}</b>.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white border-gray-200 shadow-sm flex flex-col h-[calc(100vh-320px)] min-h-[500px] py-0 gap-0">
      <CardHeader className="py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <CardTitle className="text-black text-lg font-bold tracking-tight">
            Guidelines — {guideline.name}
          </CardTitle>
          <span className="ml-auto text-[11px] text-gray-400">
            Updated {new Date(guideline.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-8 py-6">
        {guideline.guidelines.trim() ? (
          <FormattedGuidelines text={guideline.guidelines} />
        ) : (
          <div className="text-sm text-gray-400 italic">
            No guideline text has been added for this company yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---- Mini formatter ----
// Splits text into blocks separated by blank lines. Each block becomes:
//   * `# heading`              → <h3>
//   * `## heading`             → <h4>
//   * All lines start with     → <ul> with <li> each
//     `- `, `* `, or `• `
//   * All lines are numbered   → <ol> with <li> each
//     (`1.`, `2.`, ...)
//   * Otherwise                → <p> with in-line <br /> for internal \n
// Inline: **bold** → <strong>; URLs → clickable <a>.

const URL_RE = /(https?:\/\/[^\s)]+)/g
const BOLD_RE = /\*\*([^*\n]+)\*\*/g
const BULLET_RE = /^\s*([-*•])\s+(.*)$/
const NUM_RE = /^\s*(\d+)[.)]\s+(.*)$/

function renderInline(text: string): React.ReactNode[] {
  // First pass: split on **bold**, keeping the delimiters.
  const parts: React.ReactNode[] = []
  let cursor = 0
  let idx = 0
  for (const m of text.matchAll(BOLD_RE)) {
    const start = m.index ?? 0
    if (start > cursor) parts.push(...linkifyChunk(text.slice(cursor, start), `t${idx++}`))
    parts.push(<strong key={`b${idx++}`}>{linkifyChunk(m[1], `bi${idx++}`)}</strong>)
    cursor = start + m[0].length
  }
  if (cursor < text.length) parts.push(...linkifyChunk(text.slice(cursor), `t${idx++}`))
  return parts
}

function linkifyChunk(chunk: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of chunk.matchAll(URL_RE)) {
    const start = m.index ?? 0
    if (start > last) nodes.push(chunk.slice(last, start))
    const url = m[0]
    nodes.push(
      <a
        key={`${keyPrefix}-a${i++}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 hover:underline break-all"
      >
        {url}
      </a>,
    )
    last = start + url.length
  }
  if (last < chunk.length) nodes.push(chunk.slice(last))
  return nodes
}

function FormattedGuidelines({ text }: { text: string }) {
  // Normalize line endings, then split on blank-line boundaries.
  const normalized = text.replace(/\r\n/g, '\n')
  const blocks = normalized.split(/\n\s*\n+/).map(b => b.replace(/^\n+|\n+$/g, ''))

  return (
    <div className="space-y-4 text-sm text-gray-800 leading-relaxed max-w-3xl">
      {blocks.map((block, i) => {
        if (!block.trim()) return null
        const lines = block.split('\n')

        // Heading (single-line, starts with `#`).
        if (lines.length === 1) {
          const h1 = /^#\s+(.*)/.exec(lines[0])
          if (h1) {
            return (
              <h3 key={i} className="text-lg font-bold text-gray-900 pt-2 border-b border-gray-100 pb-1">
                {renderInline(h1[1])}
              </h3>
            )
          }
          const h2 = /^##\s+(.*)/.exec(lines[0])
          if (h2) {
            return (
              <h4 key={i} className="text-base font-semibold text-gray-900 pt-1">
                {renderInline(h2[1])}
              </h4>
            )
          }
        }

        // Bulleted list — every non-empty line starts with -, *, or •.
        const bulletMatches = lines.map(l => BULLET_RE.exec(l))
        if (bulletMatches.every(m => m !== null) && bulletMatches.length > 0) {
          return (
            <ul key={i} className="list-disc pl-6 space-y-1">
              {bulletMatches.map((m, li) => (
                <li key={li}>{renderInline(m![2])}</li>
              ))}
            </ul>
          )
        }

        // Numbered list — every non-empty line starts with `1.`, `2.` etc.
        const numMatches = lines.map(l => NUM_RE.exec(l))
        if (numMatches.every(m => m !== null) && numMatches.length > 0) {
          return (
            <ol key={i} className="list-decimal pl-6 space-y-1">
              {numMatches.map((m, li) => (
                <li key={li}>{renderInline(m![2])}</li>
              ))}
            </ol>
          )
        }

        // Default: paragraph with in-line <br /> preserved.
        return (
          <p key={i} className="whitespace-normal">
            {lines.map((line, li) => (
              <span key={li}>
                {renderInline(line)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
