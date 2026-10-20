import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import type { SavedSummary } from '@/app/summary-page/lib'

// Server-side Summary PDF generator (pdf-lib, Times New Roman everywhere).
// Layout mirrors the canonical reference Henry sent 2026-10-12 — a clean
// letterhead with the Modern Appraisers logo top-left, right-aligned
// "ONE-STOP-SHOP / FOR YOUR APPRAISAL NEEDS" tagline, centered "Summary Page"
// title, labeled field block (Date, Claim Number, Insurance Company, Vehicle
// Owner, Vehicle, Date of Loss), a horizontal divider, then OA block
// (Opposing Appraiser, Date Received Claim, Initial Contact), then
// "Status: ..." lines one per entry. Additional Claim Information and
// State Laws optional sections are appended underneath if present.

// Letter: 612 x 792 pt (0.75" margin = 54pt on left/right, slightly tighter top/bottom)
const PAGE_W = 612
const PAGE_H = 792
const MARGIN_X = 72              // 1.00 in — matches the reference's left margin
const MARGIN_TOP = 54            // 0.75 in
const MARGIN_BOTTOM = 54         // 0.75 in
const CONTENT_WIDTH = PAGE_W - MARGIN_X * 2

const BODY_SIZE = 12             // Fields + status lines
const TAGLINE_SIZE = 11          // Top-right "ONE-STOP-SHOP" lines
const TITLE_SIZE = 28            // "Summary Page" centered
const H2_SIZE = 14               // "Additional Claim Information", "State Law"
const FIELD_LINE_GAP = 10        // Vertical gap between labeled rows
const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.45, 0.45, 0.45)

function formatDateUS(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

function stripHtml(s: string): string {
  if (!s) return ''
  return s
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Word-wrap `text` to fit within `maxWidth` points at the given font/size.
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n')
  const out: string[] = []
  for (const para of paragraphs) {
    if (!para.trim()) { out.push(''); continue }
    const words = para.split(/\s+/)
    let line = ''
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
        line = probe
      } else {
        if (line) out.push(line)
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = ''
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk)
              chunk = ch
            } else {
              chunk += ch
            }
          }
          line = chunk
        } else {
          line = w
        }
      }
    }
    if (line) out.push(line)
  }
  return out
}

interface Cursor {
  page: PDFPage
  y: number
}

function readLogoPngBytes(companySlug: string): Uint8Array | null {
  const p = path.join(process.cwd(), 'public', 'companies', companySlug, 'logo.png')
  if (!existsSync(p)) return null
  return readFileSync(p)
}

// Flip every opaque "near-white" pixel to black, preserving the alpha
// channel. The repo's logo.png is the white-on-transparent variant used
// in the dark app header; on white PDF paper it renders invisible. The
// HTML Summary printed it via `filter: brightness(0)` CSS — pdf-lib has
// no filter primitive, so we invert the pixels at embed time instead.
// Transparent pixels stay transparent; near-black pixels (if the source
// is actually dark) are left alone so this is also safe for a logo that's
// already black.
function flattenLogoToBlack(bytes: Uint8Array): Uint8Array {
  try {
    const png = PNG.sync.read(Buffer.from(bytes))
    const data = png.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      // Only recolor opaque-ish pixels that are brighter than mid-gray.
      // Dark pixels in a black logo pass through unchanged.
      const alpha = data[i + 3]
      if (alpha > 10 && r + g + b > 384) {
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
      }
    }
    return PNG.sync.write(png)
  } catch {
    // Decode failed — return original bytes and let pdf-lib embed as-is.
    return bytes
  }
}

