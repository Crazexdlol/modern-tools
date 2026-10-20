// Generate test LOU PDFs by mirroring the filler. Writes _out-lou-{days,hours}.pdf
// into scripts/ for manual visual inspection in Acrobat/Preview.
import { PDFDocument, PDFName, PDFBool, PDFString, StandardFonts, rgb } from 'pdf-lib'
import { readFileSync, writeFileSync } from 'node:fs'

function money(n) {
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)}`
}
function formatDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}
function wrapText(text, font, size, maxWidth) {
  const words = text.trim().split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}
const DEFAULT_NOTE =
  'Based on the information provided, I have attached the recommended Loss of Use calculation. ' +
  'Information was calculated using the information supplied and established with available comparable rental vehicles.'

function setField(form, name, value) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
    field.acroField.getWidgets().forEach(w => w.dict.delete(PDFName.of('AP')))
  } catch {}
}
function setDropdown(form, name, value) {
  try {
    const field = form.getDropdown(name)
    if (value && field.getOptions().includes(value)) field.select(value)
    field.acroField.getWidgets().forEach(w => w.dict.delete(PDFName.of('AP')))
  } catch {}
}

async function fill(variant, data) {
  const templateBytes = readFileSync(`public/companies/modern-appraisers/templates/lou-templates/lou-${variant}.pdf`)
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)
  const timesRomanBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

  form.getFields().forEach(f => {
    f.acroField.getWidgets().forEach(w => {
      const r = w.getRectangle()
      if (r.width <= 0 || r.height <= 0) {
        w.setRectangle({
          x: Math.min(r.x, r.x + r.width),
          y: Math.min(r.y, r.y + r.height),
          width: Math.max(Math.abs(r.width), 1),
          height: Math.max(Math.abs(r.height), 1),
        })
      }
    })
  })

  const vehicleStr = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ')
  const mileageStr = data.mileage ? data.mileage.toLocaleString('en-US') : ''

  setField(form, 'Modern file #', data.maNumber)
  setField(form, 'Ins Claim #', data.claimNumber)
  setField(form, 'Date2_af_date', formatDate(data.dateOfLoss))
  setField(form, 'Client', data.ownerName)
  setField(form, 'Vehicle', vehicleStr)
  setField(form, 'mileage', mileageStr)
  setField(form, 'date1', formatDate(data.dateOfLoss))
  setField(form, 'date2', formatDate(data.dateCompleted))

  setDropdown(form, 'List Box 1', data.clientType)
  setField(form, '1', data.ownerName)
  setField(form, '2', data.ownerPhone)
  setField(form, '3', data.ownerEmail)
  setField(form, '4', data.ownerAddress)
  setField(form, '5', data.insuranceCompany)
  setField(form, '6', data.adjusterName)
  setField(form, '7', data.adjusterPhone)
  setField(form, '8', data.adjusterEmail)
  setField(form, '9', data.vehicleYear)
  setField(form, '10', data.vehicleMake)
  setField(form, '11', data.vehicleModel)
  setField(form, '12', data.vin)
  setDropdown(form, 'Dropdown2', data.licenseState)

  setField(form, '14', data.rental1Description)
  setField(form, 'Text2', money(data.rental1DailyRate))
  setField(form, '22', data.rental2Description)
  setField(form, 'Text5', money(data.rental2DailyRate))
  setField(form, '30', data.rental3Description)
  setField(form, 'Text6', money(data.rental3DailyRate))

  setField(form, 'result', String(data.totalDays || ''))
  setField(form, 'Text7', money(data.comp1Value))
  setField(form, 'Text9', money(data.comp2Value))
  setField(form, 'Text10', money(data.comp3Value))

  setField(form, 'Text1', data.adjustment1Label || '')
  setField(form, 'Text15', data.adjustment1Value ? money(data.adjustment1Value) : '')
  setField(form, 'Text3', data.adjustment2Label || '')
  setField(form, 'Text14', data.adjustment2Value ? money(data.adjustment2Value) : '')

  setField(form, 'Text11', money(data.averageValue))
  setField(form, 'Text13', money(data.adjustments))
  setField(form, 'Text16', money(data.finalLossOfUse))

  if (variant === 'hours') {
    setField(form, 'Text8', data.laborHours > 0 ? data.laborHours.toFixed(1) : '')
    setField(form, 'Text12', String(data.businessRepairDays || ''))
    setField(form, 'Text19', String(data.weekends || ''))
    setField(form, 'Text20', String(data.additionalDays || ''))
    setField(form, 'Text24', String(data.totalDays || ''))
  }

  form.getFields().forEach(f => f.acroField.dict.delete(PDFName.of('AA')))
  form.acroForm.dict.delete(PDFName.of('CO'))

  try { form.getTextField('1').setFontSize(0) } catch {}

  const timesFontName = timesRoman.name
  const coverPageRef = doc.getPages()[0].ref
  const redDaColor = '0.75 0 0 rg'
  form.getFields().forEach(f => {
    const isLouTotal = f.getName() === 'Text16'
    f.acroField.getWidgets().forEach(w => {
      const onCover = w.P() === coverPageRef
      const newColor = isLouTotal ? redDaColor : onCover ? '1 1 1 rg' : '0 0 0 rg'
      const da = w.dict.get(PDFName.of('DA'))
      if (da) {
        let daStr = da.decodeText?.() ?? da.toString()
        daStr = daStr.replace(/\/\w+\s+([\d.]+)\s+Tf/, `/${timesFontName} $1 Tf`)
        const newDa = daStr
          .replace(/[\d.]+\s+[\d.]+\s+[\d.]+\s+rg/, newColor)
          .replace(/[\d.]+\s+g\b/, onCover && !isLouTotal ? '1 g' : '0 g')
        w.dict.set(PDFName.of('DA'), PDFString.of(newDa !== daStr ? newDa : `${newColor} ${daStr}`))
      } else {
        w.dict.set(PDFName.of('DA'), PDFString.of(`${newColor} /${timesFontName} 10 Tf`))
      }
    })
  })

  form.getFields().forEach(f => {
    try {
      const tf = form.getTextField(f.getName())
      tf.defaultUpdateAppearances(timesRoman)
    } catch {}
  })

  form.flatten()

  const mainPage = doc.getPages()[1]
  const { height: pageH } = mainPage.getSize()

  if (variant === 'days') {
    mainPage.drawRectangle({ x: 350, y: pageH - 70, width: 245, height: 40, color: rgb(1, 1, 1) })
    mainPage.drawText('Loss of Use Report (LOV)', {
      x: 360, y: pageH - 55, font: timesRomanBold, size: 16, color: rgb(0, 0, 0),
    })
  }

  const notesText = (data.notes && data.notes.trim()) || DEFAULT_NOTE
  const notesBoxX = 18, notesBoxW = 380, notesBoxH = 70, notesBoxY = 25
  mainPage.drawText('Additional Notes', { x: notesBoxX, y: notesBoxY + notesBoxH + 8, font: timesRomanBold, size: 10, color: rgb(0, 0, 0) })
  const headerW = timesRomanBold.widthOfTextAtSize('Additional Notes', 10)
  mainPage.drawLine({
    start: { x: notesBoxX, y: notesBoxY + notesBoxH + 6 },
    end: { x: notesBoxX + headerW, y: notesBoxY + notesBoxH + 6 },
    thickness: 0.5, color: rgb(0, 0, 0),
  })
  mainPage.drawRectangle({ x: notesBoxX, y: notesBoxY, width: notesBoxW, height: notesBoxH, borderColor: rgb(0, 0, 0), borderWidth: 0.75, color: rgb(1, 1, 1) })
  const wrapped = wrapText(notesText, timesRoman, 9, notesBoxW - 10)
  let noteY = notesBoxY + notesBoxH - 12
  for (const line of wrapped.slice(0, 5)) {
    mainPage.drawText(line, { x: notesBoxX + 5, y: noteY, font: timesRoman, size: 9, color: rgb(0, 0, 0) })
    noteY -= 11
  }

  return doc.save()
}

const data = {
  maNumber: '3972128',
  claimNumber: 'PA0021665123',
  clientType: 'Insured',
  ownerName: 'RODERICK & RAQUEL BEAUPLAN',
  ownerPhone: '555-867-5309',
  ownerEmail: 'owner@example.com',
  ownerAddress: '91, Marlboro, NY 12542',
  insuranceCompany: 'The Hartford Insurance Co',
  adjusterName: 'Jane Adjuster',
  adjusterPhone: '800-555-1212',
  adjusterEmail: 'jane@hartford.com',
  vehicleYear: '2019',
  vehicleMake: 'Audi',
  vehicleModel: 'Q7',
  vin: 'WA1LAAF75KD035675',
  mileage: 105024,
  licenseState: 'NY',
  dateOfLoss: '2026-07-26',
  dateUnitReceived: '2026-08-01',
  dateCompleted: '2026-10-03',
  rental1Description: 'Dealer asdsada',
  rental1DailyRate: 1234,
  rental2Description: 'Dealer asdsada',
  rental2DailyRate: 3456,
  rental3Description: 'Dealer asdsada',
  rental3DailyRate: 0,
  totalDays: 4,
  comp1Value: 1234 * 4,
  comp2Value: 3456 * 4,
  comp3Value: 0,
  averageValue: ((1234 + 3456 + 0) / 3) * 4,
  adjustment1Label: 'Extended rental period',
  adjustment1Value: 500,
  adjustment2Label: 'Dealer discount',
  adjustment2Value: -100,
  adjustments: 400,
  finalLossOfUse: ((1234 + 3456 + 0) / 3) * 4 + 400,
  laborHours: 32.5,
  businessRepairDays: 5,
  weekends: 2,
  additionalDays: 1,
  notes: '',
}

for (const variant of ['days', 'hours']) {
  const bytes = await fill(variant, data)
  const out = `scripts/_out-lou-${variant}.pdf`
  writeFileSync(out, bytes)
  console.log(`Wrote ${out} (${bytes.length} bytes)`)
  const roundtrip = await PDFDocument.load(bytes, { ignoreEncryption: true })
  console.log(`  Re-loaded: ${roundtrip.getPageCount()} pages, ${roundtrip.getForm().getFields().length} fields (0 = flatten OK)`)
}
