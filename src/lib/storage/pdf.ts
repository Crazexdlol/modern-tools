import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ClaimInfo, StorageState } from '@/lib/acv/types'
import { LOGO_PNG_BASE64 } from './logo-data'
import { NoTemplateError } from '@/lib/pdf/template-path'

// Programmatic PDF for the Storage Charges tool. Matches the visual tone of
// the other Modern Appraisers reports: black text on white, hairline rules,
// no accent colors, no zebra stripes. Letter size, 50pt margins.

const PAGE = { width: 612, height: 792 }
const MARGIN = 50

const BLACK: [number, number, number] = [0, 0, 0]
const HAIRLINE: [number, number, number] = [0.75, 0.75, 0.78]
const MUTED: [number, number, number] = [0.4, 0.4, 0.45]

interface Ctx {
  doc: PDFDocument
  page: import('pdf-lib').PDFPage
  fontBody: import('pdf-lib').PDFFont
  fontBold: import('pdf-lib').PDFFont
}

function fmtCurrency(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// line_total = Qty × Hours × Rate. Empty Qty defaults to 1 so a single-unit
// row bills as Hours × Rate without extra typing. Kept in sync with
// computeStorageTotals() in components/claim/storage-tab.tsx.
function computeTotals(state: StorageState) {
  const lineTotals = state.lines.map(l => {
    const q = Number(l.qty) > 0 ? Number(l.qty) : 1
    const h = Number(l.hours) || 0
    const r = Number(l.rate) || 0
    return Math.max(0, q * h * r)
  })
  const subtotal = lineTotals.reduce((s, v) => s + v, 0)
  const rate = Math.max(0, Number(state.taxRatePct) || 0)
  const tax = subtotal * (rate / 100)
  const total = subtotal + tax
  return { lineTotals, subtotal, tax, total, rate }
}

function wrap(text: string, font: import('pdf-lib').PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraphs = (text ?? '').split(/\r?\n/)
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) { lines.push(''); continue }
    const words = paragraph.split(/\s+/)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate
      } else {
        if (current) lines.push(current)
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = ''
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth) {
              lines.push(chunk); chunk = ch
            } else {
              chunk += ch
            }
          }
          current = chunk
        } else {
          current = word
        }
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

// PDF native coords have origin bottom-left; we author top-down.
function yFromTop(top: number): number { return PAGE.height - top }

function drawText(ctx: Ctx, text: string, opts: { x: number; top: number; size?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number }) {
  const font = opts.bold ? ctx.fontBold : ctx.fontBody
  const size = opts.size ?? 10
  const color = opts.color ?? BLACK
  ctx.page.drawText(text, {
    x: opts.x,
    y: yFromTop(opts.top) - size * 0.8,
    size,
    font,
    color: rgb(color[0], color[1], color[2]),
    maxWidth: opts.maxWidth,
  })
}

function drawTextCentered(ctx: Ctx, text: string, opts: { top: number; size?: number; bold?: boolean; color?: [number, number, number] }) {
  const font = opts.bold ? ctx.fontBold : ctx.fontBody
  const size = opts.size ?? 10
  const width = font.widthOfTextAtSize(text, size)
  drawText(ctx, text, { x: (PAGE.width - width) / 2, top: opts.top, size, bold: opts.bold, color: opts.color })
}

function drawTextRight(ctx: Ctx, text: string, opts: { rightX: number; top: number; size?: number; bold?: boolean; color?: [number, number, number] }) {
  const font = opts.bold ? ctx.fontBold : ctx.fontBody
  const size = opts.size ?? 10
  const width = font.widthOfTextAtSize(text, size)
  drawText(ctx, text, { x: opts.rightX - width, top: opts.top, size, bold: opts.bold, color: opts.color })
}

function drawLine(ctx: Ctx, x1: number, top1: number, x2: number, top2: number, thickness = 0.5, color: [number, number, number] = HAIRLINE) {
  ctx.page.drawLine({
    start: { x: x1, y: yFromTop(top1) },
    end:   { x: x2, y: yFromTop(top2) },
    thickness,
    color: rgb(color[0], color[1], color[2]),
  })
}

