// Preview harness for the assignment sheet. Generates the PDF with
// realistic mock data (all optional sections populated) and converts the
// first page to PNG for visual inspection. Mirrors
// `src/components/claim/assignment-sheet.tsx` layout code exactly — keep
// them in sync by hand each iteration.
//
// Run: node scripts/preview-assignment-sheet.mjs
// Outputs: tmp/assignment-sheet-preview.pdf, tmp/assignment-sheet-preview.png

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { jsPDF } from 'jspdf'

mkdirSync('tmp', { recursive: true })

// ------- MOCK DATA (covers every conditional section) --------------------
const mock = {
  claim: {
    maNumber: '3644295',
    claimNumber: 'CLM-2026-00142',
    dateOfLoss: '2026-09-14',
    clientType: 'Insured',
    clientName: 'ClaimSolution',
    clientContactName: 'Rachel Nguyen',
    insuredName: 'Michael Anderson',
    ownerName: 'Michael Anderson',
    ownerPhone: '(702) 555-1234',
    ownerEmail: 'manderson@example.com',
    ownerAddress: '4821 Desert Breeze Dr, Las Vegas, NV 89102',
    claimantName: 'Jennifer Williams',
    claimantPhone: '(702) 555-9087',
    claimantEmail: 'jwilliams@example.com',
    claimantAddress: '219 S Rainbow Blvd, Las Vegas, NV 89145',
    insuranceCompany: 'State Farm',
    adjuster: 'David Chen',
    adjusterPhone: '(800) 555-7421',
    adjusterEmail: 'dchen@statefarm.com',
    deductible: 500,
    vin: '1HGBH41JXMN109186',
    year: 2022,
    make: 'Honda',
    model: 'Accord',
    trim: 'EX-L',
    mileage: 42350,
    vehicleLocationName: 'Caliber Collision',
    vehicleLocationAddress: '3850 S Decatur Blvd, Las Vegas, NV 89103',
    vehicleLocationContact: 'Tony · (702) 555-4411',
    appraiserNotes: 'Vehicle has aftermarket wheels and tinted windows. Owner is available weekday mornings before 10 AM.',
    factOfLoss: 'Rear-end collision at a stoplight on W Charleston Blvd. Insured was stopped waiting for the light to change when claimant failed to stop in time.',
    negotiatingAppraiser: 'Henry Aleksanyan',
  },
  status: 'open',
  submittedAt: null,
  assignedToName: 'Henry Aleksanyan',
  notesType: 'acv',
  claimTypes: ['acv', 'estimate'],
  opposingAppraiserName: 'Jason Rodriguez',
  opposingAppraiserCompany: 'Nationwide Appraisal Services',
  opposingAppraiserValue: 18500,
  insuranceOfferValue: 17200,
  agreementAmount: 19800,
  umpireAmount: 0,
  ourAcv: 20450,
  dv: null,
  maEstValue: 0,
  maStorageValue: 0,
  proceededToUmpire: false,
}

// ------- LAYOUT ENGINE (keep in sync with assignment-sheet.tsx) ---------
//
// Card-boxed layout with 2-up row pairing (Henry 2026-10-25). Each pair
// shares a row; row height = max(card1, card2). Must fit on ONE page even
// with every optional section populated — Notes section was removed, that
// alone bought us back ~90pt of vertical.

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('T')[0].split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}

function fmtTodayLong() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d = new Date()
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function formatCurrency(n) {
  if (!Number.isFinite(n) || n === 0) return ''
  return '$' + Math.round(n).toLocaleString('en-US')
}

function assignmentTypeLabel(notesType) {
  if (notesType === 'dv') return 'Diminished Value'
  if (notesType === 'acv-umpire') return 'ACV → Umpire'
  if (notesType === 'dv-umpire') return 'DV → Umpire'
  return 'ACV'
}

