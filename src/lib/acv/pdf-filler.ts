import { PDFDocument, PDFName, PDFBool, PDFArray, PDFString, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from './types'

function fmt(val: number): string {
  if (!val) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  // Convert YYYY-MM-DD to MM/DD/YYYY
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}

function setField(
  form: ReturnType<PDFDocument['getForm']>,
  name: string,
  value: string,
  font?: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
    if (font) {
      field.defaultUpdateAppearances(font)
    } else {
      // Remove pdf-lib's auto-generated appearance so the PDF reader
      // uses the template's original font/size via NeedAppearances
      field.acroField.getWidgets().forEach(w => {
        w.dict.delete(PDFName.of('AP'))
      })
    }
  } catch { /* field may not exist */ }
}

function setDropdown(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    const field = form.getDropdown(name)
    if (field.getOptions().includes(value)) field.select(value)
    field.acroField.getWidgets().forEach(w => {
      w.dict.delete(PDFName.of('AP'))
    })
  } catch { /* ignore */ }
}

export async function fillACVPdf(
  claim: ClaimInfo,
  comps: SelectedComp[],
  adjustments: ACVAdjustments,
  result: ACVResult
): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'acv-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)

  // Tell PDF readers to regenerate field appearances using the template's
  // own fonts/sizes instead of pdf-lib's defaults
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const vehicleStr = [claim.year, claim.make, claim.model, claim.trim]
    .filter(Boolean)
    .join(' ')

  // Header
  setField(form, 'Modern file #', claim.maNumber)
  setField(form, 'Ins Claim #', claim.claimNumber)
  setField(form, 'Date of Loss', fmtDate(claim.dateOfLoss))
  setField(form, 'Date2_af_date', today)

  // Owner
  setDropdown(form, 'List Box 1', claim.clientType)
  setField(form, 'Owner Name', claim.insuredName)
  setField(form, 'Owner Phone', claim.ownerPhone)
  setField(form, 'Owner Email', claim.ownerEmail)
  setField(form, 'Owner Address', claim.ownerAddress)
  setField(form, 'Client', claim.clientName || claim.insuredName)

  // Insurance
  setField(form, 'Ins. Co', claim.insuranceCompany)
  setField(form, 'Adjuster Name', claim.adjuster)
  setField(form, 'Adjuster Phone', claim.adjusterPhone)
  setField(form, 'Adjuster email', claim.adjusterEmail)

  // Vehicle
  setField(form, 'Year', String(claim.year))
  setField(form, 'Make', claim.make)
  setField(form, 'Model', claim.model)
  setField(form, 'VIN', claim.vin)
  setField(form, 'mileage', claim.mileage.toLocaleString())
  setDropdown(form, 'mileage actual', 'Actual')
  setField(form, 'complete vehicle information', vehicleStr)

  // Condition (all Fair)
  setDropdown(form, 'Body', 'Fair')
  setDropdown(form, 'Paint', 'Fair')
  setDropdown(form, 'Paint_2', 'Fair')
  setDropdown(form, 'Paint_3', 'Fair')
  setDropdown(form, 'Paint_4', 'Fair')

  // Comps
  const compFields = [
    {
      dealer: 'Comp1 details',
      asking: 'Comp1 price',
      mileage: 'mileagecomp1',
      mileDiffRaw: 'comp1 mileage difference',
      mileDiffDollar: 'comp1 mileage adjustment',
      yearDiffRaw: 'comp 1 year difference',
      yearDiffDollar: 'comp1 year adjustment',
      value: 'comp1 adjusted value',
    },
    {
      dealer: 'comp2 details',
      asking: 'comp2 price',
      mileage: 'mileagecomp2',
      mileDiffRaw: 'comp2 mileage difference',
      mileDiffDollar: 'comp2 mileage adjustment',
      yearDiffRaw: 'comp2 year difference',
      yearDiffDollar: 'comp2 year adjsutments',
      value: 'comp2 adjusted value',
    },
    {
      dealer: 'comp3 details',
      asking: 'comp3 price',
      mileage: 'mileagecomp3',
      mileDiffRaw: 'comp3 mileage difference',
      mileDiffDollar: 'comp3 mileage adjustment',
      yearDiffRaw: 'comp3 year difference',
      yearDiffDollar: 'comp3 year adjustment',
      value: 'comp3 adjusted value',
    },
  ]

  compFields.forEach((f, i) => {
    const comp = comps[i]
    if (!comp) {
      // No comp selected for this slot
      setField(form, f.dealer, 'N/A')
      setField(form, f.asking, '$0.00')
      setField(form, f.mileage, '0')
      setField(form, f.mileDiffRaw, '0')
      setField(form, f.mileDiffDollar, '$0.00')
      setField(form, f.yearDiffRaw, '0')
      setField(form, f.yearDiffDollar, '$0.00')
      setField(form, f.value, '$0.00')
      return
    }
    // Dealer info: name + phone, or website domain if no dealer name
    let dealerLabel = comp.dealerName
    if (!dealerLabel && comp.vdpUrl) {
      try {
        dealerLabel = new URL(comp.vdpUrl).hostname.replace(/^www\./, '')
      } catch { dealerLabel = '' }
    }
    const dealerInfo = [dealerLabel, comp.dealerPhone]
      .filter(Boolean)
      .join('\n')
    setField(form, f.dealer, dealerInfo)
    setField(form, f.asking, fmt(comp.price))
    setField(form, f.mileage, (comp.miles ?? 0).toLocaleString())
    setField(
      form,
      f.mileDiffRaw,
      comp.mileageDiffRaw < 0
        ? comp.mileageDiffRaw.toLocaleString()
        : comp.mileageDiffRaw.toLocaleString()
    )
    setField(form, f.mileDiffDollar, fmt(comp.mileageAdjDollar))
    setField(
      form,
      f.yearDiffRaw,
      String(comp.yearDiffRaw)
    )
    setField(form, f.yearDiffDollar, fmt(comp.yearAdjDollar))
    setField(form, f.value, fmt(comp.compValue))
  })

  // Adjustments
  setField(form, 'vehicle history', adjustments.vehicleHistoryNote)
  setField(
    form,
    'v his value',
    adjustments.vehicleHistory !== 0 ? fmt(adjustments.vehicleHistory) : ''
  )
  setField(form, 'prior damages', adjustments.priorDamagesNote)
  setField(
    form,
    'p dmg value',
    adjustments.priorDamages !== 0 ? fmt(adjustments.priorDamages) : ''
  )
  setField(form, 'additions', adjustments.additionsNote)
  setField(form, 'addit value', adjustments.additions !== 0 ? fmt(adjustments.additions) : '')
  setField(form, 'deductions', adjustments.deductionsNote)
  setField(form, 'deduc value', fmt(adjustments.deductions))

  // Calculated
  setField(form, 'comp average value', fmt(result.averageValue))
  setField(form, 'total adjustments', fmt(result.totalAdjustments))
  if (adjustments.taxRate > 0) {
    setField(form, 'Text Box 5', String(adjustments.taxRate))
    setField(form, 'Numeric Field 1', fmt(result.taxAmount))
  }
  setField(form, 'Final ACV', fmt(result.acv))

  // Notes
  setField(form, 'notes', adjustments.notes)

  // Remove JavaScript calculation actions from all fields so the PDF reader
  // doesn't overwrite our pre-filled values when it opens the document
  form.getFields().forEach(f => {
    f.acroField.dict.delete(PDFName.of('AA'))
  })
  // Remove the calculation order array from the AcroForm
  form.acroForm.dict.delete(PDFName.of('CO'))

  // Update all text fields to use Times Roman font and set text color per page
  const timesRomanFontName = timesRoman.name // e.g. "/TimesRoman" ref name in the PDF
  const coverPageRef = doc.getPages()[0].ref
  form.getFields().forEach(f => {
    // Update appearances with Times Roman for text fields
    try {
      const tf = form.getTextField(f.getName())
      tf.defaultUpdateAppearances(timesRoman)
    } catch { /* not a text field */ }

    f.acroField.getWidgets().forEach(w => {
      const onCover = w.P() === coverPageRef
      const da = w.dict.get(PDFName.of('DA'))
      if (da) {
        let daStr = (da as PDFString).decodeText?.() ?? da.toString()
        // Replace font reference with Times Roman
        daStr = daStr.replace(/\/\w+\s+([\d.]+)\s+Tf/, `/${timesRomanFontName} $1 Tf`)
        // Replace color
        const newColor = onCover ? '1 1 1 rg' : '0 0 0 rg'
        const newDa = daStr.replace(/[\d.]+\s+[\d.]+\s+[\d.]+\s+rg/, newColor)
        w.dict.set(PDFName.of('DA'), PDFString.of(newDa !== daStr ? newDa : `${newColor} ${daStr}`))
      } else {
        const newColor = onCover ? '1 1 1 rg' : '0 0 0 rg'
        w.dict.set(PDFName.of('DA'), PDFString.of(`${newColor} /${timesRomanFontName} 10 Tf`))
      }
    })
    const fieldDa = f.acroField.dict.get(PDFName.of('DA'))
    if (fieldDa) {
      let daStr = (fieldDa as PDFString).decodeText?.() ?? fieldDa.toString()
      daStr = daStr.replace(/\/\w+\s+([\d.]+)\s+Tf/, `/${timesRomanFontName} $1 Tf`)
      const newDa = daStr.replace(/[\d.]+\s+[\d.]+\s+[\d.]+\s+rg/, '0 0 0 rg')
      f.acroField.dict.set(PDFName.of('DA'), PDFString.of(newDa))
    }
  })

  // Flatten AcroForm fields so the printed PDF is clean static text — no
  // editable fields, no accidental edits from the reader. All appearances
  // were already updated to Times Roman above, so flatten renders them as-is.
  form.flatten()

  // ── Add comp listing pages ──────────────────────────────────────────────────
  await addCompPages(doc, claim, comps)

  return doc.save()
}

