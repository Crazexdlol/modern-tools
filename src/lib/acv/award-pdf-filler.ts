import { PDFDocument, PDFName, PDFBool, StandardFonts } from 'pdf-lib'
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

export async function fillAwardPdf(data: AwardPdfData): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'award-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()
  const timesRoman = await doc.embedFont(StandardFonts.TimesRoman)

  // Set each field with Times New Roman font
  const fields: [string, string][] = [
    ['Text1', data.insuranceCompany],
    ['Text2', data.vehicleOwner],
    ['Text3', data.vehicle],
    ['Text4', data.dateOfLoss],
    ['Text5', data.claimDate],
    ['Text6', data.claimNumber],
    ['undefined', data.acvAmount],
    ['Date', data.signatureDate1],
    ['Date_2', data.signatureDate2],
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