const CLAIM_TYPE_LABEL = {
  acv: 'ACV', dv: 'DV', estimate: 'Est Dispute', storage: 'Storage',
  desk: 'Desk', lou: 'LOU', full: 'FULL', salvage: 'Salvage',
}
const PRIMARY_VALUATION_TYPES = ['acv', 'dv', 'storage', 'desk', 'lou', 'full']

const PAGE_W = 612
const PAGE_H = 792
const MARGIN_X = 42
const MARGIN_TOP = 32
const MARGIN_BOTTOM = 36
const CARD_LEFT = MARGIN_X
const CARD_RIGHT = PAGE_W - MARGIN_X
const CARD_W_FULL = CARD_RIGHT - CARD_LEFT                  // 528
const COL_GAP = 10                                          // horizontal gap between paired cards
const CARD_W_HALF = (CARD_W_FULL - COL_GAP) / 2             // 259

// Card internals.
const PAD_X = 10
const PAD_Y_TOP = 14              // extra top-breathing room so first row doesn't touch title rule
const PAD_Y_BOT = 8
const TITLE_STRIP_H = 20
const ROW_H = 16
const LABEL_COL_W_FULL = 110
const LABEL_COL_W_HALF = 90
const CARD_GAP_Y = 10
const BORDER_W = 0.5
const BORDER_RGB = [60, 60, 60]
const TITLE_BG_RGB = [238, 238, 238]
const LABEL_RGB = [85, 85, 85]
const VALUE_RGB = [0, 0, 0]

const H_TITLE = 10
const H_LABEL = 8.5
const H_VALUE = 10
const H_HEADER_TITLE = 15

// Prominent info strip (no box) above the first paired row.
const INFO_LABEL_H = 8
const INFO_VALUE_H = 15

function wrapTo(pdf, text, maxW) {
  if (!text) return ['']
  return pdf.splitTextToSize(text, maxW)
}

// Compute card height given its row count (values can wrap, so pass pdf).
function cardHeight(pdf, rows, { width = CARD_W_FULL } = {}) {
  const labelColW = width === CARD_W_FULL ? LABEL_COL_W_FULL : LABEL_COL_W_HALF
  const valueColW = width - PAD_X * 2 - labelColW
  let totalLines = 0
  for (const r of rows) totalLines += wrapTo(pdf, r.value || '', valueColW).length
  const contentH = PAD_Y_TOP + ROW_H * totalLines + PAD_Y_BOT - (ROW_H - 11)
  return TITLE_STRIP_H + contentH
}

function moneyCardHeight(rows) {
  const contentH = PAD_Y_TOP + ROW_H * rows.length + PAD_Y_BOT - (ROW_H - 11)
  return TITLE_STRIP_H + contentH
}

