"use client"

// Assignment Sheet — a single-page printable summary of the claim.
// Rendered as a native jsPDF document (vector text, selectable in viewers),
// not an html2canvas raster. Layout = card-boxed sections, 2-up pairing,
// bottom-anchored half-width Valuations.
//
// IMPORTANT: this layout mirrors scripts/preview-assignment-sheet.mjs exactly.
// Any visual change must be made in BOTH files — the preview harness is the
// fast iteration loop (Node-only, no browser needed) and the component is
// what ships. See docs on the preview harness + Henry's design rules in
// memory/project_assignment_sheet_wip.md.
import { jsPDF } from 'jspdf'
import type { ClaimInfo, ClaimType } from '@/lib/acv/types'
import { alertDialog } from '@/components/ui/dialog-service'
import { formatCurrency as formatCurrencyMoney } from '@/lib/acv/calculations'
import { mileageModifierFor, type DVState } from '@/components/claim/dv-tab'

export interface AssignmentSheetData {
  claim: ClaimInfo
  status: 'open' | 'closed'
  submittedAt: string | null
  assignedToName: string
  notesType: string
  opposingAppraiserName: string
  opposingAppraiserCompany: string
  opposingAppraiserValue: number
  insuranceOfferValue: number
  agreementAmount: number
  umpireAmount: number
  ourAcv: number
  dv: DVState | null
  claimTypes: ClaimType[]
  maEstValue: number
  maStorageValue: number
  // Umpire-row gating: Valuations drops the "Umpire Amount" row entirely
  // unless the claim has actually proceeded to umpire. Sourced from the
  // acv_history.proceeded_to_umpire column via the live claim entry.
  proceededToUmpire: boolean
}

// Blank in HAMS stays blank on the sheet — no "—" placeholders anywhere.
function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const parts = dateStr.split('T')[0].split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}

// Local money formatter: returns '' when value is 0 or NaN (not '$0'), so
// zero-value money rows render blank on the printed sheet.
function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return ''
  return '$' + Math.round(n).toLocaleString('en-US')
}

function computeFinalDv(dv: DVState | null, claimMileage: number): number {
  if (!dv) return 0
  const mileMod = dv.mileageModifier ?? mileageModifierFor(claimMileage)
  const baselineLov = Math.max(0, dv.kbbHigh - dv.kbbLow)
  const smLov = baselineLov * dv.damageSeverity * mileMod
  if (!dv.withPriorLoss) return smLov
  const adjustedLov = smLov * (dv.priorLossPercent / 100)
  return smLov - adjustedLov
}

function assignmentTypeLabel(notesType: string): string {
  if (notesType === 'dv') return 'Diminished Value'
  if (notesType === 'acv-umpire') return 'ACV → Umpire'
  if (notesType === 'dv-umpire') return 'DV → Umpire'
  return 'ACV'
}

// Verbiage used for the "MA ___" row in Valuations. Mirrors
// CLAIM_TYPE_LABELS in ClaimWorkspace.tsx so what the user sees in the UI
// chip row matches what prints. Only PRIMARY_VALUATION_TYPES ever appear
// here — modifier types (rta, specialty, umpire, other) never get an MA
// row even when selected.
const CLAIM_TYPE_LABEL: Record<string, string> = {
  acv: 'ACV',
  dv: 'DV',
  estimate: 'Est Dispute',
  storage: 'Storage',
  desk: 'Desk',
  lou: 'LOU',
  full: 'FULL',
  salvage: 'Salvage',
}

// Primary valuation types — selecting 2+ of these blanks the entire
// Valuations card (title still renders, every row removed). Any one of
// these alone shows its 'MA [type]' row with the matching value.
const PRIMARY_VALUATION_TYPES = ['acv', 'dv', 'storage', 'desk', 'lou', 'full'] as const

// Modern Appraisers logo recolored to solid black while preserving transparency.
async function loadLogoBlackDataUrl(): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = '/companies/modern-appraisers/logo.png'
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

// ─── Layout constants (keep in sync with preview harness) ──────────────────
const PAGE_W = 612
const PAGE_H = 792
const MARGIN_X = 42
const MARGIN_TOP = 32
const MARGIN_BOTTOM = 36
const CARD_LEFT = MARGIN_X
const CARD_RIGHT = PAGE_W - MARGIN_X
const CARD_W_FULL = CARD_RIGHT - CARD_LEFT
const COL_GAP = 10
const CARD_W_HALF = (CARD_W_FULL - COL_GAP) / 2

