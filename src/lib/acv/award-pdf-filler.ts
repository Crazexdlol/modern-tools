import { PDFDocument, PDFName, PDFBool } from 'pdf-lib'
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

function setField(
  form: ReturnType<PDFDocument['getForm']>,
  name: string,
  value: string,
) {
  try {
    const field = form.getTextField(name)
    field.setText(value)
    field.acroField.getWidgets().forEach(w => {
      w.dict.delete(PDFName.of('AP'))
    })
  } catch { /* field may not exist */ }
}

export async function fillAwardPdf(data: AwardPdfData): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'award-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const form = doc.getForm()

  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)

  setField(form, 'Text1', data.insuranceCompany)
  setField(form, 'Text2', data.vehicleOwner)
  setField(form, 'Text3', data.vehicle)
  setField(form, 'Text4', data.dateOfLoss)
  setField(form, 'Text5', data.claimDate)
  setField(form, 'Text6', data.claimNumber)
  setField(form, 'undefined', data.acvAmount)
  setField(form, 'Date', data.signatureDate1)
  setField(form, 'Date_2', data.signatureDate2)
  setField(form, 'Text8', data.signatureBlock1)
  setField(form, 'Text9', data.signatureBlock2)

  return doc.save()
}