function drawCardAt(pdf, { x, y, width, title, rows, isMoney = false, rowH = ROW_H, forceHeight = null }) {
  const labelColW = width === CARD_W_FULL ? LABEL_COL_W_FULL : LABEL_COL_W_HALF
  const valueColX = x + PAD_X + labelColW
  const valueColW = width - PAD_X * 2 - labelColW

  // Pre-wrap values to compute natural height; may be overridden by forceHeight
  // so paired half-width cards can bottom-align by extending the shorter one.
  const perRowLines = isMoney ? rows.map(() => 1) : rows.map(r => wrapTo(pdf, r.value || '', valueColW).length)
  const totalLines = perRowLines.reduce((a, b) => a + b, 0)
  const naturalContentH = PAD_Y_TOP + rowH * totalLines + PAD_Y_BOT - (rowH - 11)
  const naturalCardH = TITLE_STRIP_H + naturalContentH
  const cardH = forceHeight != null ? forceHeight : naturalCardH

  // Title strip.
  pdf.setFillColor(TITLE_BG_RGB[0], TITLE_BG_RGB[1], TITLE_BG_RGB[2])
  pdf.rect(x, y, width, TITLE_STRIP_H, 'F')
  pdf.setFont('times', 'bold').setFontSize(H_TITLE).setTextColor(0, 0, 0)
  pdf.text(title.toUpperCase(), x + PAD_X, y + 12.5, { charSpace: 1.3 })

  // Content.
  let rowY = y + TITLE_STRIP_H + PAD_Y_TOP + 1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    pdf.setFont('times', 'normal').setFontSize(H_LABEL).setTextColor(LABEL_RGB[0], LABEL_RGB[1], LABEL_RGB[2])
    pdf.text(row.label, x + PAD_X, rowY)
    if (isMoney) {
      // Dollar amount sits in the value column directly next to its label,
      // left-aligned (not pushed to the far right). The right half of the
      // card is left intentionally blank so the appraiser can hand-write
      // offer / counter / notes next to each printed line.
      pdf.setFont('times', 'bold').setFontSize(H_VALUE).setTextColor(VALUE_RGB[0], VALUE_RGB[1], VALUE_RGB[2])
      const vStr = formatCurrency(row.value)
      pdf.text(vStr, valueColX, rowY)
      rowY += rowH
    } else {
      pdf.setFont('times', 'normal').setFontSize(H_VALUE).setTextColor(VALUE_RGB[0], VALUE_RGB[1], VALUE_RGB[2])
      const lines = wrapTo(pdf, row.value || '', valueColW)
      for (let li = 0; li < lines.length; li++) {
        pdf.text(lines[li] || '', valueColX, rowY + li * rowH)
      }
      rowY += rowH * lines.length
    }
  }

  // Rule under title strip + outer border.
  pdf.setDrawColor(BORDER_RGB[0], BORDER_RGB[1], BORDER_RGB[2]).setLineWidth(BORDER_W)
  pdf.line(x, y + TITLE_STRIP_H, x + width, y + TITLE_STRIP_H)
  pdf.rect(x, y, width, cardH, 'S')

  return cardH
}

function drawPairRow(ctx, left, right) {
  // Draw two half-width cards side-by-side. Both cards get the SAME height
  // (= max of the two natural heights) so their bottom borders align — the
  // shorter card just has extra blank space inside its border.
  const { pdf } = ctx
  const leftH = cardHeight(pdf, left.rows, { width: CARD_W_HALF })
  const rightH = right ? cardHeight(pdf, right.rows, { width: CARD_W_HALF }) : leftH
  const rowH = Math.max(leftH, rightH)
  drawCardAt(pdf, { x: CARD_LEFT, y: ctx.y, width: CARD_W_HALF, title: left.title, rows: left.rows, forceHeight: rowH })
  if (right) {
    drawCardAt(pdf, { x: CARD_LEFT + CARD_W_HALF + COL_GAP, y: ctx.y, width: CARD_W_HALF, title: right.title, rows: right.rows, forceHeight: rowH })
  }
  ctx.y += rowH + CARD_GAP_Y
}

function drawFullCard(ctx, title, rows, { isMoney = false, rowH = ROW_H } = {}) {
  const { pdf } = ctx
  const h = drawCardAt(pdf, { x: CARD_LEFT, y: ctx.y, width: CARD_W_FULL, title, rows, isMoney, rowH })
  ctx.y += h + CARD_GAP_Y
}

// Big info strip above the first paired row of cards. 4 columns across the
// full width — label small+uppercase+gray above a bold value in larger text.
// Both the label and the value are CENTERED inside each column so the eye
// reads them as one stacked unit. All four columns use the SAME value font
// size — picked by finding the largest size at which every value fits its
// column, so the visual weight stays consistent across the row.
function drawInfoStrip(ctx, cells) {
  const { pdf } = ctx
  const colW = CARD_W_FULL / cells.length
  const colInsetX = 6
  const colInnerW = colW - colInsetX * 2
  const labelY = ctx.y + 8
  const valueY = ctx.y + 8 + INFO_LABEL_H + 6

  // Measure pass — find the largest value font size at which EVERY cell fits.
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

  // Draw pass — label centered in column, value centered in column, both at
  // the uniform size chosen above.
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
  // Thin rule under the strip to separate it from the first card row.
  const ruleY = valueY + 8
  pdf.setDrawColor(180, 180, 180).setLineWidth(0.4)
  pdf.line(CARD_LEFT, ruleY, CARD_RIGHT, ruleY)
  ctx.y = ruleY + 12
}

