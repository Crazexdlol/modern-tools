import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from './types'

// Programmatic ACV report for Eagleview. Same data + methodology as Modern's
// AcroForm-based ACV report but a distinct visual layout with EV branding.
// No template file — the PDF is built from scratch each time. Letter size.

const PAGE = { width: 612, height: 792 }
const MARGIN = 48

// EV brand palette. Navy from the shield, gold from VIEW text.
const NAVY: [number, number, number]     = [0.114, 0.220, 0.408] // #1D3868
const GOLD: [number, number, number]     = [0.816, 0.663, 0.192] // #D0A930
const BLACK: [number, number, number]    = [0, 0, 0]
const HAIRLINE: [number, number, number] = [0.78, 0.80, 0.85]
const MUTED: [number, number, number]    = [0.38, 0.42, 0.50]
const BG_TINT: [number, number, number]  = [0.965, 0.972, 0.985]

interface Ctx {
  doc: PDFDocument
  page: import('pdf-lib').PDFPage
  fontBody: import('pdf-lib').PDFFont
  fontBold: import('pdf-lib').PDFFont
}

function fmtCurrency(n: number): string {
  if (!Number.isFinite(n)) return '$0.00'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtCurrencyCents(n: number): string {
  if (!Number.isFinite(n)) return '$0.00'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US')
}
function fmtDate(s: string | undefined): string {
  if (!s) return ''
  const parts = s.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return s
}
// StandardFonts.Helvetica uses WinAnsi (CP1252) encoding — it throws on any
// character outside that range (Δ, emoji, CJK, etc.). User-provided fields
// (notes, insured name, address, ...) can contain anything, so we scrub to
// WinAnsi-safe before drawing. Common typographic characters are mapped to
// close ASCII equivalents; everything else becomes '?'.
const WINANSI_REMAP: Record<string, string> = {
  '–': '-',   // en dash
  '—': '-',   // em dash
  '‘': "'",   // left single quote
  '’': "'",   // right single quote / apostrophe
  '“': '"',   // left double quote
  '”': '"',   // right double quote
  '…': '...', // ellipsis
  ' ': ' ',   // non-breaking space
}
function toSafe(s: string | undefined | null): string {
  if (!s) return ''
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    if (code < 0x80) { out += ch; continue }                     // ASCII pass-through
    if (WINANSI_REMAP[ch] !== undefined) { out += WINANSI_REMAP[ch]; continue }
    // CP1252 covers 0xA0–0xFF. Approximate.
    if (code >= 0xA0 && code <= 0xFF) { out += ch; continue }
    out += '?'
  }
  return out
}
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
function drawRect(ctx: Ctx, x: number, top: number, width: number, height: number, fill?: [number, number, number], stroke?: [number, number, number], strokeThickness = 0.6) {
  ctx.page.drawRectangle({
    x,
    y: yFromTop(top + height),
    width,
    height,
    color: fill ? rgb(fill[0], fill[1], fill[2]) : undefined,
    borderColor: stroke ? rgb(stroke[0], stroke[1], stroke[2]) : undefined,
    borderWidth: stroke ? strokeThickness : 0,
  })
}

// Read EV logo from disk at request time. Companies/eagleview/logo.png is the
// full-color version; render at reduced height in the letterhead.
async function embedEvLogo(doc: PDFDocument): Promise<import('pdf-lib').PDFImage | null> {
  const p = path.join(process.cwd(), 'public', 'companies', 'eagleview', 'logo.png')
  if (!existsSync(p)) return null
  try {
    return await doc.embedPng(readFileSync(p))
  } catch {
    return null
  }
}