const PAD_X = 10
const PAD_Y_TOP = 14
const PAD_Y_BOT = 8
const TITLE_STRIP_H = 20
const ROW_H = 16
const LABEL_COL_W_FULL = 110
const LABEL_COL_W_HALF = 90
const CARD_GAP_Y = 10
const BORDER_W = 0.5
const BORDER_RGB: [number, number, number] = [60, 60, 60]
const TITLE_BG_RGB: [number, number, number] = [238, 238, 238]
const LABEL_RGB: [number, number, number] = [85, 85, 85]
const VALUE_RGB: [number, number, number] = [0, 0, 0]

const H_TITLE = 10
const H_LABEL = 8.5
const H_VALUE = 10
const H_HEADER_TITLE = 15
const INFO_LABEL_H = 8
const INFO_VALUE_H = 15

interface Row { label: string; value: string }
interface MoneyRow { label: string; value: number }

function wrapTo(pdf: jsPDF, text: string, maxW: number): string[] {
  if (!text) return ['']
  return pdf.splitTextToSize(text, maxW)
}

function cardHeight(pdf: jsPDF, rows: Row[], width: number): number {
  const labelColW = width === CARD_W_FULL ? LABEL_COL_W_FULL : LABEL_COL_W_HALF
  const valueColW = width - PAD_X * 2 - labelColW
  let totalLines = 0
  for (const r of rows) totalLines += wrapTo(pdf, r.value || '', valueColW).length
  const contentH = PAD_Y_TOP + ROW_H * totalLines + PAD_Y_BOT - (ROW_H - 11)
  return TITLE_STRIP_H + contentH
}

function drawCardAt(
  pdf: jsPDF,
  opts: {
    x: number
    y: number
    width: number
    title: string
    rows: Row[] | MoneyRow[]
    isMoney?: boolean
    rowH?: number
    forceHeight?: number | null
  },
): number {
  const { x, y, width, title, rows, isMoney = false, rowH = ROW_H, forceHeight = null } = opts
  const labelColW = width === CARD_W_FULL ? LABEL_COL_W_FULL : LABEL_COL_W_HALF
  const valueColX = x + PAD_X + labelColW
  const valueColW = width - PAD_X * 2 - labelColW

  const perRowLines = isMoney
    ? rows.map(() => 1)
    : rows.map(r => wrapTo(pdf, (r as Row).value || '', valueColW).length)
  const totalLines = perRowLines.reduce((a, b) => a + b, 0)
  const naturalContentH = PAD_Y_TOP + rowH * totalLines + PAD_Y_BOT - (rowH - 11)
  const naturalCardH = TITLE_STRIP_H + naturalContentH
  const cardH = forceHeight != null ? forceHeight : naturalCardH

  pdf.setFillColor(TITLE_BG_RGB[0], TITLE_BG_RGB[1], TITLE_BG_RGB[2])
  pdf.rect(x, y, width, TITLE_STRIP_H, 'F')
  pdf.setFont('times', 'bold').setFontSize(H_TITLE).setTextColor(0, 0, 0)
  pdf.text(title.toUpperCase(), x + PAD_X, y + 12.5, { charSpace: 1.3 })

  let rowY = y + TITLE_STRIP_H + PAD_Y_TOP + 1
  for (const row of rows) {
    pdf.setFont('times', 'normal').setFontSize(H_LABEL).setTextColor(LABEL_RGB[0], LABEL_RGB[1], LABEL_RGB[2])
    pdf.text(row.label, x + PAD_X, rowY)
    if (isMoney) {
      pdf.setFont('times', 'bold').setFontSize(H_VALUE).setTextColor(VALUE_RGB[0], VALUE_RGB[1], VALUE_RGB[2])
      const vStr = fmtMoney((row as MoneyRow).value)
      pdf.text(vStr, valueColX, rowY)
      rowY += rowH
    } else {
      pdf.setFont('times', 'normal').setFontSize(H_VALUE).setTextColor(VALUE_RGB[0], VALUE_RGB[1], VALUE_RGB[2])
      const lines = wrapTo(pdf, (row as Row).value || '', valueColW)
      for (let li = 0; li < lines.length; li++) {
        pdf.text(lines[li] || '', valueColX, rowY + li * rowH)
      }
      rowY += rowH * lines.length
    }
  }

  pdf.setDrawColor(BORDER_RGB[0], BORDER_RGB[1], BORDER_RGB[2]).setLineWidth(BORDER_W)
  pdf.line(x, y + TITLE_STRIP_H, x + width, y + TITLE_STRIP_H)
  pdf.rect(x, y, width, cardH, 'S')

  return cardH
}