function drawEstimateMatrix(pdf, { x, y, width, height }) {
  const rowLabels = ['MA', 'OA', 'Ins', 'Shop', 'Hero']
  const colLabels = ['Sheet Metal', 'Refinish', 'Mechanical', 'Frame', 'Materials']
  const labelColW = 42
  const dataColW = (width - labelColW) / colLabels.length
  const headerRowH = 22

  pdf.setFillColor(TITLE_BG_RGB[0], TITLE_BG_RGB[1], TITLE_BG_RGB[2])
  pdf.rect(x, y, width, TITLE_STRIP_H, 'F')
  pdf.setFont('times', 'bold').setFontSize(H_TITLE).setTextColor(0, 0, 0)
  pdf.text('LABOR RATES', x + PAD_X, y + 12.5, { charSpace: 1.3 })

  const gridY = y + TITLE_STRIP_H
  const gridH = height - TITLE_STRIP_H
  const dataRowH = (gridH - headerRowH) / rowLabels.length

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

  pdf.setFont('times', 'bold').setFontSize(8).setTextColor(0, 0, 0)
  for (let c = 0; c < colLabels.length; c++) {
    const cellCenter = x + labelColW + c * dataColW + dataColW / 2
    const text = colLabels[c]
    const textW = pdf.getTextWidth(text)
    pdf.text(text, cellCenter - textW / 2, gridY + headerRowH / 2 + 3)
  }
  pdf.setFont('times', 'bold').setFontSize(10).setTextColor(0, 0, 0)
  for (let r = 0; r < rowLabels.length; r++) {
    const rowCenter = gridY + headerRowH + r * dataRowH + dataRowH / 2 + 3
    const text = rowLabels[r]
    const textW = pdf.getTextWidth(text)
    pdf.text(text, x + labelColW / 2 - textW / 2, rowCenter)
  }

  // Rule between title strip and grid, then outer border around the WHOLE card.
  pdf.line(x, gridY, x + width, gridY)
  pdf.rect(x, y, width, height, 'S')
}

function drawHeader(ctx, { logoDataUrl, logoW, logoH }) {
  const { pdf } = ctx
  const headerY = ctx.y
  pdf.addImage(logoDataUrl, 'PNG', CARD_LEFT, headerY, logoW, logoH)
  pdf.setFont('times', 'bold').setFontSize(H_HEADER_TITLE).setTextColor(0, 0, 0)
  const title = 'ASSIGNMENT SHEET'
  const titleW = pdf.getTextWidth(title)
  pdf.text(title, CARD_RIGHT - titleW, headerY + 18, { charSpace: 1 })
  const ruleY = headerY + Math.max(logoH, 32) + 4
  pdf.setDrawColor(0, 0, 0).setLineWidth(1.25)
  pdf.line(CARD_LEFT, ruleY, CARD_RIGHT, ruleY)
  ctx.y = ruleY + 10
}

