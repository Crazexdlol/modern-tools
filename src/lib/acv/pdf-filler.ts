import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import type { ClaimInfo, SelectedComp, ACVAdjustments, ACVResult } from './types'

function fmt(val: number): string {
  if (!val) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}

function setField(
  form: ReturnType<PDFDocument['getForm']>,
  name: string,
  value: string,
) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
  } catch { /* field may not exist */ }
}

function setDropdown(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    const field = form.getDropdown(name)
    if (field.getOptions().includes(value)) field.select(value)
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

  const today = new Date().toLocaleDateString('en-US')
  const vehicleStr = `${claim.year} ${claim.make} ${claim.model}`

  // Header
  setField(form, 'Modern file #', claim.maNumber)
  setField(form, 'Ins Claim #', claim.claimNumber)
  setField(form, 'Date of Loss', claim.dateOfLoss)
  setField(form, 'Date2_af_date', today)

  // Owner
  setDropdown(form, 'List Box 1', claim.clientType)
  setField(form, 'Owner Name', claim.insuredName)
  setField(form, 'Owner Phone', claim.ownerPhone)
  setField(form, 'Owner Email', claim.ownerEmail)
  setField(form, 'Owner Address', claim.ownerAddress)
  setField(form, 'Client', claim.insuredName)

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

  comps.forEach((comp, i) => {
    const f = compFields[i]
    if (!f) return
    const dealerInfo = [comp.dealerName, `${comp.dealerCity}, ${comp.dealerState}`, comp.dealerPhone]
      .filter(Boolean)
      .join('\n')
    setField(form, f.dealer, dealerInfo)
    setField(form, f.asking, fmt(comp.price))
    setField(form, f.mileage, (comp.miles ?? 0).toLocaleString())
    setField(
      form,
      f.mileDiffRaw,
      comp.mileageDiffRaw >= 0
        ? `+${comp.mileageDiffRaw.toLocaleString()}`
        : comp.mileageDiffRaw.toLocaleString()
    )
    setField(form, f.mileDiffDollar, fmt(comp.mileageAdjDollar))
    setField(
      form,
      f.yearDiffRaw,
      comp.yearDiffRaw >= 0 ? `+${comp.yearDiffRaw}` : String(comp.yearDiffRaw)
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

  return doc.save()
}