interface Ctx { pdf: jsPDF; y: number }

function drawPairRow(ctx: Ctx, left: { title: string; rows: Row[] }, right: { title: string; rows: Row[] } | null) {
  const { pdf } = ctx
  const leftH = cardHeight(pdf, left.rows, CARD_W_HALF)
  const rightH = right ? cardHeight(pdf, right.rows, CARD_W_HALF) : leftH
  const rowH = Math.max(leftH, rightH)
  drawCardAt(pdf, { x: CARD_LEFT, y: ctx.y, width: CARD_W_HALF, title: left.title, rows: left.rows, forceHeight: rowH })
  if (right) {
    drawCardAt(pdf, { x: CARD_LEFT + CARD_W_HALF + COL_GAP, y: ctx.y, width: CARD_W_HALF, title: right.title, rows: right.rows, forceHeight: rowH })
  }
  ctx.y += rowH + CARD_GAP_Y
}

function drawFullCard(ctx: Ctx, title: string, rows: Row[]) {
  const h = drawCardAt(ctx.pdf, { x: CARD_LEFT, y: ctx.y, width: CARD_W_FULL, title, rows })
  ctx.y += h + CARD_GAP_Y
}

// Big info strip above the first paired row. Four columns across the content
// width; both label and value centered inside each column. Value font size
// shrinks uniformly across all four so visual weight stays consistent even
// if one value (e.g. the vehicle string) would otherwise overflow.
function drawInfoStrip(ctx: Ctx, cells: Array<{ label: string; value: string }>) {
  const { pdf } = ctx
  const colW = CARD_W_FULL / cells.length
  const colInsetX = 6
  const colInnerW = colW - colInsetX * 2
  const labelY = ctx.y + 8
  const valueY = ctx.y + 8 + INFO_LABEL_H + 6

  pdf.setFont('times', 'bold')
  let valSize = INFO_VALUE_H
  while (valSize > 8) {
    pdf.setFontSize(valSize)
    let allFit = true
    for (const cell of cells) {
      if (pdf.getTextWidth(cell.value || '') > colInnerW) { allFit = false; break }
    }
    if (allFit) break
    valSize -= 0.5
  }

  for (let i = 0; i < cells.length; i++) {
    const colCenter = CARD_LEFT + i * colW + colW / 2
    pdf.setFont('times', 'bold').setFontSize(INFO_LABEL_H).setTextColor(90, 90, 90)
    const labelText = cells[i].label.toUpperCase()
    const labelW = pdf.getTextWidth(labelText)
    pdf.text(labelText, colCenter - labelW / 2, labelY, { charSpace: 1 })

    pdf.setFont('times', 'bold').setFontSize(valSize).setTextColor(0, 0, 0)
    const val = cells[i].value || ''
    const valW = pdf.getTextWidth(val)
    pdf.text(val, colCenter - valW / 2, valueY)
  }
  const ruleY = valueY + 8
  pdf.setDrawColor(180, 180, 180).setLineWidth(0.4)
  pdf.line(CARD_LEFT, ruleY, CARD_RIGHT, ruleY)
  ctx.y = ruleY + 12
}