function buildPdf(data) {
  const {
    claim, assignedToName,
    notesType, opposingAppraiserName, opposingAppraiserCompany, opposingAppraiserValue,
    insuranceOfferValue, agreementAmount, umpireAmount, ourAcv,
    claimTypes, maEstValue, maStorageValue,
  } = data

  const yearStr = claim.year > 0 ? String(claim.year) : ''
  const mileageStr = claim.mileage > 0 ? claim.mileage.toLocaleString() : ''
  const deductibleStr = claim.deductible && claim.deductible > 0 ? formatCurrency(claim.deductible) : ''
  const negotiating = claim.negotiatingAppraiser || assignedToName || ''
  const opposingParts = []
  if (opposingAppraiserName) opposingParts.push(opposingAppraiserName)
  if (opposingAppraiserCompany) opposingParts.push(opposingAppraiserCompany)
  const opposing = opposingParts.join(' · ')
  const ownerDifferent = Boolean(claim.ownerName && claim.ownerName.trim() && claim.ownerName.trim() !== claim.insuredName.trim())
  // Claimant and Vehicle Location cards ALWAYS render — layout stays constant
  // across every claim, blank fields just render as empty values.
  const combinedVehicle = [yearStr, claim.make || '', claim.model || '', claim.trim || ''].filter(Boolean).join(' ')

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  pdf.setLineHeightFactor(1.15)
  const ctx = { pdf, y: MARGIN_TOP }

  const logoBuf = readFileSync('tmp/logo-black.png')
  const logoDataUrl = 'data:image/png;base64,' + logoBuf.toString('base64')
  const logoH = 32
  const logoAspect = 1976 / 388
  const logoW = logoH * logoAspect

  drawHeader(ctx, { logoDataUrl, logoW, logoH })

  // Top info strip (big text, no box) — the four at-a-glance fields.
  drawInfoStrip(ctx, [
    { label: 'MA #', value: claim.maNumber || '' },
    { label: 'CL #', value: claim.claimNumber || '' },
    { label: 'Client', value: claim.clientName || '' },
    { label: 'Vehicle', value: combinedVehicle },
  ])

  // ── Build row data ──────────────────────────────────────────────────
  // Row 1: CLAIM + INSURANCE. MA# / CL# appear in both the top info strip
  // (for at-a-glance scan) AND here (for the full-context card view).
  const claimRows = [
    { label: 'MA #', value: claim.maNumber || '' },
    { label: 'CL #', value: claim.claimNumber || '' },
    { label: 'Date of Loss', value: fmtDate(claim.dateOfLoss) },
    { label: 'Assignment', value: assignmentTypeLabel(notesType) },
    { label: 'Claim For', value: claim.clientType || '' },
  ]
  const insuranceRows = [
    { label: 'Company', value: claim.insuranceCompany || '' },
    { label: 'Adjuster', value: claim.adjuster || '' },
    { label: 'Phone', value: claim.adjusterPhone || '' },
    { label: 'Email', value: claim.adjusterEmail || '' },
  ]
  drawPairRow(ctx,
    { title: 'Claim', rows: claimRows },
    { title: 'Insurance', rows: insuranceRows },
  )

  // Row 2: OWNER / INSURED + CLAIMANT. Client is also in the top info strip
  // for scan-ability, repeated here for full context.
  const ownerInsuredRows = [
    { label: 'Owner', value: claim.ownerName || claim.insuredName || '' },
    ...(ownerDifferent ? [{ label: 'Insured', value: claim.insuredName || '' }] : []),
    { label: 'Client', value: claim.clientName || '' },
    { label: 'Contact', value: claim.clientContactName || '' },
    { label: 'Phone', value: claim.ownerPhone || '' },
    { label: 'Email', value: claim.ownerEmail || '' },
    { label: 'Address', value: claim.ownerAddress || '' },
    { label: 'Deductible', value: deductibleStr },
  ]
  const claimantRows = [
    { label: 'Name', value: claim.claimantName || '' },
    { label: 'Phone', value: claim.claimantPhone || '' },
    { label: 'Email', value: claim.claimantEmail || '' },
    { label: 'Address', value: claim.claimantAddress || '' },
  ]
  drawPairRow(ctx,
    { title: 'Owner / Insured', rows: ownerInsuredRows },
    { title: 'Claimant', rows: claimantRows },
  )

  // Row 3: VEHICLE + VEHICLE LOCATION. Combined year/make/model also in the
  // top info strip for scan-ability, repeated here for full context.
  const vehicleRows = [
    { label: 'Vehicle', value: combinedVehicle },
    { label: 'VIN', value: claim.vin || '' },
    { label: 'Mileage', value: mileageStr },
  ]
  const locationRows = [
    { label: 'Location', value: claim.vehicleLocationName || '' },
    { label: 'Contact', value: claim.vehicleLocationContact || '' },
    { label: 'Address', value: claim.vehicleLocationAddress || '' },
  ]
  drawPairRow(ctx,
    { title: 'Vehicle', rows: vehicleRows },
    { title: 'Vehicle Location', rows: locationRows },
  )

  // Row 4: APPRAISERS (full width — 2 rows)
  const appraiserRows = [
    { label: 'MA Appraiser', value: negotiating },
    { label: 'Opposing Appraiser', value: opposing },
  ]
  drawFullCard(ctx, 'Appraisers', appraiserRows)

  // Row 5: VALUATIONS — anchored to the BOTTOM of the page so whatever gap
  // exists after the Appraisers card lands between it and the money card,
  // not below the money card. Extra row spacing so appraisers can hand-write
  // numbers next to each printed value on the paper copy.
  const types = claimTypes ?? []
  const hasEstimate = types.includes('estimate')
  const primaryHits = PRIMARY_VALUATION_TYPES.filter(t => types.includes(t))
  const multiPrimary = primaryHits.length >= 2
  const showLaborRates = hasEstimate
  const isUmpire = (data.proceededToUmpire === true) || types.includes('umpire')

  const maValues = {
    acv: ourAcv, dv: 0, storage: maStorageValue,
    desk: 0, lou: 0, full: 0, salvage: 0,
  }

  let moneyRows = []
  if (!multiPrimary) {
    if (primaryHits.length === 1) {
      const t = primaryHits[0]
      moneyRows.push({ label: `MA ${CLAIM_TYPE_LABEL[t] ?? t}`, value: maValues[t] ?? 0 })
    }
    if (hasEstimate && primaryHits.length === 0) {
      moneyRows.push({ label: `MA ${CLAIM_TYPE_LABEL['estimate']}`, value: maEstValue })
    }
    moneyRows.push({ label: 'OA Value', value: opposingAppraiserValue })
    moneyRows.push({ label: 'Ins. Co. Offer', value: insuranceOfferValue })
    moneyRows.push({ label: 'Agreed Amount', value: agreementAmount })
    if (isUmpire) moneyRows.push({ label: 'Umpire Amount', value: umpireAmount })
  }

  const VALS_ROW_H_IDEAL = 28
  const VALS_ROW_H_MIN = 18
  const valsOverhead = TITLE_STRIP_H + PAD_Y_TOP + PAD_Y_BOT + 11
  const availForVals = PAGE_H - MARGIN_BOTTOM - ctx.y
  let valsNaturalH
  let VALS_ROW_H = VALS_ROW_H_IDEAL
  if (moneyRows.length === 0) {
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
  ctx.y += valsNaturalH + CARD_GAP_Y

  return pdf.output('arraybuffer')
}

// ------- RUN ------------------------------------------------------------

const buf = buildPdf(mock)
// Rotate output name so a locked viewer on the previous file doesn't block
// the next iteration. Timestamp suffix is cheap.
const stamp = Date.now()
const pdfPath = `tmp/assignment-sheet-preview-${stamp}.pdf`
const pngPath = `tmp/assignment-sheet-preview-${stamp}.png`
writeFileSync(pdfPath, Buffer.from(buf))
console.log('wrote ' + pdfPath + ' (' + buf.byteLength + ' bytes)')

execSync(`py -c "import pymupdf; doc = pymupdf.open('${pdfPath}'); page = doc[0]; pix = page.get_pixmap(dpi=200); pix.save('${pngPath}'); print('wrote ${pngPath}', pix.width, pix.height)"`, { stdio: 'inherit' })

// Also update the canonical filenames when we can, so the latest preview is
// always at the predictable path too.
try {
  writeFileSync('tmp/assignment-sheet-preview.pdf', Buffer.from(buf))
  execSync(`py -c "import pymupdf; doc = pymupdf.open('tmp/assignment-sheet-preview.pdf'); page = doc[0]; pix = page.get_pixmap(dpi=200); pix.save('tmp/assignment-sheet-preview.png'); print('also updated tmp/assignment-sheet-preview.png')"`, { stdio: 'inherit' })
} catch { /* viewer still has it open — fine, timestamped file is the fresh one */ }
