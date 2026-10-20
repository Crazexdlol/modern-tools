"use client"

import { useState } from 'react'
import { Loader2, Printer, AlertCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ClaimInfo, LOUState } from '@/lib/acv/types'
import {
  defaultLOUState,
  averageRentalRate,
  totalDaysFor,
  finalLOUFor,
  averageLOUValue,
  totalLOUAdjustments,
  hoursBusinessRepairDays,
  hoursWeekendDays,
} from '@/lib/acv/types'
import { formatCurrency } from '@/lib/acv/calculations'
import { MoneyInput } from '@/components/claim/dv-tab'
import { savePdfPickerFirst } from '@/lib/save-pdf'

// Labor-hours input: text-backed so the display can show "1.0" instead of
// browsers' native number-field normalization. While focused the raw draft
// is shown (so the user can type "1." mid-entry without jumping); on blur
// we normalize to one decimal place ("1" → "1.0", "2.5" → "2.5").
function HoursInput({
  value,
  onChange,
  className,
  labelCls,
}: {
  value: number
  onChange: (v: number) => void
  className: string
  labelCls: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft !== null ? draft : value > 0 ? value.toFixed(1) : ''
  return (
    <div>
      <label className={labelCls}>Labor Hours</label>
      <input
        type="text"
        inputMode="decimal"
        className={className}
        value={display}
        placeholder="0.0"
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          const n = parseFloat(raw)
          onChange(isNaN(n) ? 0 : n)
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}

export function LOUTab({
  claim,
  lou,
  onChange,
  onClaimChange,
  onGenerated,
  title = 'Loss of Use',
}: {
  claim: ClaimInfo
  lou: LOUState | null
  onChange: (next: LOUState) => void
  // Lets the LOU tab edit claim-owned fields (Date of Loss, mainly — it
  // drives the DAYS variant's day count so being locked here was wrong).
  onClaimChange?: (next: ClaimInfo) => void
  onGenerated?: (blob: Blob, name: string) => Promise<void> | void
  // Section title rendered inside the first card's header — matches the
  // Closing Notes / Award "title lives in the same bubble as the content"
  // layout. Default = "Loss of Use".
  title?: string
}) {
  // Merge the saved state (which may predate newer fields like dateCompleted
  // / adjustments / notes) over the defaults so every input stays controlled.
  const state: LOUState = { ...defaultLOUState(), ...(lou ?? {}) }
  const set = (patch: Partial<LOUState>) => onChange({ ...state, ...patch })
  const setRental = (idx: 0 | 1 | 2, patch: Partial<LOUState['rentals'][number]>) => {
    const next = [state.rentals[0], state.rentals[1], state.rentals[2]] as LOUState['rentals']
    next[idx] = { ...next[idx], ...patch }
    onChange({ ...state, rentals: next })
  }

  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cover-page toggle. See /api/acv/generate-lou-pdf for the server-side strip.
  const [includeCover, setIncludeCover] = useState(true)

  const average = averageRentalRate(state.rentals)
  const totalDays = totalDaysFor(state, claim.dateOfLoss)
  const averageValue = averageLOUValue(state, claim.dateOfLoss)
  const adjustmentsTotal = totalLOUAdjustments(state)
  const total = finalLOUFor(state, claim.dateOfLoss)

  const downloadPdf = async () => {
    setDownloading(true)
    setError(null)
    const name = `${claim.maNumber || 'claim'}-loureport.pdf`
    try {
      await savePdfPickerFirst(
        name,
        async () => {
          const comp1Value = state.rentals[0].dailyRate * totalDays
          const comp2Value = state.rentals[1].dailyRate * totalDays
          const comp3Value = state.rentals[2].dailyRate * totalDays
          const res = await fetch('/api/acv/generate-lou-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant: state.template,
          includeCover,
          data: {
            maNumber: claim.maNumber,
            claimNumber: claim.claimNumber,
            // Client = the party we work on behalf of (shown on the cover
            // page). Falls back to insurance company name when the claim's
            // clientName isn't set yet.
            clientName: claim.clientName || claim.insuranceCompany,
            // OWNER column — the vehicle owner. For an "Insured" claim this
            // is the insured; for a "Claimant" claim the claimant block takes
            // precedence (same convention the DV / Award reports already use).
            clientType: claim.clientType,
            ownerName: claim.clientType === 'Claimant' && claim.claimantName ? claim.claimantName : claim.insuredName,
            ownerPhone: claim.clientType === 'Claimant' && claim.claimantPhone ? claim.claimantPhone : claim.ownerPhone,
            ownerEmail: claim.clientType === 'Claimant' && claim.claimantEmail ? claim.claimantEmail : claim.ownerEmail,
            ownerAddress: claim.clientType === 'Claimant' && claim.claimantAddress ? claim.claimantAddress : claim.ownerAddress,
            // INSURANCE COMPANY column
            insuranceCompany: claim.insuranceCompany,
            adjusterName: claim.adjuster,
            adjusterPhone: claim.adjusterPhone,
            adjusterEmail: claim.adjusterEmail,
            // VEHICLE column
            vehicleYear: String(claim.year ?? ''),
            vehicleMake: claim.make ?? '',
            vehicleModel: claim.model ?? '',
            vin: claim.vin ?? '',
            mileage: claim.mileage ?? 0,
            licenseState: state.licenseState,
            // Dates: date1 slot = Date of Loss, date2 slot = Date Unit
            // Received. Date Completed is used client-side only (drives
            // the days auto-calc for the DAYS variant); the PDF stamps
            // today's date in the cover "Date:" slot at generation time.
            dateOfLoss: claim.dateOfLoss,
            dateUnitReceived: state.dateUnitReceived,
            // Rental comps
            rental1Description: state.rentals[0].description,
            rental1DailyRate: state.rentals[0].dailyRate,
            rental2Description: state.rentals[1].description,
            rental2DailyRate: state.rentals[1].dailyRate,
            rental3Description: state.rentals[2].description,
            rental3DailyRate: state.rentals[2].dailyRate,
            // Calculations
            totalDays,
            comp1Value,
            comp2Value,
            comp3Value,
            averageValue,
            adjustment1Label: state.adjustment1Label,
            adjustment1Value: state.adjustment1Value,
            adjustment2Label: state.adjustment2Label,
            adjustment2Value: state.adjustment2Value,
            adjustments: adjustmentsTotal,
            finalLossOfUse: total,
            // Hours-template values — Business Repair Days + Weekends are
            // auto-derived now, so send the computed numbers so the PDF
            // derivation table matches what the UI shows.
            laborHours: state.laborHours,
            businessRepairDays: hoursBusinessRepairDays(state.laborHours),
            weekends: hoursWeekendDays(hoursBusinessRepairDays(state.laborHours), claim.dateOfLoss),
            additionalDays: state.additionalDays,
            // Notes
            notes: state.notes,
          },
        }),
      })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'PDF generation failed')
          }
          return res.blob()
        },
        async (blob, filename) => {
          await onGenerated?.(blob, filename)
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setDownloading(false)
    }
  }

  const inputCls = 'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-3">
      {/* Primary card — holds the tab title (same bubble as the first set
          of controls, matching Closing Notes / Award) + the template picker. */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="py-3">
          <CardTitle className="text-black text-lg font-bold tracking-tight">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Template</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set({ template: 'days' })}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                state.template === 'days'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              Days (date-based)
            </button>
            <button
              type="button"
              onClick={() => set({ template: 'hours' })}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                state.template === 'hours'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              Hours (labor hours → days)
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Days / Hours input — moved ABOVE the rental comps so the "how many
          days / hours of rental we're billing for" question is answered
          before the comp rates are entered. */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="py-3">
          <CardTitle className="text-gray-900 text-base">
            {state.template === 'days' ? 'Rental Days' : 'Hours → Days Derivation'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {state.template === 'days' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className={labelCls}>Date of Loss</label>
                <input
                  type="date"
                  className={inputCls}
                  value={claim.dateOfLoss || ''}
                  onChange={(e) => onClaimChange?.({ ...claim, dateOfLoss: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Date Unit Received</label>
                <input
                  type="date"
                  className={inputCls}
                  value={state.dateUnitReceived}
                  onChange={(e) => set({ dateUnitReceived: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Days (auto)</label>
                <div className={cn(inputCls, 'bg-gray-50 font-semibold flex items-center')}>
                  {totalDays}
                </div>
              </div>
            </div>
          ) : (
            // HOURS derivation: Labor Hours and Additional Days are the only
            // user inputs. Business Repair Days = ceil(hrs/4), Weekends are
            // auto-counted from DOL day-of-week + BRD, Total Days sums all three.
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <HoursInput
                value={state.laborHours}
                onChange={(v) => set({ laborHours: v })}
                className={inputCls}
                labelCls={labelCls}
              />
              <div>
                <label className={labelCls}>Business Repair Days (auto)</label>
                <div className={cn(inputCls, 'bg-gray-50 font-semibold flex items-center')}>
                  {hoursBusinessRepairDays(state.laborHours)}
                </div>
              </div>
              <div>
                <label className={labelCls}>Weekends (auto)</label>
                <div className={cn(inputCls, 'bg-gray-50 font-semibold flex items-center')}>
                  {hoursWeekendDays(hoursBusinessRepairDays(state.laborHours), claim.dateOfLoss)}
                </div>
              </div>
              <div>
                <label className={labelCls}>Additional Days</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={state.additionalDays === 0 ? '' : String(state.additionalDays)}
                  onChange={(e) => set({ additionalDays: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div>
                <label className={labelCls}>Total Days (auto)</label>
                <div className={cn(inputCls, 'bg-gray-50 font-semibold flex items-center')}>
                  {totalDays}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rental comps */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="py-3">
          <CardTitle className="text-gray-900 text-base">
            Rental Comps
            <span className="ml-2 text-xs font-normal text-gray-400">
              Zero-rate rows are skipped from the average.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2 items-end">
              <div>
                <label className={labelCls}>Comp #{i + 1} — Description</label>
                <input
                  className={inputCls}
                  placeholder="Year / Make / Model, dealer, etc."
                  value={state.rentals[i].description}
                  onChange={(e) => setRental(i as 0 | 1 | 2, { description: e.target.value })}
                />
              </div>
              <MoneyInput
                label="Daily Rate"
                value={state.rentals[i].dailyRate}
                onChange={(v) => setRental(i as 0 | 1 | 2, { dailyRate: v })}
              />
              <button
                type="button"
                onClick={() => setRental(i as 0 | 1 | 2, { description: '', dailyRate: 0 })}
                title="Clear this comp"
                className="h-9 px-3 inline-flex items-center justify-center text-gray-400 hover:text-red-600 border border-gray-200 rounded-md hover:border-red-200 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex justify-end pt-1">
            <div className="text-sm text-gray-600">
              Average daily rate: <span className="font-semibold text-gray-900">{formatCurrency(average)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Adjustments — two freeform lines that total into "Adjustments" on the form. */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="py-3">
          <CardTitle className="text-gray-900 text-base">Adjustments</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2 items-end">
            <div>
              <label className={labelCls}>Adjustment #1 — Description</label>
              <input
                className={inputCls}
                placeholder="e.g. extended rental period"
                value={state.adjustment1Label}
                onChange={(e) => set({ adjustment1Label: e.target.value })}
              />
            </div>
            <MoneyInput
              label="Amount"
              value={state.adjustment1Value}
              onChange={(v) => set({ adjustment1Value: v })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2 items-end">
            <div>
              <label className={labelCls}>Adjustment #2 — Description</label>
              <input
                className={inputCls}
                placeholder="optional"
                value={state.adjustment2Label}
                onChange={(e) => set({ adjustment2Label: e.target.value })}
              />
            </div>
            <MoneyInput
              label="Amount"
              value={state.adjustment2Value}
              onChange={(v) => set({ adjustment2Value: v })}
            />
          </div>
          <div className="flex justify-end pt-1">
            <div className="text-sm text-gray-600">
              Total adjustments: <span className="font-semibold text-gray-900">{formatCurrency(adjustmentsTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Notes — freeform text for the box drawn at the bottom of
          the LOU PDF. Pre-filled with the default sentence; the user can
          overwrite it per claim. */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="py-3">
          <CardTitle className="text-gray-900 text-base">Additional Notes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <textarea
            className={cn(inputCls, 'min-h-[72px] resize-y')}
            placeholder="Based on the information provided, I have attached the recommended Loss of Use calculation..."
            value={state.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </CardContent>
      </Card>

      {/* Result */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Average daily rate</span>
          <span className="font-semibold text-gray-900">{formatCurrency(average)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">× Total days</span>
          <span className="font-semibold text-gray-900">{totalDays}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Average Value</span>
          <span className="font-semibold text-gray-900">{formatCurrency(averageValue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">+ Adjustments</span>
          <span className="font-semibold text-gray-900">{formatCurrency(adjustmentsTotal)}</span>
        </div>
        <div className="flex justify-between border-t-2 border-blue-300 pt-2 text-base">
          <span className="font-bold text-gray-900">Loss of Use</span>
          <span className="font-bold text-red-600">{formatCurrency(total)}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <label className="inline-flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeCover}
            onChange={(e) => setIncludeCover(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          Cover Page
        </label>
        <Button onClick={downloadPdf} disabled={downloading} className="bg-blue-600 hover:bg-blue-500 text-white font-bold">
          {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
          Print Report
        </Button>
      </div>
    </div>
  )
}
