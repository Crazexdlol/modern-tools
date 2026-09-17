import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from './types'

// Programmatic ACV report for Eagleview. Same data + methodology as Modern's
// AcroForm-based ACV report but a distinct visual layout with EV branding.
// No template file — the PDF is built from scratch each time. Letter size.
// Two pages: page 1 is claim + vehicle details, page 2 is comps + valuation.

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
  logo: import('pdf-lib').PDFImage | null
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

// StandardFonts.Helvetica uses WinAnsi (CP1252) — throws on any character
// outside that range (Δ, emoji, CJK, etc.). Scrub user text before drawing.
const WINANSI_REMAP: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', ' ': ' ',
}
function toSafe(s: string | undefined | null): string {
  if (!s) return ''
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    if (code < 0x80) { out += ch; continue }
    if (WINANSI_REMAP[ch] !== undefined) { out += WINANSI_REMAP[ch]; continue }
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

// Read EV logo from disk at request time.
async function embedEvLogo(doc: PDFDocument): Promise<import('pdf-lib').PDFImage | null> {
  const p = path.join(process.cwd(), 'public', 'companies', 'eagleview', 'logo.png')
  if (!existsSync(p)) return null
  try {
    return await doc.embedPng(readFileSync(p))
  } catch {
    return null
  }
}

// Navy header bar with EV logo on the left + title on the right. Same on
// every page so the report looks like one continuous document.
function drawHeader(ctx: Ctx, title: string, subtitle?: string) {
  const HEADER_HEIGHT = 68
  drawRect(ctx, 0, 0, PAGE.width, HEADER_HEIGHT, NAVY)
  drawRect(ctx, 0, HEADER_HEIGHT, PAGE.width, 3, GOLD)
  if (ctx.logo) {
    const maxH = 40
    const scale = Math.min(maxH / ctx.logo.height, 160 / ctx.logo.width)
    const w = ctx.logo.width * scale
    const h = ctx.logo.height * scale
    // White pill behind the logo so dark parts don't disappear on navy.
    const padX = 8, padY = 5
    drawRect(ctx, MARGIN - padX, (HEADER_HEIGHT - h) / 2 - padY, w + padX * 2, h + padY * 2, [1, 1, 1])
    ctx.page.drawImage(ctx.logo, {
      x: MARGIN,
      y: yFromTop((HEADER_HEIGHT - h) / 2 + h),
      width: w,
      height: h,
    })
  } else {
    drawText(ctx, 'EAGLEVIEW', { x: MARGIN, top: 22, size: 20, bold: true, color: [1, 1, 1] })
  }
  drawTextRight(ctx, title, { rightX: PAGE.width - MARGIN, top: 20, size: 15, bold: true, color: [1, 1, 1] })
  if (subtitle) {
    drawTextRight(ctx, subtitle, { rightX: PAGE.width - MARGIN, top: 42, size: 9, color: [0.85, 0.87, 0.92] })
  }
  return HEADER_HEIGHT + 3 // returns the bottom Y of the header block
}

// Little gold section-title with a navy hairline under it.
function drawSectionTitle(ctx: Ctx, title: string, top: number): number {
  drawText(ctx, title, { x: MARGIN, top, size: 9, bold: true, color: GOLD })
  drawLine(ctx, MARGIN, top + 14, PAGE.width - MARGIN, top + 14, 0.7, NAVY)
  return top + 22
}

// Two-column label/value grid — used for claim identity + vehicle spec.
function drawLabeledGrid(
  ctx: Ctx,
  rows: Array<{ label: string; value: string }>,
  opts: { top: number; cols: number; contentWidth: number; rowHeight?: number; labelSize?: number; valueSize?: number },
): number {
  const { top, cols, contentWidth } = opts
  const rowHeight = opts.rowHeight ?? 34
  const labelSize = opts.labelSize ?? 7
  const valueSize = opts.valueSize ?? 11
  const colWidth = contentWidth / cols
  const numRows = Math.ceil(rows.length / cols)
  rows.forEach((row, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = MARGIN + c * colWidth
    const y = top + r * rowHeight
    drawText(ctx, row.label, { x, top: y, size: labelSize, bold: true, color: MUTED })
    drawText(ctx, row.value || '—', { x, top: y + labelSize + 5, size: valueSize, bold: true, maxWidth: colWidth - 8 })
  })
  return top + numRows * rowHeight
}

function drawFooter(ctx: Ctx, claim: ClaimInfo, pageNum: number, totalPages: number) {
  const FOOT_TOP = PAGE.height - MARGIN + 10
  drawLine(ctx, MARGIN, FOOT_TOP - 12, PAGE.width - MARGIN, FOOT_TOP - 12, 0.4)
  drawText(ctx, 'Prepared by Eagleview', { x: MARGIN, top: FOOT_TOP, size: 8, color: MUTED })
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const fileStr = claim.maNumber ? `File ${toSafe(claim.maNumber)}` : ''
  drawTextRight(ctx, `${fileStr}${fileStr ? '  ·  ' : ''}${today}  ·  Page ${pageNum} of ${totalPages}`, {
    rightX: PAGE.width - MARGIN, top: FOOT_TOP, size: 8, color: MUTED,
  })
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
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const contentWidth = PAGE.width - MARGIN * 2
  const TOTAL_PAGES = 2

  // ========================================================================
  //  PAGE 1 — Claim identity, insured/adjuster, loss vehicle
  // ========================================================================
  const page1 = doc.addPage([PAGE.width, PAGE.height])
  const ctx: Ctx = { doc, page: page1, fontBody, fontBold, logo }

  const headerBottom = drawHeader(ctx, 'ACTUAL CASH VALUE REPORT', `Prepared ${today}`)

  // ── CLAIM IDENTITY ─────────────────────────────────────────────────────
  let top = headerBottom + 32
  top = drawSectionTitle(ctx, 'CLAIM INFORMATION', top)
  top = drawLabeledGrid(ctx, [
    { label: 'FILE #',        value: toSafe(claim.maNumber) },
    { label: 'CLAIM #',       value: toSafe(claim.claimNumber) },
    { label: 'DATE OF LOSS',  value: fmtDate(claim.dateOfLoss) },
    { label: 'REPORT DATE',   value: today },
    { label: 'INSURANCE CO',  value: toSafe(claim.insuranceCompany) },
    { label: 'POLICY / DEDUCTIBLE', value: claim.deductible ? fmtCurrency(claim.deductible) : '—' },
  ], { top, cols: 3, contentWidth, rowHeight: 40 })

  // ── INSURED + ADJUSTER (side by side blocks) ───────────────────────────
  top += 18
  top = drawSectionTitle(ctx, 'PARTIES', top)
  const halfW = contentWidth / 2 - 8

  // Insured / Client block
  drawText(ctx, 'INSURED / CLIENT', { x: MARGIN, top, size: 7, bold: true, color: MUTED })
  drawText(ctx, toSafe(claim.insuredName) || '—', { x: MARGIN, top: top + 12, size: 12, bold: true, maxWidth: halfW })
  let insuredY = top + 30
  if (claim.ownerPhone) { drawText(ctx, toSafe(claim.ownerPhone), { x: MARGIN, top: insuredY, size: 9.5, color: MUTED }); insuredY += 13 }
  if (claim.ownerEmail) { drawText(ctx, toSafe(claim.ownerEmail), { x: MARGIN, top: insuredY, size: 9.5, color: MUTED, maxWidth: halfW }); insuredY += 13 }
  if (claim.ownerAddress) { drawText(ctx, toSafe(claim.ownerAddress), { x: MARGIN, top: insuredY, size: 9.5, color: MUTED, maxWidth: halfW }); insuredY += 13 }

  // Adjuster block
  const adjX = MARGIN + contentWidth / 2 + 8
  drawText(ctx, 'ASSIGNED ADJUSTER', { x: adjX, top, size: 7, bold: true, color: MUTED })
  drawText(ctx, toSafe(claim.adjuster) || '—', { x: adjX, top: top + 12, size: 12, bold: true, maxWidth: halfW })
  let adjY = top + 30
  if (claim.adjusterPhone) { drawText(ctx, toSafe(claim.adjusterPhone), { x: adjX, top: adjY, size: 9.5, color: MUTED }); adjY += 13 }
  if (claim.adjusterEmail) { drawText(ctx, toSafe(claim.adjusterEmail), { x: adjX, top: adjY, size: 9.5, color: MUTED, maxWidth: halfW }); adjY += 13 }

  top = Math.max(insuredY, adjY) + 12

  // ── LOSS VEHICLE ────────────────────────────────────────────────────────
  top += 14
  top = drawSectionTitle(ctx, 'LOSS VEHICLE', top)
  const vehicleStr = [claim.year, claim.make, claim.model, claim.trim].filter(Boolean).join(' ')
  drawText(ctx, toSafe(vehicleStr) || '—', { x: MARGIN, top, size: 18, bold: true, maxWidth: contentWidth })
  top += 30

  // Vehicle details grid (3 columns).
  top = drawLabeledGrid(ctx, [
    { label: 'VIN',           value: toSafe(claim.vin) },
    { label: 'MILEAGE',       value: `${fmtNumber(claim.mileage)} mi` },
    { label: 'YEAR',          value: claim.year ? String(claim.year) : '—' },
    { label: 'ENGINE',        value: toSafe(claim.engine) },
    { label: 'TRANSMISSION',  value: toSafe(claim.transmission) },
    { label: 'DRIVETRAIN',    value: toSafe(claim.drivetrain) },
    { label: 'FUEL TYPE',     value: toSafe(claim.fuelType) },
    { label: 'ZIP',           value: toSafe(claim.zip) },
    { label: 'SEARCH RADIUS', value: claim.radius ? `${claim.radius} mi` : '—' },
  ], { top, cols: 3, contentWidth, rowHeight: 40 })

  // ── METHODOLOGY NOTE (bottom of page 1, gives context before comps) ─────
  top += 22
  drawRect(ctx, MARGIN, top, contentWidth, 78, BG_TINT, HAIRLINE)
  drawText(ctx, 'METHODOLOGY', { x: MARGIN + 14, top: top + 10, size: 8, bold: true, color: GOLD })
  const methodLines = [
    'The Actual Cash Value is derived from three comparable vehicles selected from the local',
    'private-party and dealer market within the search radius above. Each comparable is adjusted',
    'for mileage and model year variance versus the loss vehicle. The mean of the three adjusted',
    'values, less private-party market deduction, plus applicable sales tax, produces the ACV shown',
    'on page 2.',
  ]
  methodLines.forEach((l, i) => {
    drawText(ctx, l, { x: MARGIN + 14, top: top + 26 + i * 11, size: 9, color: [0.2, 0.25, 0.35] })
  })

  drawFooter(ctx, claim, 1, TOTAL_PAGES)

  // ========================================================================
  //  PAGE 2 — Comps + valuation
  // ========================================================================
  const page2 = doc.addPage([PAGE.width, PAGE.height])
  ctx.page = page2

  const p2HeaderBottom = drawHeader(ctx, 'COMPARABLES & VALUATION',
    claim.maNumber ? `File ${toSafe(claim.maNumber)}` : undefined)

  // ── COMPARABLE VEHICLES ─────────────────────────────────────────────────
  top = p2HeaderBottom + 28
  top = drawSectionTitle(ctx, 'COMPARABLE VEHICLES', top)

  // 3 comp cards side-by-side, taller than v1 for better spacing.
  const CARD_GAP = 10
  const CARD_W = (contentWidth - CARD_GAP * 2) / 3
  const CARD_H = 220

  comps.slice(0, 3).forEach((c, i) => {
    const cx = MARGIN + i * (CARD_W + CARD_GAP)
    drawRect(ctx, cx, top, CARD_W, CARD_H, BG_TINT, HAIRLINE)
    // Gold badge with comp number.
    drawRect(ctx, cx + 12, top + 12, 48, 18, GOLD)
    drawText(ctx, `COMP ${i + 1}`, { x: cx + 18, top: top + 15, size: 8, bold: true, color: [1, 1, 1] })

    // Title (year/make/model/trim) — wraps to 2 lines if needed.
    const compTitle = [c.year, c.make, c.model].filter(Boolean).join(' ')
    drawText(ctx, toSafe(compTitle), { x: cx + 12, top: top + 40, size: 11, bold: true, maxWidth: CARD_W - 24 })
    if (c.trim) drawText(ctx, toSafe(c.trim), { x: cx + 12, top: top + 55, size: 9, color: MUTED, maxWidth: CARD_W - 24 })

    // Details block, generously spaced.
    const detailTop = top + 78
    const rowH = 16
    const details: Array<[string, string]> = [
      ['Listed price', fmtCurrency(c.price)],
      ['Miles', `${fmtNumber(c.miles)} mi`],
      ['Miles diff', `${c.mileageDiffRaw > 0 ? '+' : ''}${fmtNumber(c.mileageDiffRaw)}`],
      ['Mileage adj', fmtCurrency(c.mileageAdjDollar)],
      ['Year adj', fmtCurrency(c.yearAdjDollar)],
    ]
    details.forEach((d, di) => {
      drawText(ctx, d[0], { x: cx + 12, top: detailTop + di * rowH, size: 9, color: MUTED })
      drawTextRight(ctx, d[1], { rightX: cx + CARD_W - 12, top: detailTop + di * rowH, size: 9, bold: true })
    })

    // Final value strip at bottom.
    const valueTop = top + CARD_H - 32
    drawRect(ctx, cx, valueTop, CARD_W, 32, NAVY)
    drawText(ctx, 'COMP VALUE', { x: cx + 12, top: valueTop + 7, size: 7, bold: true, color: [0.85, 0.87, 0.92] })
    drawTextRight(ctx, fmtCurrency(c.compValue), { rightX: cx + CARD_W - 12, top: valueTop + 6, size: 16, bold: true, color: [1, 1, 1] })
  })

  top += CARD_H + 30

  // ── VALUATION ────────────────────────────────────────────────────────────
  top = drawSectionTitle(ctx, 'VALUATION', top)

  const eqRows: Array<{ label: string; value: number; hint?: string; emphasize?: boolean }> = [
    { label: 'Comparable 1 value',                value: result.comp1Value },
    { label: 'Comparable 2 value',                value: result.comp2Value },
    { label: 'Comparable 3 value',                value: result.comp3Value },
    { label: 'Average of comparables',            value: result.averageValue,        hint: 'sum / 3', emphasize: true },
    { label: 'Vehicle history adjustment',        value: adjustments.vehicleHistory, hint: adjustments.vehicleHistoryNote || undefined },
    { label: 'Prior damage adjustment',           value: adjustments.priorDamages,   hint: adjustments.priorDamagesNote  || undefined },
    { label: 'Additions',                         value: adjustments.additions,      hint: adjustments.additionsNote     || undefined },
    { label: 'Dealer vs. private market',         value: adjustments.deductions,     hint: adjustments.deductionsNote    || 'private-party basis' },
    { label: `Sales tax (${(adjustments.taxRate ?? 0).toFixed(2).replace(/\.00$/, '')}%)`, value: result.taxAmount },
  ]
  const rowH2 = 18
  const labelX = MARGIN + 12
  const valueRightX = MARGIN + contentWidth - 12
  eqRows.forEach((r, ri) => {
    const t = top + ri * rowH2
    drawText(ctx, r.label, { x: labelX, top: t, size: 10, color: r.value === 0 && !r.emphasize ? MUTED : BLACK, bold: r.emphasize })
    if (r.hint) {
      const labelWidth = fontBody.widthOfTextAtSize(r.label, 10)
      drawText(ctx, `— ${toSafe(r.hint)}`, { x: labelX + labelWidth + 8, top: t, size: 8.5, color: MUTED })
    }
    drawTextRight(ctx, fmtCurrencyCents(r.value), { rightX: valueRightX, top: t, size: 10, bold: r.emphasize })
    if (r.emphasize) drawLine(ctx, MARGIN, t + rowH2 - 2, PAGE.width - MARGIN, t + rowH2 - 2, 0.4)
  })

  // Final ACV box (bigger, more presence).
  const acvTop = top + eqRows.length * rowH2 + 16
  const acvBoxH = 56
  drawRect(ctx, MARGIN, acvTop, contentWidth, acvBoxH, NAVY)
  drawText(ctx, 'ACTUAL CASH VALUE', { x: MARGIN + 20, top: acvTop + 12, size: 11, bold: true, color: [0.85, 0.87, 0.92] })
  drawText(ctx, 'Final settlement basis (inc. sales tax)', { x: MARGIN + 20, top: acvTop + 30, size: 9, color: [0.7, 0.75, 0.85] })
  drawTextRight(ctx, fmtCurrencyCents(result.acv), { rightX: MARGIN + contentWidth - 20, top: acvTop + 14, size: 28, bold: true, color: GOLD })

  // ── NOTES (if any) ──────────────────────────────────────────────────────
  if (adjustments.notes && adjustments.notes.trim().length > 0) {
    const notesTop = acvTop + acvBoxH + 26
    drawText(ctx, 'NOTES', { x: MARGIN, top: notesTop, size: 8, bold: true, color: MUTED })
    drawLine(ctx, MARGIN, notesTop + 12, PAGE.width - MARGIN, notesTop + 12, 0.4)
    const size = 9.5
    const maxW = contentWidth
    const words = toSafe(adjustments.notes.trim()).split(/\s+/)
    let line = ''
    let y = notesTop + 22
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w
      if (fontBody.widthOfTextAtSize(cand, size) <= maxW) {
        line = cand
      } else {
        drawText(ctx, line, { x: MARGIN, top: y, size })
        y += size + 4
        line = w
      }
    }
    if (line) drawText(ctx, line, { x: MARGIN, top: y, size })
  }

  drawFooter(ctx, claim, 2, TOTAL_PAGES)

  return doc.save()
}