// Labor-rates matrix. 5x5 fill-in grid with row labels on the left (MA/OA/
// Ins/Shop/Hero) and column headers on top (Sheet Metal / Refinish /
// Mechanical / Frame / Materials). Roomy data cells so an appraiser can
// hand-write a number into each when the sheet is printed. Only rendered
// for claims that include the 'estimate' claim type. Shares the same card
// chrome (title strip + outer border) as every other card.
function drawEstimateMatrix(
  pdf: jsPDF,
  opts: { x: number; y: number; width: number; height: number },
) {
  const { x, y, width, height } = opts
  const rowLabels = ['MA', 'OA', 'Ins', 'Shop', 'Hero']
  const colLabels = ['Sheet Metal', 'Refinish', 'Mechanical', 'Frame', 'Materials']

  const labelColW = 42
  const dataColW = (width - labelColW) / colLabels.length
  const headerRowH = 22
  const stripH = TITLE_STRIP_H

  // Title strip (matches drawCardAt).
  pdf.setFillColor(TITLE_BG_RGB[0], TITLE_BG_RGB[1], TITLE_BG_RGB[2])
  pdf.rect(x, y, width, stripH, 'F')
  pdf.setFont('times', 'bold').setFontSize(H_TITLE).setTextColor(0, 0, 0)
  pdf.text('LABOR RATES', x + PAD_X, y + 12.5, { charSpace: 1.3 })

  // Grid area sits below the title strip.
  const gridY = y + stripH
  const gridH = height - stripH
  const dataRowH = (gridH - headerRowH) / rowLabels.length

  // Internal grid lines first (so the outer border on top covers their ends).
  pdf.setDrawColor(BORDER_RGB[0], BORDER_RGB[1], BORDER_RGB[2]).setLineWidth(BORDER_W)
  pdf.line(x, gridY + headerRowH, x + width, gridY + headerRowH)
  for (let r = 1; r < rowLabels.length; r++) {
    const ly = gridY + headerRowH + r * dataRowH
    pdf.line(x, ly, x + width, ly)
  }
  pdf.line(x + labelColW, gridY, x + labelColW, gridY + gridH)
  for (let c = 1; c < colLabels.length; c++) {
    const lx = x + labelColW + c * dataColW
    pdf.line(lx, gridY, lx, gridY + gridH)
  }

  // Column headers centered in each cell.
  pdf.setFont('times', 'bold').setFontSize(8).setTextColor(0, 0, 0)
  for (let c = 0; c < colLabels.length; c++) {
    const cellCenter = x + labelColW + c * dataColW + dataColW / 2
    const text = colLabels[c]
    const textW = pdf.getTextWidth(text)
    pdf.text(text, cellCenter - textW / 2, gridY + headerRowH / 2 + 3)
  }
  // Row labels centered in each row.
  pdf.setFont('times', 'bold').setFontSize(10).setTextColor(0, 0, 0)
  for (let r = 0; r < rowLabels.length; r++) {
    const rowCenter = gridY + headerRowH + r * dataRowH + dataRowH / 2 + 3
    const text = rowLabels[r]
    const textW = pdf.getTextWidth(text)
    pdf.text(text, x + labelColW / 2 - textW / 2, rowCenter)
  }

  // Rule between title strip and grid, then outer border around the WHOLE
  // card (title + grid) — matches drawCardAt so this looks like every other
  // card on the page.
  pdf.line(x, gridY, x + width, gridY)
  pdf.rect(x, y, width, height, 'S')
}

function drawHeader(ctx: Ctx, logo: { dataUrl: string; width: number; height: number } | null) {
  const { pdf } = ctx
  const headerY = ctx.y
  const logoH = 32
  if (logo) {
    const logoW = (logo.width / logo.height) * logoH
    pdf.addImage(logo.dataUrl, 'PNG', CARD_LEFT, headerY, logoW, logoH)
  }
  pdf.setFont('times', 'bold').setFontSize(H_HEADER_TITLE).setTextColor(0, 0, 0)
  const title = 'ASSIGNMENT SHEET'
  const titleW = pdf.getTextWidth(title)
  pdf.text(title, CARD_RIGHT - titleW, headerY + 18, { charSpace: 1 })
  const ruleY = headerY + Math.max(logoH, 32) + 4
  pdf.setDrawColor(0, 0, 0).setLineWidth(1.25)
  pdf.line(CARD_LEFT, ruleY, CARD_RIGHT, ruleY)
  ctx.y = ruleY + 10
}

