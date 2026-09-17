import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readTemplate } from '@/lib/pdf/template-path'

// Four report variants = (Nationwide | with-Prior-Loss) x (Attorney | Sedgwick).
// Attorney (consumer) uses KBB "Fair Purchase Price" / "Trade-In Fair Value";
// Sedgwick (insurance) uses "Private Party, Excellent" / "Private Party, Fair" —
// the printed labels differ per template, the FIELD names are identical.
export type DVVariant =
  | 'nationwide-attorney'
  | 'nationwide-sedgwick'
  | 'wloss-attorney'
  | 'wloss-sedgwick'

const TEMPLATE_FILES: Record<DVVariant, string> = {
  'nationwide-attorney': 'dv-nationwide-attorney.pdf',
  'nationwide-sedgwick': 'dv-nationwide-sedgwick.pdf',
  'wloss-attorney': 'dv-wloss-attorney.pdf',
  'wloss-sedgwick': 'dv-wloss-sedgwick.pdf',
}

export interface DVPdfData {
  date: string
  claimNumber: string
  fileNumber: string
  clientName: string
  phone: string
  vehicle: string
  vin: string
  mileage: number
  ownerEmail: string
  ownerAddress: string
  dateOfLoss: string
  licensePlate: string
  licenseState: string
  insuranceCompany: string
  policyNumber: string
  adjusterName: string
  adjusterPhone: string
  adjusterEmail: string
  // Values (all dollars unless noted)
  kbbHigh: number
  priorLossAdjust: number
  conditionAdjust: number
  aftermarketAdjust: number
  acv: number
  kbbLow: number
  baselineLov: number
  damageSeverity: number // 0.15 .. 1.00
  mileageModifier: number // 0.30 .. 1.00
  severityModifiedLov: number
  // wLoss only
  priorLossPercent: number // 15..100
  adjustedLov: number
  finalDv: number
}

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}

export async function fillDVPdf(companySlug: string, variant: DVVariant, data: DVPdfData): Promise<Uint8Array> {
  const templateBytes = readTemplate(companySlug, `dv-templates/${TEMPLATE_FILES[variant]}`)
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const helvetica = await doc.embedFont(StandardFonts.Helvetica)

  const isWloss = variant.startsWith('wloss')

  const fields: [string, string][] = [
    ['date', formatDate(data.date)],
    ['claim #', data.claimNumber],
    ['file.0.0', data.fileNumber],
    ['Client Name', data.clientName],
    ['phone numb', data.phone],
    ['vehicle', data.vehicle],
    ['VIN', data.vin],
    ['mileage', data.mileage ? data.mileage.toLocaleString('en-US') : ''],
    ['email', data.ownerEmail],
    ['address', data.ownerAddress],
    ['DOL', formatDate(data.dateOfLoss)],
    ['license plate', data.licensePlate],
    ['insurance company', data.insuranceCompany],
    ['policy numb', data.policyNumber],
    ['adjuster', data.adjusterName],
    ['adjuster phone', data.adjusterPhone],
    ['Text6', data.adjusterEmail], // Responsible Party E-mail row
    // Evaluation summary (page 2)
    ['Fair Purchase Price', money(data.kbbHigh)],
    ['prior loss adjust', money(data.priorLossAdjust)],
    ['Condition Adjust', money(data.conditionAdjust)],
    ['After Market Parts adju', money(data.aftermarketAdjust)],
    ['Updated Fair Purchase price', money(data.acv)],
    // Evaluation page (page 3)
    ['UpdatedFairPurchaseprice', money(data.kbbHigh)],
    ['tradeinvalue', money(data.kbbLow)],
    ['Base LOV', money(data.baselineLov)], // variance + baseline + SMLOV-row widgets
    ['dmgseverity', data.damageSeverity.toFixed(2)],
    ['mileadj', data.mileageModifier.toFixed(2)],
  ]

  if (!isWloss) {
    // Nationwide: DVvalue = SMLOV-row result AND the big final line.
    fields.push(['DVvalue', money(data.severityModifiedLov)])
  } else {
    // wLoss: DVvalue = SMLOV-row result; the Additional Adjustments row and
    // final line use per-template generic fields (mapped by widget position).
    fields.push(['DVvalue', money(data.severityModifiedLov)])
    if (variant === 'wloss-sedgwick') {
      fields.push(
        ['Text4', money(data.severityModifiedLov)], // left: Severity Modified L.O.V.
        ['Text5', `${data.priorLossPercent}%`], // times X%
        ['Text1', money(data.adjustedLov)], // = Adjusted L.O.V.
        ['Text2', money(data.finalDv)], // final Inherent Diminished Value
      )
    } else {
      fields.push(
        ['Text2', money(data.severityModifiedLov)], // left: Severity Modified L.O.V.
        ['Text1', String(data.priorLossPercent)], // times X% (template prints the % sign)
        ['Text4', money(data.finalDv)], // final Inherent Diminished Value
      )
    }
  }

  for (const [name, value] of fields) {
    try {
      const field = form.getTextField(name)
      field.setText(value)
      field.defaultUpdateAppearances(helvetica)
    } catch { /* field may not exist in this template */ }
  }

  try {
    const states = form.getDropdown('states')
    if (data.licenseState) states.select(data.licenseState)
  } catch { /* dropdown missing or option not present */ }

  // Flatten AcroForm fields so the printed PDF is clean static text — no
  // editable fields, matches the ACV report behavior. Appearances were
  // already updated to Helvetica above, so flatten renders them as-is.
  form.flatten()

  return doc.save()
}