export async function buildEagleviewACVPdf(
  claim: ClaimInfo,
  comps: SelectedComp[],
  adjustments: ACVAdjustments,
  result: ACVResult,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fontBody = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const logo = await embedEvLogo(doc)
  const page = doc.addPage([PAGE.width, PAGE.height])
  const ctx: Ctx = { doc, page, fontBody, fontBold }
  const contentWidth = PAGE.width - MARGIN * 2

  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const vehicleStr = [claim.year, claim.make, claim.model, claim.trim].filter(Boolean).join(' ')

  // ── HEADER: navy bar with logo + title ─────────────────────────────────
  const HEADER_HEIGHT = 72
  drawRect(ctx, 0, 0, PAGE.width, HEADER_HEIGHT, NAVY)
  // Gold underline strip
  drawRect(ctx, 0, HEADER_HEIGHT, PAGE.width, 3, GOLD)

  if (logo) {
    const maxH = 44
    const scale = Math.min(maxH / logo.height, 160 / logo.width)
    const w = logo.width * scale
    const h = logo.height * scale
    // Invert the dark parts of the EV logo to white for the navy header.
    // The logo's dark elements read as navy-on-navy without inversion; we
    // draw a white rectangle behind the logo to keep it visually clean.
    const padX = 8, padY = 6
    drawRect(ctx, MARGIN - padX, (HEADER_HEIGHT - h) / 2 - padY, w + padX * 2, h + padY * 2, [1, 1, 1])
    page.drawImage(logo, {
      x: MARGIN,
      y: yFromTop((HEADER_HEIGHT - h) / 2 + h),
      width: w,
      height: h,
    })
  } else {
    drawText(ctx, 'EAGLEVIEW', { x: MARGIN, top: 22, size: 22, bold: true, color: [1, 1, 1] })
  }
  drawTextRight(ctx, 'ACTUAL CASH VALUE REPORT', { rightX: PAGE.width - MARGIN, top: 22, size: 16, bold: true, color: [1, 1, 1] })
  drawTextRight(ctx, `Prepared ${today}`, { rightX: PAGE.width - MARGIN, top: 46, size: 9, color: [0.85, 0.87, 0.92] })

  // ── CLAIM IDENTITY BLOCK ────────────────────────────────────────────────
  const CLAIM_TOP = HEADER_HEIGHT + 3 + 24
  drawText(ctx, 'CLAIM', { x: MARGIN, top: CLAIM_TOP, size: 8, bold: true, color: GOLD })
  drawLine(ctx, MARGIN, CLAIM_TOP + 14, PAGE.width - MARGIN, CLAIM_TOP + 14, 0.6, NAVY)

  const claimRow1: Array<{ label: string; value: string }> = [
    { label: 'FILE #',       value: toSafe(claim.maNumber) || '—' },
    { label: 'CLAIM #',      value: toSafe(claim.claimNumber) || '—' },
    { label: 'INSURANCE CO', value: toSafe(claim.insuranceCompany) || '—' },
    { label: 'DATE OF LOSS', value: fmtDate(claim.dateOfLoss) || '—' },
  ]
  const colW = contentWidth / 4
  claimRow1.forEach((f, i) => {
    const x = MARGIN + i * colW
    drawText(ctx, f.label, { x, top: CLAIM_TOP + 22, size: 7, bold: true, color: MUTED })
    drawText(ctx, f.value, { x, top: CLAIM_TOP + 34, size: 10.5, bold: true, maxWidth: colW - 6 })
  })

  // Second row: Owner + Adjuster
  const claimRow2Top = CLAIM_TOP + 58
  drawText(ctx, 'INSURED / CLIENT', { x: MARGIN, top: claimRow2Top, size: 7, bold: true, color: MUTED })
  drawText(ctx, toSafe(claim.insuredName) || '—', { x: MARGIN, top: claimRow2Top + 12, size: 10.5, bold: true, maxWidth: (contentWidth / 2) - 12 })
  const ownerLine = [claim.ownerPhone, claim.ownerEmail].filter(Boolean).join(' · ')
  if (ownerLine) drawText(ctx, toSafe(ownerLine), { x: MARGIN, top: claimRow2Top + 26, size: 9, color: MUTED, maxWidth: (contentWidth / 2) - 12 })
  if (claim.ownerAddress) drawText(ctx, toSafe(claim.ownerAddress), { x: MARGIN, top: claimRow2Top + 39, size: 9, color: MUTED, maxWidth: (contentWidth / 2) - 12 })

  const adjX = MARGIN + contentWidth / 2
  drawText(ctx, 'ASSIGNED ADJUSTER', { x: adjX, top: claimRow2Top, size: 7, bold: true, color: MUTED })
  drawText(ctx, toSafe(claim.adjuster) || '—', { x: adjX, top: claimRow2Top + 12, size: 10.5, bold: true, maxWidth: (contentWidth / 2) - 12 })
  const adjLine = [claim.adjusterPhone, claim.adjusterEmail].filter(Boolean).join(' · ')
  if (adjLine) drawText(ctx, toSafe(adjLine), { x: adjX, top: claimRow2Top + 26, size: 9, color: MUTED, maxWidth: (contentWidth / 2) - 12 })

  // ── LOSS VEHICLE ────────────────────────────────────────────────────────
  const VEH_TOP = claimRow2Top + 68
  drawText(ctx, 'LOSS VEHICLE', { x: MARGIN, top: VEH_TOP, size: 8, bold: true, color: GOLD })
  drawLine(ctx, MARGIN, VEH_TOP + 14, PAGE.width - MARGIN, VEH_TOP + 14, 0.6, NAVY)
  drawText(ctx, toSafe(vehicleStr) || '—', { x: MARGIN, top: VEH_TOP + 22, size: 14, bold: true })

  const vehRow = [
    { label: 'VIN',     value: toSafe(claim.vin) || '—' },
    { label: 'MILEAGE', value: `${fmtNumber(claim.mileage)} mi` },
    { label: 'ENGINE',  value: toSafe(claim.engine) || '—' },
    { label: 'DRIVE',   value: toSafe(claim.drivetrain) || '—' },
  ]
  vehRow.forEach((f, i) => {
    const x = MARGIN + i * colW
    drawText(ctx, f.label, { x, top: VEH_TOP + 48, size: 7, bold: true, color: MUTED })
    drawText(ctx, f.value, { x, top: VEH_TOP + 60, size: 10, bold: true, maxWidth: colW - 6 })
  })

  // ── COMPARABLE VEHICLES (3 comps as horizontal cards) ───────────────────
  const COMP_TOP = VEH_TOP + 90
  drawText(ctx, 'COMPARABLE VEHICLES', { x: MARGIN, top: COMP_TOP, size: 8, bold: true, color: GOLD })
  drawLine(ctx, MARGIN, COMP_TOP + 14, PAGE.width - MARGIN, COMP_TOP + 14, 0.6, NAVY)

  // 3 comp cards, side by side, each ~168pt wide × 158pt tall.
  const CARD_TOP = COMP_TOP + 22
  const CARD_GAP = 8
  const CARD_W = (contentWidth - CARD_GAP * 2) / 3
  const CARD_H = 152

  comps.slice(0, 3).forEach((c, i) => {
    const cx = MARGIN + i * (CARD_W + CARD_GAP)
    // Card container.
    drawRect(ctx, cx, CARD_TOP, CARD_W, CARD_H, BG_TINT, HAIRLINE)
    // Comp number badge (top-left, gold pill).
    drawRect(ctx, cx + 10, CARD_TOP + 10, 42, 16, GOLD)
    drawText(ctx, `COMP ${i + 1}`, { x: cx + 15, top: CARD_TOP + 13, size: 8, bold: true, color: [1, 1, 1] })

    // Comp header (year make model trim)
    const compTitle = [c.year, c.make, c.model, c.trim].filter(Boolean).join(' ')
    drawText(ctx, toSafe(compTitle), { x: cx + 10, top: CARD_TOP + 34, size: 10, bold: true, maxWidth: CARD_W - 20 })

    // Listing details.
    const detailTop = CARD_TOP + 52
    const rowH = 12
    const details: Array<[string, string]> = [
      ['Listed', fmtCurrency(c.price)],
      ['Miles', `${fmtNumber(c.miles)} mi`],
      ['Miles diff', `${c.mileageDiffRaw > 0 ? '+' : ''}${fmtNumber(c.mileageDiffRaw)}`],
      ['Mileage adj', fmtCurrency(c.mileageAdjDollar)],
      ['Year adj', fmtCurrency(c.yearAdjDollar)],
    ]
    details.forEach((d, di) => {
      drawText(ctx, d[0], { x: cx + 10, top: detailTop + di * rowH, size: 8, color: MUTED })
      drawTextRight(ctx, d[1], { rightX: cx + CARD_W - 10, top: detailTop + di * rowH, size: 8, bold: true })
    })

    // Comp final value — highlighted at bottom with navy strip.
    const valueTop = CARD_TOP + CARD_H - 26
    drawRect(ctx, cx, valueTop, CARD_W, 26, NAVY)
    drawText(ctx, 'COMP VALUE', { x: cx + 10, top: valueTop + 6, size: 7, bold: true, color: [0.85, 0.87, 0.92] })
    drawTextRight(ctx, fmtCurrency(c.compValue), { rightX: cx + CARD_W - 10, top: valueTop + 5, size: 13, bold: true, color: [1, 1, 1] })
  })

  // ── VALUATION SUMMARY ───────────────────────────────────────────────────
  const VAL_TOP = CARD_TOP + CARD_H + 22
  drawText(ctx, 'VALUATION', { x: MARGIN, top: VAL_TOP, size: 8, bold: true, color: GOLD })
  drawLine(ctx, MARGIN, VAL_TOP + 14, PAGE.width - MARGIN, VAL_TOP + 14, 0.6, NAVY)

  // Left column: the equation. Right column: the answer.
  const eqTop = VAL_TOP + 26
  const eqRows: Array<{ label: string; value: number; hint?: string }> = [
    { label: 'Comp 1 value',                value: result.comp1Value },
    { label: 'Comp 2 value',                value: result.comp2Value },
    { label: 'Comp 3 value',                value: result.comp3Value },
    { label: 'Average of comparables',      value: result.averageValue,     hint: '(sum / 3)' },
    { label: 'Vehicle history adjustment',  value: adjustments.vehicleHistory,  hint: adjustments.vehicleHistoryNote || undefined },
    { label: 'Prior damage adjustment',     value: adjustments.priorDamages,    hint: adjustments.priorDamagesNote  || undefined },
    { label: 'Additions',                   value: adjustments.additions,       hint: adjustments.additionsNote     || undefined },
    { label: 'Dealer vs. private',          value: adjustments.deductions,      hint: adjustments.deductionsNote    || 'private-party market' },
    { label: `Sales tax (${(adjustments.taxRate ?? 0).toFixed(2).replace(/\.00$/, '')}%)`, value: result.taxAmount },
  ]
  const rowH2 = 15
  const labelX = MARGIN + 10
  const valueRightX = MARGIN + contentWidth - 10
  eqRows.forEach((r, ri) => {
    const t = eqTop + ri * rowH2
    drawText(ctx, r.label, { x: labelX, top: t, size: 9, color: r.value === 0 ? MUTED : BLACK, bold: ri === 3 })
    if (r.hint) {
      const labelWidth = fontBody.widthOfTextAtSize(r.label, 9)
      drawText(ctx, `— ${toSafe(r.hint)}`, { x: labelX + labelWidth + 6, top: t, size: 8, color: MUTED })
    }
    drawTextRight(ctx, fmtCurrencyCents(r.value), { rightX: valueRightX, top: t, size: 9, bold: ri === 3 })
    if (ri === 3) drawLine(ctx, MARGIN, t + rowH2 - 2, PAGE.width - MARGIN, t + rowH2 - 2, 0.4)
  })

  // Final ACV — big navy box.
  const acvTop = eqTop + eqRows.length * rowH2 + 12
  const acvBoxH = 44
  drawRect(ctx, MARGIN, acvTop, contentWidth, acvBoxH, NAVY)
  drawText(ctx, 'ACTUAL CASH VALUE', { x: MARGIN + 16, top: acvTop + 10, size: 10, bold: true, color: [0.85, 0.87, 0.92] })
  drawText(ctx, 'Final settlement basis', { x: MARGIN + 16, top: acvTop + 24, size: 8, color: [0.7, 0.75, 0.85] })
  drawTextRight(ctx, fmtCurrencyCents(result.acv), { rightX: MARGIN + contentWidth - 16, top: acvTop + 12, size: 24, bold: true, color: GOLD })

  // ── NOTES (if any) ──────────────────────────────────────────────────────
  if (adjustments.notes && adjustments.notes.trim().length > 0) {
    const notesTop = acvTop + acvBoxH + 18
    drawText(ctx, 'NOTES', { x: MARGIN, top: notesTop, size: 8, bold: true, color: MUTED })
    drawLine(ctx, MARGIN, notesTop + 12, PAGE.width - MARGIN, notesTop + 12, 0.4)
    // Simple wrap
    const size = 9
    const maxW = contentWidth
    const words = toSafe(adjustments.notes.trim()).split(/\s+/)
    let line = ''
    let y = notesTop + 20
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w
      if (fontBody.widthOfTextAtSize(cand, size) <= maxW) {
        line = cand
      } else {
        drawText(ctx, line, { x: MARGIN, top: y, size })
        y += size + 3
        line = w
      }
    }
    if (line) drawText(ctx, line, { x: MARGIN, top: y, size })
  }

  // ── FOOTER ──────────────────────────────────────────────────────────────
  const FOOT_TOP = PAGE.height - MARGIN + 4
  drawLine(ctx, MARGIN, FOOT_TOP - 12, PAGE.width - MARGIN, FOOT_TOP - 12, 0.4)
  drawText(ctx, 'Prepared by Eagleview', { x: MARGIN, top: FOOT_TOP, size: 8, color: MUTED })
  drawTextRight(ctx, `File ${claim.maNumber || ''}  ·  ${today}`, { rightX: PAGE.width - MARGIN, top: FOOT_TOP, size: 8, color: MUTED })

  return doc.save()
}
