"use client"

// Assignment Sheet — a single-page printable summary of the claim.
// Rendered as a hidden portal in <body>; captured to a PDF blob via
// html2canvas + jspdf when the Print button is clicked, then handed to the
// OS Save-As picker. PDF output has no browser chrome (no URL footer), so
// physical prints of the saved PDF come out clean.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
// Use html2canvas-pro (drop-in fork) — the original html2canvas doesn't
// understand modern CSS color functions (oklch, lab) that Tailwind v4
// generates, and throws "unsupported color function" on capture.
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'
import type { ClaimInfo } from '@/lib/acv/types'
import { formatCurrency } from '@/lib/acv/calculations'
import { mileageModifierFor, type DVState } from '@/components/claim/dv-tab'
import { savePdfWithPicker } from '@/lib/save-pdf'

export interface AssignmentSheetData {
  claim: ClaimInfo
  status: 'open' | 'closed'
  submittedAt: string | null
  assignedToName: string
  // notesData shape lives in ClaimWorkspace's ReportsState. We accept the
  // fields we need directly to keep the coupling loose.
  notesType: string
  opposingAppraiserName: string
  opposingAppraiserCompany: string
  opposingAppraiserValue: number
  agreementAmount: number
  umpireAmount: number
  // Our ACV (0 if not computed yet).
  ourAcv: number
  // DV state (null if the DV tab has never been opened for this claim).
  dv: DVState | null
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const parts = dateStr.split('T')[0].split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
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

function labelFor(notesType: string): string {
  if (notesType === 'dv') return 'Diminished Value'
  if (notesType === 'acv-umpire') return 'ACV → Umpire'
  if (notesType === 'dv-umpire') return 'DV → Umpire'
  return 'ACV'
}

export function AssignmentSheet({ data }: { data: AssignmentSheetData }) {
  const {
    claim, status, submittedAt, assignedToName,
    notesType, opposingAppraiserName, opposingAppraiserCompany, opposingAppraiserValue,
    agreementAmount, umpireAmount, ourAcv, dv,
  } = data

  // Mount into <body> via a portal so print CSS can hide every OTHER body
  // child without also hiding this sheet.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-flag pattern; setState fires once to signal client-side render (createPortal needs document)
    setMounted(true)
  }, [])
  if (!mounted) return null

  const printedOn = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const vehicle = [claim.year || '', claim.make, claim.model, claim.trim].filter(Boolean).join(' ')
  const handling = claim.handlingAppraiser || assignedToName || 'Unassigned'
  const opposing = opposingAppraiserName
    ? `${opposingAppraiserName}${opposingAppraiserCompany ? ` · ${opposingAppraiserCompany}` : ''}`
    : '—'
  const ourDv = computeFinalDv(dv, claim.mileage)
  const submittedLabel = submittedAt
    ? new Date(submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return createPortal(
    <div className="assignment-print-portal">
      <div className="assignment-sheet">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> renders more reliably than next/image in a print portal */}
            <img src="/companies/modern-appraisers/logo.png" alt="Modern Appraisers" className="logo" />
          </div>
          <div className="header-right">
            <div className="title">Assignment Sheet</div>
            <div className="printed">{printedOn}</div>
          </div>
        </div>

        {/* CLAIM */}
        <section className="section">
          <h3>Claim</h3>
          <div className="grid-2">
            <Row label="MA #" value={claim.maNumber || '—'} />
            <Row label="CL #" value={claim.claimNumber || '—'} />
            <Row label="Date Received" value={fmtDate(claim.dateReceived)} />
            <Row label="Date of Loss" value={fmtDate(claim.dateOfLoss)} />
            <Row label="Assignment Type" value={labelFor(notesType)} />
            <Row label="Claim For" value={claim.clientType || '—'} />
          </div>
        </section>

        {/* INSURED / OWNER */}
        <section className="section">
          <h3>Insured / Owner</h3>
          <div className="grid-2">
            <Row label="Name" value={claim.insuredName || '—'} />
            <Row label="Client" value={claim.clientName || '—'} />
            <Row label="Phone" value={claim.ownerPhone || '—'} />
            <Row label="Email" value={claim.ownerEmail || '—'} />
            <Row label="Address" value={claim.ownerAddress || '—'} colSpan={2} />
          </div>
        </section>

        {/* VEHICLE */}
        <section className="section">
          <h3>Vehicle</h3>
          <div className="grid-2">
            <Row label="Year / Make / Model / Trim" value={vehicle || '—'} colSpan={2} />
            <Row label="VIN" value={claim.vin || '—'} />
            <Row label="Mileage" value={claim.mileage ? claim.mileage.toLocaleString() : '0'} />
          </div>
        </section>

        {/* INSURANCE */}
        <section className="section">
          <h3>Insurance</h3>
          <div className="grid-2">
            <Row label="Company" value={claim.insuranceCompany || '—'} />
            <Row label="Adjuster" value={claim.adjuster || '—'} />
            <Row label="Phone" value={claim.adjusterPhone || '—'} />
            <Row label="Email" value={claim.adjusterEmail || '—'} />
          </div>
        </section>

        {/* APPRAISERS */}
        <section className="section">
          <h3>Appraisers</h3>
          <div className="grid-2">
            <Row label="Handling (Us)" value={handling} />
            <Row label="Opposing (IA)" value={opposing} />
          </div>
        </section>

        {/* VALUATIONS */}
        <section className="section">
          <h3>Valuations</h3>
          <div className="grid-money">
            <MoneyRow label="Our ACV" value={ourAcv} />
            <MoneyRow label="Our DV" value={ourDv} />
            <MoneyRow label="Opposing (IA) Value" value={opposingAppraiserValue} />
            <MoneyRow label="Agreed Amount" value={agreementAmount} />
            <MoneyRow label="Umpire Amount" value={umpireAmount} />
          </div>
        </section>

        {/* STATUS */}
        <section className="section">
          <h3>Status</h3>
          <div className="grid-2">
            <Row label="Claim Status" value={status === 'closed' ? 'Closed' : 'Open'} />
            <Row label="Submitted" value={submittedLabel} />
          </div>
        </section>
      </div>

      <style jsx global>{`
        /* Off-screen instead of display:none: keeps the element rendered
           (images actually load, layout is computed) so html2canvas can
           capture real pixel dimensions. User never sees it — it's way
           beyond the viewport. */
        .assignment-print-portal {
          position: absolute;
          left: -99999px;
          top: 0;
          width: 8.5in;
          pointer-events: none;
          z-index: -1;
        }
        .assignment-sheet {
          background: white;
          color: black;
          font-family: "Times New Roman", Times, serif;
          padding: 16px 20px;
          max-width: 7.7in;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
          margin-bottom: 10px;
        }
        /* filter: brightness(0) forces the white/light logo image to render
           as solid black on the printed page (preserves transparency). */
        .header-left .logo { height: 44px; width: auto; display: block; filter: brightness(0); }
        .header-right { text-align: right; }
        .title { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; line-height: 1.1; }
        .printed { font-size: 11px; color: #444; margin-top: 2px; }
        .section {
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid #bbb;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .section:last-of-type { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .section h3 {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #444;
          margin: 0 0 4px 0;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 32px;
        }
        .grid-money {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 3px 32px;
          max-width: 420px;
        }
      `}</style>
    </div>,
    document.body,
  )
}

