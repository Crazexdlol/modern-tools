"use client"

// Assignment Sheet — a single-page printable summary of the claim.
// Rendered via a React portal directly into <body> so print CSS can hide
// every OTHER body child without also hiding this sheet (which would happen
// if it were nested deep in the app tree). See triggerAssignmentSheetPrint.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClaimInfo } from '@/lib/acv/types'
import { formatCurrency } from '@/lib/acv/calculations'
import { mileageModifierFor, type DVState } from '@/components/claim/dv-tab'

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
  useEffect(() => { setMounted(true) }, [])
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
            <img src="/logo.png" alt="Modern Appraisers" className="logo" />
          </div>
          <div className="header-right">
            <div className="title">Assignment Sheet</div>
            <div className="printed">Printed: {printedOn}</div>
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
        .assignment-print-portal { display: none; }
        @media print {
          body.printing-assignment-sheet > *:not(.assignment-print-portal) { display: none !important; }
          body.printing-assignment-sheet .assignment-print-portal { display: block !important; }
          @page { size: letter; margin: 0.4in; }
          html, body { background: white !important; }
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
        .header-left .logo { height: 44px; width: auto; display: block; }
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

// Called by the Print button. Adds a body class that hides everything except
// this portal in print CSS, opens the browser print dialog, then removes the
// class after the dialog closes (onafterprint or the sync fallback).
export function triggerAssignmentSheetPrint() {
  const CLASS = 'printing-assignment-sheet'
  document.body.classList.add(CLASS)
  const cleanup = () => {
    document.body.classList.remove(CLASS)
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // Fallback: some browsers fire afterprint immediately; some don't fire it
  // reliably. Belt: also clean up after a short timeout.
  setTimeout(cleanup, 1000)
}