async function addCompPages(
  doc: PDFDocument,
  claim: ClaimInfo,
  comps: SelectedComp[],
) {
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const PAGE_W = 612
  const PAGE_H = 792
  const MARGIN = 50

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i]
    const page = doc.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - MARGIN

    // Header
    page.drawText(`Comparable #${i + 1}`, { x: MARGIN, y, font: fontBold, size: 16, color: rgb(0, 0, 0) })
    y -= 12
    page.drawText(
      `${claim.year} ${claim.make} ${claim.model}${claim.trim ? ` ${claim.trim}` : ''} — ACV Report`,
      { x: MARGIN, y, font, size: 9, color: rgb(0.4, 0.4, 0.4) },
    )
    y -= 24

    // Divider
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) })
    y -= 20

    // Try to embed comp photo
    if (comp.photoUrl) {
      try {
        const imgRes = await fetch(comp.photoUrl)
        if (imgRes.ok) {
          const imgBuf = await imgRes.arrayBuffer()
          const imgBytes = new Uint8Array(imgBuf)
          let image
          const url = comp.photoUrl.toLowerCase()
          if (url.includes('.png')) {
            image = await doc.embedPng(imgBytes)
          } else {
            image = await doc.embedJpg(imgBytes)
          }
          const maxW = PAGE_W - MARGIN * 2
          const maxH = 250
          const scale = Math.min(maxW / image.width, maxH / image.height, 1)
          const imgW = image.width * scale
          const imgH = image.height * scale
          page.drawImage(image, {
            x: MARGIN + (maxW - imgW) / 2,
            y: y - imgH,
            width: imgW,
            height: imgH,
          })
          y -= imgH + 20
        }
      } catch {
        // Skip photo if fetch fails
      }
    }

    // Comp details table
    const rows: [string, string][] = [
      ['Heading', comp.heading || `${comp.year} ${comp.make} ${comp.model} ${comp.trim}`],
      ['VIN', comp.vin as string],
      ['Asking Price', fmt(comp.price)],
      ['Mileage', (comp.miles ?? 0).toLocaleString()],
      ['Year / Make / Model', `${comp.year} ${comp.make} ${comp.model}`],
      ['Trim', (comp.trim as string) || '—'],
      ['Dealer', comp.dealerName as string || '—'],
      ['Dealer Phone', comp.dealerPhone as string || '—'],
      ['Listing URL', comp.vdpUrl || '—'],
    ]

    if (comp.mileageDiffRaw !== undefined) {
      rows.push(['Mileage Difference', `${comp.mileageDiffRaw.toLocaleString()} miles`])
      rows.push(['Mileage Adjustment', fmt(comp.mileageAdjDollar)])
    }
    if (comp.yearDiffRaw !== undefined) {
      rows.push(['Year Difference', `${comp.yearDiffRaw} year${Math.abs(comp.yearDiffRaw) !== 1 ? 's' : ''}`])
      rows.push(['Year Adjustment', fmt(comp.yearAdjDollar)])
    }
    rows.push(['Adjusted Comp Value', fmt(comp.compValue)])

    const rowH = 22
    const labelW = 160
    for (const [label, value] of rows) {
      if (y < MARGIN + 20) break // don't overflow page
      // Alternating row bg
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH + 4,
        width: PAGE_W - MARGIN * 2,
        height: rowH,
        color: rows.indexOf([label, value]) % 2 === 0 ? rgb(0.96, 0.96, 0.96) : rgb(1, 1, 1),
      })
      page.drawText(label, { x: MARGIN + 8, y: y - 10, font: fontBold, size: 9, color: rgb(0.3, 0.3, 0.3) })
      page.drawText(value || '', { x: MARGIN + labelW, y: y - 10, font, size: 9, color: rgb(0, 0, 0) })
      y -= rowH
    }
  }
}