async function buildAssignmentSheetPdf(data: AssignmentSheetData): Promise<Blob> {
  const {
    claim, assignedToName,
    notesType, opposingAppraiserName, opposingAppraiserCompany, opposingAppraiserValue,
    insuranceOfferValue, agreementAmount, umpireAmount, ourAcv, dv,
    claimTypes, maEstValue, maStorageValue, proceededToUmpire,
  } = data

  const yearStr = claim.year > 0 ? String(claim.year) : ''
  const mileageStr = claim.mileage > 0 ? claim.mileage.toLocaleString() : ''
  const deductibleStr = claim.deductible && claim.deductible > 0 ? formatCurrencyMoney(claim.deductible) : ''
  const negotiating = claim.negotiatingAppraiser || assignedToName || ''
  const opposingParts: string[] = []
  if (opposingAppraiserName) opposingParts.push(opposingAppraiserName)
  if (opposingAppraiserCompany) opposingParts.push(opposingAppraiserCompany)
  const opposing = opposingParts.join(' · ')
  const ownerDifferent = Boolean(claim.ownerName && claim.ownerName.trim() && claim.ownerName.trim() !== claim.insuredName.trim())
  // Claimant and Vehicle Location cards ALWAYS render (even when every field
  // is blank). Blank values display as empty strings next to their labels —
  // the layout stays consistent across every claim so an appraiser printing
  // and filling in by hand sees the same card arrangement every time.
  const combinedVehicle = [yearStr, claim.make || '', claim.model || '', claim.trim || ''].filter(Boolean).join(' ')
  const ourDv = computeFinalDv(dv, claim.mileage)

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  pdf.setLineHeightFactor(1.15)
  const ctx: Ctx = { pdf, y: MARGIN_TOP }

  let logo: { dataUrl: string; width: number; height: number } | null = null
  try { logo = await loadLogoBlackDataUrl() } catch { logo = null }

  drawHeader(ctx, logo)

  // Top info strip — MA# / CL# / Client / Vehicle at-a-glance.
  drawInfoStrip(ctx, [
    { label: 'MA #', value: claim.maNumber || '' },
    { label: 'CL #', value: claim.claimNumber || '' },
    { label: 'Client', value: claim.clientName || '' },
    { label: 'Vehicle', value: combinedVehicle },
  ])

  // Row 1: CLAIM + INSURANCE
  const claimRows: Row[] = [
    { label: 'MA #', value: claim.maNumber || '' },
    { label: 'CL #', value: claim.claimNumber || '' },
    { label: 'Date of Loss', value: fmtDate(claim.dateOfLoss) },
    { label: 'Assignment', value: assignmentTypeLabel(notesType) },
    { label: 'Claim For', value: claim.clientType || '' },
  ]
  const insuranceRows: Row[] = [
    { label: 'Company', value: claim.insuranceCompany || '' },
    { label: 'Adjuster', value: claim.adjuster || '' },
    { label: 'Phone', value: claim.adjusterPhone || '' },
    { label: 'Email', value: claim.adjusterEmail || '' },
  ]
  drawPairRow(ctx,
    { title: 'Claim', rows: claimRows },
    { title: 'Insurance', rows: insuranceRows },
  )

  // Row 2: OWNER / INSURED + CLAIMANT
  const ownerInsuredRows: Row[] = [
    { label: 'Owner', value: claim.ownerName || claim.insuredName || '' },
    ...(ownerDifferent ? [{ label: 'Insured', value: claim.insuredName || '' }] : []),
    { label: 'Client', value: claim.clientName || '' },
    { label: 'Contact', value: claim.clientContactName || '' },
    { label: 'Phone', value: claim.ownerPhone || '' },
    { label: 'Email', value: claim.ownerEmail || '' },
    { label: 'Address', value: claim.ownerAddress || '' },
    { label: 'Deductible', value: deductibleStr },
  ]
  const claimantRows: Row[] = [
    { label: 'Name', value: claim.claimantName || '' },
    { label: 'Phone', value: claim.claimantPhone || '' },
    { label: 'Email', value: claim.claimantEmail || '' },
    { label: 'Address', value: claim.claimantAddress || '' },
  ]
  drawPairRow(ctx,
    { title: 'Owner / Insured', rows: ownerInsuredRows },
    { title: 'Claimant', rows: claimantRows },
  )

  // Row 3: VEHICLE + VEHICLE LOCATION
  const vehicleRows: Row[] = [
    { label: 'Vehicle', value: combinedVehicle },
    { label: 'VIN', value: claim.vin || '' },
    { label: 'Mileage', value: mileageStr },
  ]
  const locationRows: Row[] = [
    { label: 'Location', value: claim.vehicleLocationName || '' },
    { label: 'Contact', value: claim.vehicleLocationContact || '' },
    { label: 'Address', value: claim.vehicleLocationAddress || '' },
  ]
  drawPairRow(ctx,
    { title: 'Vehicle', rows: vehicleRows },
    { title: 'Vehicle Location', rows: locationRows },
  )

  // Row 4: APPRAISERS (full width)
  const appraiserRows: Row[] = [
    { label: 'MA Appraiser', value: negotiating },
    { label: 'Opposing Appraiser', value: opposing },
  ]
  drawFullCard(ctx, 'Appraisers', appraiserRows)

  // ─── Valuations + Labor Rates gating (Henry 2026-10-25 spec) ──────────
  const types = claimTypes ?? []
  const hasEstimate = types.includes('estimate')
  const primaryHits = PRIMARY_VALUATION_TYPES.filter(t => types.includes(t))
  const multiPrimary = primaryHits.length >= 2
  const showLaborRates = hasEstimate                 // always when Est is in types
  // Umpire row only renders if the claim actually went to umpire. Phase info
  // isn't threaded directly; the claim-level `proceededToUmpire` flag + a
  // selected `umpire` claim-type both qualify.
  const isUmpire = proceededToUmpire || types.includes('umpire')

  const maValues: Record<string, number> = {
    acv: ourAcv, dv: ourDv, storage: maStorageValue,
    // Desk / LOU / Full / Salvage currently have no auto-computed MA value
    // on the claim record; the row prints with an empty value for hand-write.
    desk: 0, lou: 0, full: 0, salvage: 0,
  }

  // Build money rows per gating:
  //  - multiPrimary: Valuations card has NO rows at all (blank box). Still
  //    anchors to the bottom and matches Labor Rates height when present.
  //  - single primary: one 'MA [type]' row + OA/Ins/Agreed/(Umpire).
  //  - no primary, est-only or none: just OA/Ins/Agreed/(Umpire).
  let moneyRows: MoneyRow[] = []
  if (!multiPrimary) {
    if (primaryHits.length === 1) {
      const t = primaryHits[0]
      moneyRows.push({ label: `MA ${CLAIM_TYPE_LABEL[t] ?? t}`, value: maValues[t] ?? 0 })
    }
    // Est Dispute isn't a "primary valuation" per the new rules — its MA row
    // only shows when est is the ONLY claim type selected (no primaries).
    if (hasEstimate && primaryHits.length === 0) {
      moneyRows.push({ label: `MA ${CLAIM_TYPE_LABEL['estimate']}`, value: maEstValue })
    }
    moneyRows.push({ label: 'OA Value', value: opposingAppraiserValue })
    moneyRows.push({ label: 'Ins. Co. Offer', value: insuranceOfferValue })
    moneyRows.push({ label: 'Agreed Amount', value: agreementAmount })
    if (isUmpire) moneyRows.push({ label: 'Umpire Amount', value: umpireAmount })
  }

  // Height target: when multiPrimary → match the Labor Rates height so the
  // bottom row looks balanced; else size by rows with the same shrink-to-fit
  // logic as before. If no Labor Rates would render AND no rows exist, we
  // still want a visible blank card — use a sensible fallback height.
  const VALS_ROW_H_IDEAL = 28
  const VALS_ROW_H_MIN = 18
  const valsOverhead = TITLE_STRIP_H + PAD_Y_TOP + PAD_Y_BOT + 11
  const availForVals = PAGE_H - MARGIN_BOTTOM - ctx.y
  let valsNaturalH: number
  let VALS_ROW_H = VALS_ROW_H_IDEAL
  if (moneyRows.length === 0) {
    // Blank card: use a fixed sensible height that matches the Labor Rates
    // card so the two bottom cards line up when both render.
    valsNaturalH = Math.min(availForVals - 4, 180)
  } else {
    const fittingRowH = Math.floor((availForVals - valsOverhead) / moneyRows.length)
    VALS_ROW_H = Math.max(VALS_ROW_H_MIN, Math.min(VALS_ROW_H_IDEAL, fittingRowH))
    valsNaturalH = TITLE_STRIP_H + PAD_Y_TOP + VALS_ROW_H * moneyRows.length + PAD_Y_BOT - (VALS_ROW_H - 11)
  }
  const valsY = PAGE_H - MARGIN_BOTTOM - valsNaturalH
  if (valsY > ctx.y) ctx.y = valsY

  drawCardAt(pdf, {
    x: CARD_LEFT,
    y: ctx.y,
    width: CARD_W_HALF,
    title: 'Valuations',
    rows: moneyRows,
    isMoney: true,
    rowH: VALS_ROW_H,
    forceHeight: valsNaturalH,
  })

  if (showLaborRates) {
    drawEstimateMatrix(pdf, {
      x: CARD_LEFT + CARD_W_HALF + COL_GAP,
      y: ctx.y,
      width: CARD_W_HALF,
      height: valsNaturalH,
    })
  }

  return pdf.output('blob')
}

// Called by the Print button. Opens the generated PDF in a new browser tab.
export async function triggerAssignmentSheetPrint(fileName: string, data: AssignmentSheetData): Promise<void> {
  try {
    const blob = await buildAssignmentSheetPdf(data)
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    console.error('Assignment sheet print failed:', err)
    await alertDialog({ title: 'Print failed', message: err instanceof Error ? err.message : String(err), variant: 'danger' })
  }
}
