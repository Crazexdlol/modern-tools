import { NextRequest, NextResponse } from 'next/server'
import { extractTextFromPDF } from '@/lib/pdf-extractor'

// Known labels that appear in claim PDFs — used as stop-words when extracting values
const LABELS = [
  'File #', 'Company', 'Claim Number', 'Policy Number', 'Adjuster',
  'Adjuster Phone', 'Adjuster Email', 'Deductible Amount', 'Date of Loss',
  'Type of Loss', 'Claim For', 'Insured Name', 'Business Name',
  'First Name', 'Last Name', 'Contact Name', 'Address', 'City', 'State',
  'Zip', 'Client Email', 'Mobile Phone', 'Home Phone', 'Work Phone',
  'Location', 'Location Name', 'Location Phone', 'Year', 'Make', 'Model',
  'VIN #', 'VIN', 'License Plate', 'Color', 'Mileage', 'Appraiser',
  'Phone', 'Appraiser Zip', 'Date Created', 'Date Assigned',
  'Appt Date/Time', 'Type of Claim', 'Appointment Set', 'Assignment Type',
  'Unit Type',
]

// Build a pattern that matches any label followed by ":"
const LABEL_STOP = LABELS
  .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

function grab(text: string, label: string): string {
  // Match "Label: Value" — value stops at the next known label or newline
  const re = new RegExp(
    label + '\\s*:\\s*(.*?)(?=(?:' + LABEL_STOP + ')\\s*:|\\n|$)',
    'i'
  )
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

function grabFromSection(section: string, label: string): string {
  return grab(section, label)
}

function parseClaimText(text: string) {
  // Extract sections
  const ownerSection =
    text.match(/Owner Information[\s\S]*?(?=Location Information|Vehicle Information|$)/i)?.[0] || ''
  const vehicleSection =
    text.match(/Vehicle Information[\s\S]*?(?=Appraisal Information|Damage|$)/i)?.[0] || ''
  const insuranceSection =
    text.match(/Insurance Information[\s\S]*?(?=Owner Information|$)/i)?.[0] || text
  const appraisalSection =
    text.match(/Appraisal Information[\s\S]*?(?=Damage|Vehicle Information|$)/i)?.[0] || ''

  // File / MA number
  const maNumber = grab(text, 'File #')

  // Insurance
  // "Company" has no colon in the PDF — it's "Company Allstate Ins. Co. Claim Number:"
  let insuranceCompany = ''
  const companyMatch = text.match(/Company\s+(.+?)(?=Claim Number|Policy Number|\n)/i)
  if (companyMatch) insuranceCompany = companyMatch[1].trim()

  const claimNumber = grab(insuranceSection, 'Claim Number')
  const adjuster = grab(insuranceSection, 'Adjuster(?! Phone| Email| Zip)')
  const adjusterPhone = grab(insuranceSection, 'Adjuster Phone')

  // Date of loss — try to parse to YYYY-MM-DD
  const dolRaw = grab(text, 'Date of Loss')
  let dateOfLoss = ''
  if (dolRaw) {
    const d = new Date(dolRaw)
    if (!isNaN(d.getTime())) {
      dateOfLoss = d.toISOString().split('T')[0]
    }
  }

  // Date received (assignment created) — from Appraisal Information > Date Created.
  // This becomes Date Received Claim on the Summary Page.
  const dcRaw =
    grabFromSection(appraisalSection || text, 'Date Created') ||
    grabFromSection(appraisalSection || text, 'Date Assigned')
  let dateReceived = ''
  if (dcRaw) {
    // Assignment PDFs often include a time ("07/29/2026 10:15 AM"); take just the date.
    const cleaned = dcRaw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?.*$/i, '').trim()
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) {
      dateReceived = d.toISOString().split('T')[0]
    }
  }

  // Client type
  const claimForRaw = grab(text, 'Claim For')
  const clientType: 'Insured' | 'Claimant' =
    claimForRaw.toLowerCase().includes('claimant') ? 'Claimant' : 'Insured'

  // Insured name
  const insuredName = grab(text, 'Insured Name')

  // Client / business name — strip trailing "First Name" etc if captured
  let clientName = grabFromSection(ownerSection || text, 'Business Name')
  // Clean up: "SEDGWICK ACV First Name..." -> "SEDGWICK ACV"
  clientName = clientName.replace(/\s*(First Name|Last Name|Contact).*$/i, '').trim()

  // Owner info
  const firstName = grabFromSection(ownerSection || text, 'First Name')
  const lastName = grabFromSection(ownerSection || text, 'Last Name')

  // Address
  const ownerAddress = buildAddress(ownerSection || text)

  const ownerPhone =
    grabFromSection(ownerSection || text, 'Mobile Phone') ||
    grabFromSection(ownerSection || text, 'Home Phone') ||
    grabFromSection(ownerSection || text, 'Work Phone')
  const ownerEmail = grabFromSection(ownerSection || text, 'Client Email')

  // Vehicle info
  const year = parseInt(grabFromSection(vehicleSection || text, 'Year')) || 0
  const make = grabFromSection(vehicleSection || text, 'Make')
  const model = grabFromSection(vehicleSection || text, 'Model')
  const vin = grabFromSection(vehicleSection || text, 'VIN #') || grabFromSection(vehicleSection || text, 'VIN')
  const mileage = parseInt(grabFromSection(vehicleSection || text, 'Mileage').replace(/,/g, '')) || 0

  // ZIP — from owner or location section
  const zip = grabZip(text, ownerSection)

  return {
    maNumber,
    claimNumber,
    dateOfLoss,
    dateReceived,
    clientType,
    clientName: clientName || '',
    insuredName: insuredName || `${firstName} ${lastName}`.trim(),
    ownerPhone,
    ownerEmail,
    ownerAddress,
    insuranceCompany,
    adjuster,
    adjusterPhone,
    adjusterEmail: '',
    vin,
    year,
    make,
    model,
    mileage,
    zip,
  }
}

function buildAddress(section: string): string {
  const address = grab(section, 'Address')
  const city = grab(section, 'City')
  const state = grab(section, 'State')
  const zip = grab(section, 'Zip')

  if (city && state && zip) {
    return `${address ? address + ', ' : ''}${city}, ${state} ${zip}`
  }
  return [address, city, state, zip].filter(Boolean).join(', ')
}

function grabZip(text: string, ownerSection: string): string {
  // Prefer owner section zip
  if (ownerSection) {
    const z = grab(ownerSection, 'Zip')
    if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  }
  const locSection =
    text.match(/Location Information[\s\S]*?(?=Vehicle Information|Appraisal Information|$)/i)?.[0]
  if (locSection) {
    const z = grab(locSection, 'Zip')
    if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  }
  const z = grab(text, 'Zip')
  if (z && /^\d{5}/.test(z)) return z.slice(0, 5)
  return ''
}

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractTextFromPDF(buffer)

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF. The file may be image-based.' },
        { status: 422 }
      )
    }

    const parsed = parseClaimText(text)
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('parse-claim error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse claim PDF' },
      { status: 500 }
    )
  }
}