function Row({ label, value, colSpan = 1 }: { label: string; value: string; colSpan?: 1 | 2 }) {
  return (
    <div style={colSpan === 2 ? { gridColumn: 'span 2' } : undefined}>
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#000', marginTop: 1 }}>{value}</div>
    </div>
  )
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <div style={{ fontSize: 13, color: '#333' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#000', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {formatCurrency(value || 0)}
      </div>
    </>
  )
}

// Called by the Print button. Captures the off-screen assignment-sheet
// portal, composes a Letter-size PDF, then opens it in a NEW BROWSER TAB
// so the user gets a full preview. From the tab they can save to any
// folder (browser's download button / Ctrl+S) or send to a physical
// printer (Ctrl+P). The PDF itself has no browser chrome — clean output.
export async function triggerAssignmentSheetPrint(fileName: string): Promise<void> {
  try {
    const el = document.querySelector('.assignment-sheet') as HTMLElement | null
    if (!el) {
      alert('Assignment sheet not ready yet — reload the page and try again.')
      return
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: 816, // 8.5in at 96dpi
      useCORS: true,
      logging: false,
    })

    // Fit the captured image onto a single Letter page. The sheet is designed
    // to fit in one page already; if the capture is taller than one page, we
    // scale down to fit rather than paginating (spec: one page always).
    const pageWidthPt = 612  // Letter, points (8.5in × 72pt/in)
    const pageHeightPt = 792 // Letter, points (11in × 72pt/in)
    const imgAspect = canvas.height / canvas.width
    let renderWidth = pageWidthPt
    let renderHeight = pageWidthPt * imgAspect
    if (renderHeight > pageHeightPt) {
      renderHeight = pageHeightPt
      renderWidth = pageHeightPt / imgAspect
    }
    const offsetX = (pageWidthPt - renderWidth) / 2
    const offsetY = (pageHeightPt - renderHeight) / 2

    const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
    // Metadata: the tab title / suggested filename in the PDF viewer.
    pdf.setProperties({ title: fileName.replace(/\.pdf$/i, '') })
    const img = canvas.toDataURL('image/jpeg', 0.95)
    pdf.addImage(img, 'JPEG', offsetX, offsetY, renderWidth, renderHeight)

    const blob = pdf.output('blob')
    const url = URL.createObjectURL(blob)
    // Open the PDF in a new tab. Browser's built-in viewer shows it with
    // download + print controls; user chooses save location or prints.
    const win = window.open(url, '_blank')
    if (!win) {
      // Popup blocked. Fall back to the OS Save-As dialog so the user still
      // gets the file — better than a silent failure.
      alert('Popup blocked. Saving the PDF instead — pick a folder in the dialog.')
      await savePdfWithPicker(blob, fileName)
    }
    // Free the blob URL after the tab has had a moment to load.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    console.error('Assignment sheet print failed:', err)
    alert(`Print failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