// Embed the Modern Appraisers logo. Bytes are baked into the JS bundle
// via `logo-data.ts` (base64 of public/logo.png) so this works on Vercel
// serverless regardless of whether nft traces the raw asset. Regenerate
// logo-data.ts whenever the source PNG changes — the command lives in a
// comment at the top of that file.
async function embedLogo(doc: PDFDocument): Promise<import('pdf-lib').PDFImage | null> {
  try {
    const bytes = Buffer.from(LOGO_PNG_BASE64, 'base64')
    return await doc.embedPng(bytes)
  } catch (err) {
    console.warn('Storage PDF: embedded logo failed to decode:', err)
    return null
  }
}

export async function buildStorageChargesPdf(
  companySlug: string,
  claim: ClaimInfo,
  state: StorageState,
): Promise<Uint8Array> {
  // Storage PDF is programmatic (base64-embedded MA logo). Phase 3 gates it
  // to MA only. When Henry builds EV's storage-charges layout, this check
  // widens.
  if (companySlug !== 'modern-appraisers') {
    throw new NoTemplateError(companySlug, 'storage-pdf')
  }
  const doc = await PDFDocument.create()
  const fontBody = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const logo = await embedLogo(doc)

  let page = doc.addPage([PAGE.width, PAGE.height])
  const ctx: Ctx = { doc, page, fontBody, fontBold }
  const contentWidth = PAGE.width - MARGIN * 2

  // ── Header: logo top-left, title centered on same row ──────────────────
  // Letterhead layout — logo anchored to the top-left, "Storage Charge
  // Report" title centered horizontally at the same vertical band as the
  // logo (so it appears higher on the page than a stacked layout).
  const HEADER_TOP = MARGIN
  const LOGO_MAX_WIDTH = 200
  const LOGO_MAX_HEIGHT = 44
  let logoBottom = HEADER_TOP
  if (logo) {
    // Fit within both width and height caps, preserve aspect.
    const scale = Math.min(LOGO_MAX_WIDTH / logo.width, LOGO_MAX_HEIGHT / logo.height, 1)
    const w = logo.width * scale
    const h = logo.height * scale
    page.drawImage(logo, {
      x: MARGIN,
      y: yFromTop(HEADER_TOP + h),
      width: w,
      height: h,
    })
    logoBottom = HEADER_TOP + h
  } else {
    // Fallback banner if the logo file is missing on the serverless FS.
    drawText(ctx, 'MODERN APPRAISERS', { x: MARGIN, top: HEADER_TOP + 4, size: 14, bold: true, color: BLACK })
    drawText(ctx, 'Auto . Motorcycle Specialty', { x: MARGIN, top: HEADER_TOP + 24, size: 8, color: MUTED })
    logoBottom = HEADER_TOP + 34
  }

  // Title right-aligned to the right margin, vertically aligned with the
  // logo's midline. Right-align avoids the visual collision that a centered
  // title had with the wide logo wordmark.
  const TITLE_SIZE = 22
  const titleMidY = HEADER_TOP + (logoBottom - HEADER_TOP) / 2
  drawTextRight(ctx, 'Storage Charge Report', { rightX: PAGE.width - MARGIN, top: titleMidY - TITLE_SIZE / 2, size: TITLE_SIZE, bold: true })
  // Hairline separator under the header block.
  const HEADER_BOTTOM = Math.max(logoBottom, HEADER_TOP + TITLE_SIZE) + 12
  drawLine(ctx, MARGIN, HEADER_BOTTOM, PAGE.width - MARGIN, HEADER_BOTTOM, 0.75, BLACK)

  // ── Claim identifier block: 4 stats, one row, muted labels + bold values.
  const CLAIM_TOP = HEADER_BOTTOM + 18
  const vehicle = [claim.year || '', claim.make, claim.model].filter(Boolean).join(' ').trim()
  const stats: Array<{ label: string; value: string }> = [
    { label: 'MA #',    value: claim.maNumber || '—' },
    { label: 'Insured', value: claim.insuredName || '—' },
    { label: 'Vehicle', value: vehicle || '—' },
    { label: 'Date',    value: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) },
  ]
  const statColWidth = contentWidth / stats.length
  stats.forEach((s, i) => {
    const x = MARGIN + i * statColWidth
    drawText(ctx, s.label.toUpperCase(), { x, top: CLAIM_TOP, size: 7, bold: true, color: MUTED })
    drawText(ctx, s.value, { x, top: CLAIM_TOP + 12, size: 11, bold: true, maxWidth: statColWidth - 8 })
  })
  drawLine(ctx, MARGIN, CLAIM_TOP + 36, PAGE.width - MARGIN, CLAIM_TOP + 36, 0.5)

  // ── Line-item table ────────────────────────────────────────────────────
  const TABLE_TOP = CLAIM_TOP + 56
  // Column definitions — widths sum to contentWidth (512).
  //   Qty 45 · Description 232 · Hours 55 · Rate 80 · Line Total 100
  const cols = [
    { key: 'qty',   label: 'Qty',        x: MARGIN,                      width: 45,  align: 'left'  as const },
    { key: 'desc',  label: 'Description', x: MARGIN + 45,                 width: 232, align: 'left'  as const },
    { key: 'hours', label: 'Hours',      x: MARGIN + 45 + 232,            width: 55,  align: 'right' as const },
    { key: 'rate',  label: 'Rate',       x: MARGIN + 45 + 232 + 55,       width: 80,  align: 'right' as const },
    { key: 'total', label: 'Line Total', x: MARGIN + 45 + 232 + 55 + 80,  width: 100, align: 'right' as const },
  ]

  const HEADER_ROW_H = 22
  // Top rule + header row + rule under header
  drawLine(ctx, MARGIN, TABLE_TOP, PAGE.width - MARGIN, TABLE_TOP, 0.75, BLACK)
  for (const col of cols) {
    const size = 9
    const y = TABLE_TOP + HEADER_ROW_H / 2 - 3
    if (col.align === 'right') {
      drawTextRight(ctx, col.label.toUpperCase(), { rightX: col.x + col.width - 6, top: y, size, bold: true, color: BLACK })
    } else {
      drawText(ctx, col.label.toUpperCase(), { x: col.x + 6, top: y, size, bold: true, color: BLACK })
    }
  }
  drawLine(ctx, MARGIN, TABLE_TOP + HEADER_ROW_H, PAGE.width - MARGIN, TABLE_TOP + HEADER_ROW_H, 0.5, BLACK)

  const totals = computeTotals(state)
  const rowSize = 10
  const rowLineH = rowSize + 3   // per-line vertical stride inside a cell
  const rowPadY = 8              // padding at top and bottom of each row
  let rowTop = TABLE_TOP + HEADER_ROW_H

  const drawContinuationHeader = () => {
    drawText(ctx, 'Storage Charge Report (continued)', { x: MARGIN, top: MARGIN, size: 12, bold: true })
    rowTop = MARGIN + 30
    drawLine(ctx, MARGIN, rowTop, PAGE.width - MARGIN, rowTop, 0.75, BLACK)
    for (const col of cols) {
      const size = 9
      const y = rowTop + HEADER_ROW_H / 2 - 3
      if (col.align === 'right') {
        drawTextRight(ctx, col.label.toUpperCase(), { rightX: col.x + col.width - 6, top: y, size, bold: true, color: BLACK })
      } else {
        drawText(ctx, col.label.toUpperCase(), { x: col.x + 6, top: y, size, bold: true, color: BLACK })
      }
    }
    drawLine(ctx, MARGIN, rowTop + HEADER_ROW_H, PAGE.width - MARGIN, rowTop + HEADER_ROW_H, 0.5, BLACK)
    rowTop += HEADER_ROW_H
  }

  for (let i = 0; i < state.lines.length; i++) {
    const line = state.lines[i]
    const lineTotal = totals.lineTotals[i] ?? 0
    const descLines = wrap(line.description || '', fontBody, rowSize, cols[1].width - 12)
    const contentHeight = Math.max(rowLineH, descLines.length * rowLineH)
    const rowHeight = contentHeight + rowPadY * 2

    // Page break — reserve ~120pt at the bottom for totals + footer.
    if (rowTop + rowHeight > PAGE.height - MARGIN - 130) {
      page = doc.addPage([PAGE.width, PAGE.height])
      ctx.page = page
      drawContinuationHeader()
    }

    // Cell text — vertically top-aligned within padding.
    const textTop = rowTop + rowPadY
    drawText(ctx, String(line.qty || 1), { x: cols[0].x + 6, top: textTop, size: rowSize })
    descLines.forEach((l, li) => {
      drawText(ctx, l, { x: cols[1].x + 6, top: textTop + li * rowLineH, size: rowSize })
    })
    const hoursText = (Number(line.hours) || 0).toFixed(2).replace(/\.00$/, '')
    drawTextRight(ctx, hoursText, { rightX: cols[2].x + cols[2].width - 6, top: textTop, size: rowSize })
    drawTextRight(ctx, fmtCurrency(Number(line.rate) || 0), { rightX: cols[3].x + cols[3].width - 6, top: textTop, size: rowSize })
    drawTextRight(ctx, fmtCurrency(lineTotal), { rightX: cols[4].x + cols[4].width - 6, top: textTop, size: rowSize, bold: true })

    // Row separator UNDER the cell content (never crosses text).
    const rowBottom = rowTop + rowHeight
    drawLine(ctx, MARGIN, rowBottom, PAGE.width - MARGIN, rowBottom, 0.3)
    rowTop = rowBottom
  }

  // Bottom rule on the last row of the table.
  drawLine(ctx, MARGIN, rowTop, PAGE.width - MARGIN, rowTop, 0.75, BLACK)

  // ── Totals block, right-aligned ────────────────────────────────────────
  const TOTALS_TOP = rowTop + 20
  const totalsLabelX = MARGIN + contentWidth - 240
  const totalsRightX = MARGIN + contentWidth
  const rowH = 18
  drawText(ctx, 'Subtotal', { x: totalsLabelX, top: TOTALS_TOP, size: 10, color: MUTED })
  drawTextRight(ctx, fmtCurrency(totals.subtotal), { rightX: totalsRightX, top: TOTALS_TOP, size: 10 })
  const rateStr = totals.rate.toFixed(2).replace(/\.00$/, '')
  drawText(ctx, `Sales tax (${rateStr}%)`, { x: totalsLabelX, top: TOTALS_TOP + rowH, size: 10, color: MUTED })
  drawTextRight(ctx, fmtCurrency(totals.tax), { rightX: totalsRightX, top: TOTALS_TOP + rowH, size: 10 })
  drawLine(ctx, totalsLabelX, TOTALS_TOP + rowH * 2 - 2, totalsRightX, TOTALS_TOP + rowH * 2 - 2, 0.5, BLACK)
  drawText(ctx, 'Total', { x: totalsLabelX, top: TOTALS_TOP + rowH * 2 + 6, size: 12, bold: true })
  drawTextRight(ctx, fmtCurrency(totals.total), { rightX: totalsRightX, top: TOTALS_TOP + rowH * 2 + 6, size: 12, bold: true })

  // ── Notes block ────────────────────────────────────────────────────────
  if (state.notes && state.notes.trim().length > 0) {
    const NOTES_TOP = TOTALS_TOP + rowH * 2 + 40
    drawText(ctx, 'NOTES', { x: MARGIN, top: NOTES_TOP, size: 8, bold: true, color: MUTED })
    drawLine(ctx, MARGIN, NOTES_TOP + 14, PAGE.width - MARGIN, NOTES_TOP + 14, 0.5)
    const noteSize = 10
    const noteLines = wrap(state.notes.trim(), fontBody, noteSize, contentWidth)
    noteLines.forEach((l, i) => {
      drawText(ctx, l, { x: MARGIN, top: NOTES_TOP + 24 + i * (noteSize + 4), size: noteSize })
    })
  }

  return doc.save()
}