export async function buildSummaryPdf(
  summary: SavedSummary,
  companySlug = 'modern-appraisers',
  brandName = 'Modern Appraisers',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const times = await doc.embedFont(StandardFonts.TimesRoman)
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold)

  let logo: PDFImage | null = null
  const rawLogoBytes = readLogoPngBytes(companySlug)
  if (rawLogoBytes) {
    try {
      const flattened = flattenLogoToBlack(rawLogoBytes)
      logo = await doc.embedPng(flattened)
    } catch {
      // Fall through — PDF without a logo is better than no PDF at all.
    }
  }

  const newPage = (): PDFPage => doc.addPage([PAGE_W, PAGE_H])
  const cur: Cursor = { page: newPage(), y: PAGE_H - MARGIN_TOP }

  // ── Letterhead header ──────────────────────────────────────────────────
  // Logo left (1.6in wide, natural aspect), tagline right (two bold lines).
  const drawHeader = (c: Cursor) => {
    const taglineTop = 'ONE-STOP-SHOP'
    const taglineBot = 'FOR YOUR APPRAISAL NEEDS'
    const taglineLineH = TAGLINE_SIZE + 4
    const taglineBlockH = taglineLineH * 2

    let headerH = taglineBlockH
    if (logo) {
      const targetW = 115 // ~1.6 in
      const scale = targetW / logo.width
      const logoH = logo.height * scale
      headerH = Math.max(headerH, logoH)

      const logoY = c.y - (headerH + logoH) / 2 + logoH / 2 - logoH / 2 // vertically center within headerH
      // Simplify: top-align the logo to c.y
      c.page.drawImage(logo, {
        x: MARGIN_X,
        y: c.y - logoH,
        width: targetW,
        height: logoH,
      })
      // Suppress "unused" linter noise from the centered-calc leftover.
      void logoY
    }

    // Tagline right-aligned, two stacked bold black lines.
    const taglineTopW = timesBold.widthOfTextAtSize(taglineTop, TAGLINE_SIZE)
    const taglineBotW = timesBold.widthOfTextAtSize(taglineBot, TAGLINE_SIZE)
    c.page.drawText(taglineTop, {
      x: PAGE_W - MARGIN_X - taglineTopW,
      y: c.y - TAGLINE_SIZE,
      font: timesBold,
      size: TAGLINE_SIZE,
      color: BLACK,
    })
    c.page.drawText(taglineBot, {
      x: PAGE_W - MARGIN_X - taglineBotW,
      y: c.y - TAGLINE_SIZE - taglineLineH,
      font: timesBold,
      size: TAGLINE_SIZE,
      color: BLACK,
    })

    c.y -= headerH + 10
  }

  const ensureSpace = (needed: number) => {
    if (cur.y - needed < MARGIN_BOTTOM) {
      cur.page = newPage()
      cur.y = PAGE_H - MARGIN_TOP
      drawHeader(cur)
    }
  }

  // Labeled field: "**Label:** value" on one row, bold label + regular value.
  // Wraps the value across multiple lines (indented to the value column) if
  // the value is too long for one line.
  const drawField = (label: string, value: string) => {
    ensureSpace(BODY_SIZE + 4)
    cur.y -= BODY_SIZE
    const labelText = `${label}:`
    cur.page.drawText(labelText, {
      x: MARGIN_X, y: cur.y, font: timesBold, size: BODY_SIZE, color: BLACK,
    })
    const labelW = timesBold.widthOfTextAtSize(labelText, BODY_SIZE)
    const valueX = MARGIN_X + labelW + 6
    const valueMaxW = PAGE_W - MARGIN_X - valueX
    const v = (value || '').trim()
    if (!v) {
      cur.y -= FIELD_LINE_GAP
      return
    }
    const wrapped = wrapText(v, times, BODY_SIZE, valueMaxW)
    cur.page.drawText(wrapped[0], { x: valueX, y: cur.y, font: times, size: BODY_SIZE, color: BLACK })
    for (let i = 1; i < wrapped.length; i++) {
      ensureSpace(BODY_SIZE + 2)
      cur.y -= BODY_SIZE + 2
      cur.page.drawText(wrapped[i], { x: valueX, y: cur.y, font: times, size: BODY_SIZE, color: BLACK })
    }
    cur.y -= FIELD_LINE_GAP
  }

  // ── Page content ───────────────────────────────────────────────────────
  drawHeader(cur)
  cur.y -= 24

  // Centered title "Summary Page" (large bold)
  const titleText = 'Summary Page'
  const titleW = timesBold.widthOfTextAtSize(titleText, TITLE_SIZE)
  cur.y -= TITLE_SIZE
  cur.page.drawText(titleText, {
    x: (PAGE_W - titleW) / 2,
    y: cur.y,
    font: timesBold,
    size: TITLE_SIZE,
    color: BLACK,
  })
  cur.y -= 28

  // Identifying fields
  drawField('Date', formatDateUS(summary.date))
  drawField('Claim Number', summary.claimNumber)
  drawField('Insurance Company', summary.insuranceCompany)
  drawField('Vehicle Owner', summary.vehicleOwner)
  drawField('Vehicle', summary.vehicle)
  drawField('Date of Loss', formatDateUS(summary.dateOfLoss))

  // Single horizontal divider — separates identifying info from the OA
  // block + status log. Matches the reference's one-and-only rule.
  cur.y -= 10
  ensureSpace(2)
  cur.page.drawLine({
    start: { x: MARGIN_X, y: cur.y },
    end: { x: PAGE_W - MARGIN_X, y: cur.y },
    thickness: 0.75,
    color: GRAY,
  })
  cur.y -= 20

  // Opposing appraiser — compact "Name, Company" (phone/email omitted from
  // the printed summary; those live in Claim Info).
  const oaLine = [summary.opposingAppraiser, summary.oaCompany]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(', ')
  drawField('Opposing Appraiser', oaLine)
  drawField('Date Received Claim', formatDateUS(summary.dateReceivedClaim))
  const contact = summary.initialContactDate
    ? `${formatDateUS(summary.initialContactDate)}${summary.initialContactVia ? ` via ${summary.initialContactVia}` : ''}`
    : ''
  drawField('Initial Contact', contact)

  // Status entries — one line each, same **Status:** label pattern.
  const statuses = (summary.statuses || []).filter(s => s.date || s.text)
  if (statuses.length > 0) {
    cur.y -= 6
    for (const s of statuses) {
      const date = formatDateUS(s.date)
      const text = (s.text ?? '').trim()
      const value = [date, text].filter(Boolean).join(' ')
      drawField('Status', value)
    }
  }

  // Additional Claim Information — separate heading block when present.
  const info = (summary.additionalInfo || []).filter(i => i.text.trim())
  if (info.length > 0) {
    cur.y -= 10
    ensureSpace(H2_SIZE + 8)
    cur.y -= H2_SIZE
    cur.page.drawText('Additional Claim Information', {
      x: MARGIN_X, y: cur.y, font: timesBold, size: H2_SIZE, color: BLACK,
    })
    cur.y -= 10
    for (const i of info) {
      const lines = wrapText(`• ${i.text}`, times, BODY_SIZE, CONTENT_WIDTH - 10)
      for (const ln of lines) {
        ensureSpace(BODY_SIZE + 4)
        cur.y -= BODY_SIZE + 2
        cur.page.drawText(ln, { x: MARGIN_X + 10, y: cur.y, font: times, size: BODY_SIZE, color: BLACK })
      }
      cur.y -= 4
    }
  }

  // State Laws — each starts with its own divider + heading.
  const laws = (summary.stateLaws || []).filter(l => l.state || l.content)
  for (const law of laws) {
    cur.y -= 14
    ensureSpace(H2_SIZE + 10)
    cur.page.drawLine({
      start: { x: MARGIN_X, y: cur.y },
      end: { x: PAGE_W - MARGIN_X, y: cur.y },
      thickness: 0.5,
      color: GRAY,
    })
    cur.y -= 14
    cur.y -= H2_SIZE
    cur.page.drawText(`State Law${law.state ? ` – ${law.state}` : ''}`, {
      x: MARGIN_X, y: cur.y, font: timesBold, size: H2_SIZE, color: BLACK,
    })
    cur.y -= 10
    const plain = stripHtml(law.content ?? '')
    if (plain) {
      const lines = wrapText(plain, times, BODY_SIZE, CONTENT_WIDTH)
      for (const ln of lines) {
        ensureSpace(BODY_SIZE + 4)
        cur.y -= BODY_SIZE + 3
        cur.page.drawText(ln, { x: MARGIN_X, y: cur.y, font: times, size: BODY_SIZE, color: BLACK })
      }
    }
  }

  return await doc.save()
}
