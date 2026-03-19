import { PDFDocument, StandardFonts } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

export interface AwardPdfData {
  insuranceCompany: string
  vehicleOwner: string
  vehicle: string
  dateOfLoss: string
  claimDate: string
  claimNumber: string
  acvAmount: string
  signatureDate1: string
  signatureDate2: string
  signatureBlock1: string
  signatureBlock2: string
}

// Convert YYYY-MM-DD to MM/DD/YYYY
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`
  }
  return dateStr
}

export async function fillAwardPdf(data: AwardPdfData): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'award-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)

  // Correct field mapping (by Y-coordinate position in the PDF):
  // Text1 = Date (top field)
  // Text2 = Claim Number
  // Text3 = Insurance Company
  // Text4 = Vehicle Owner
  // Text5 = Vehicle
  // Text6 = Date of Loss
  const fields: [string, string][] = [
    ['Text1', formatDate(data.claimDate)],
    ['Text2', data.claimNumber],
    ['Text3', data.insuranceCompany],
    ['Text4', data.vehicleOwner],
    ['Text5', data.vehicle],
    ['Text6', formatDate(data.dateOfLoss)],
    ['undefined', data.acvAmount],
    ['Date', formatDate(data.signatureDate1)],
    ['Date_2', formatDate(data.signatureDate2)],
    ['Text8', data.signatureBlock1],
    ['Text9', data.signatureBlock2],
  ]

  for (const [name, value] of fields) {
    try {
      const field = form.getTextField(name)
      field.setText(value)
      field.defaultUpdateAppearances(timesRoman)
    } catch { /* field may not exist */ }
  }

  return doc.save()
}
