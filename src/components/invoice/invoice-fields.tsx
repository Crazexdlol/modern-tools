"use client"

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  INVOICE_MAX_ROWS,
  emptyLineItem,
  invoiceSubtotal,
  formatInvoiceMoney,
  pickInvoiceVariant,
  type InvoiceLineItem,
  type InvoiceFormData,
} from '@/lib/invoice/types'

export const invoiceInputCls = 'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
export const invoiceLabelCls = 'block text-xs font-medium text-gray-500 mb-1'

// Raw string while typing (so "4" doesn't jump to "$4.00" mid-keystroke),
// formatted to $0.00 on blur.
function InvoiceMoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
      <input
        className={cn(invoiceInputCls, 'pl-6')}
        value={text ?? value}
        onChange={(e) => {
          setText(e.target.value)
          onChange(e.target.value)
        }}
        onBlur={() => {
          const n = parseFloat(value.replace(/[^0-9.-]/g, ''))
          if (!isNaN(n)) onChange(formatInvoiceMoney(n))
          setText(null)
        }}
        placeholder="0.00"
      />
    </div>
  )
}

const MAX_ROWS = INVOICE_MAX_ROWS['very-long']

// Purely informational — which printed template a given line count will use.
// Not a picker: the template is always chosen automatically from line count.
export function InvoiceTemplateNote({ lineItemCount }: { lineItemCount: number }) {
  const variant = pickInvoiceVariant(lineItemCount)
  return (
    <p className="text-xs text-gray-400">
      {variant === 'long'
        ? `Using the Long template (${lineItemCount}/${INVOICE_MAX_ROWS.long} lines) — includes the full Owner/Insurance/Vehicle block.`
        : `Using the Very Long template (${lineItemCount}/${INVOICE_MAX_ROWS['very-long']} lines) — more lines fit, but no Owner/Insurance/Vehicle block.`}
    </p>
  )
}

export function InvoiceLineItemsEditor({
  lineItems,
  onChange,
}: {
  lineItems: InvoiceLineItem[]
  onChange: (next: InvoiceLineItem[]) => void
}) {
  const update = (i: number, patch: Partial<InvoiceLineItem>) => {
    onChange(lineItems.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  }
  const removeRow = (i: number) => onChange(lineItems.filter((_, idx) => idx !== i))
  const addRow = () => onChange([...lineItems, emptyLineItem()])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[90px_1fr_120px_32px] gap-2 px-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <span>Quantity</span>
        <span>Description</span>
        <span>Total</span>
        <span />
      </div>
      {lineItems.map((item, i) => (
        <div key={i} className="grid grid-cols-[90px_1fr_120px_32px] gap-2 items-center">
          <input
            className={invoiceInputCls}
            value={item.quantity}
            onChange={(e) => update(i, { quantity: e.target.value })}
            placeholder="1"
          />
          <input
            className={invoiceInputCls}
            value={item.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="Appraisal fee"
          />
          <InvoiceMoneyInput value={item.total} onChange={(total) => update(i, { total })} />
          <button
            type="button"
            onClick={() => removeRow(i)}
            disabled={lineItems.length <= 1}
            className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300 transition-colors p-1"
            title="Remove line"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={lineItems.length >= MAX_ROWS}
        className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-300 disabled:cursor-not-allowed mt-2"
      >
        <Plus className="w-4 h-4" /> Add Line
      </button>
      {lineItems.length >= MAX_ROWS && (
        <p className="text-xs text-amber-600">At the {MAX_ROWS}-line limit.</p>
      )}
      <InvoiceTemplateNote lineItemCount={lineItems.length} />
    </div>
  )
}

export function InvoiceSummary({ lineItems }: { lineItems: InvoiceLineItem[] }) {
  const subtotal = invoiceSubtotal(lineItems)
  return (
    <div className="flex justify-end">
      <div className="w-56 space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-semibold text-gray-900">${formatInvoiceMoney(subtotal)}</span></div>
        <div className="flex justify-between border-t border-gray-200 pt-1.5"><span className="font-bold text-gray-900">Total</span><span className="font-bold text-gray-900">${formatInvoiceMoney(subtotal)}</span></div>
      </div>
    </div>
  )
}

// Date/Invoice #/Client + (when the Long template applies) the full
// Owner/Insurance/Vehicle block — shared by the standalone builder and the
// claim-bound Reports tab so both show and let you edit the same fields.
export function InvoiceFormFields({
  data,
  onChange,
}: {
  data: InvoiceFormData
  onChange: (patch: Partial<InvoiceFormData>) => void
}) {
  const variant = pickInvoiceVariant(data.lineItems.length)
  return (
    <>
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader><CardTitle className="text-gray-900">Invoice Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={invoiceLabelCls}>Date</label>
              <input type="date" className={invoiceInputCls} value={data.date} onChange={(e) => onChange({ date: e.target.value })} />
            </div>
            <div>
              <label className={invoiceLabelCls}>Invoice #</label>
              <input className={invoiceInputCls} value={data.invoiceNumber} onChange={(e) => onChange({ invoiceNumber: e.target.value })} placeholder="1001" />
            </div>
            <div>
              <label className={invoiceLabelCls}>Client</label>
              <input className={invoiceInputCls} value={data.client} onChange={(e) => onChange({ client: e.target.value })} placeholder="Sedgwick" />
            </div>
          </div>
        </CardContent>
      </Card>

      {variant === 'long' && (
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardHeader><CardTitle className="text-gray-900">Owner / Insurance / Vehicle</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Owner</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={invoiceLabelCls}>Name</label><input className={invoiceInputCls} value={data.ownerName} onChange={(e) => onChange({ ownerName: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Address</label><input className={invoiceInputCls} value={data.ownerAddress} onChange={(e) => onChange({ ownerAddress: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Phone</label><input className={invoiceInputCls} value={data.ownerPhone} onChange={(e) => onChange({ ownerPhone: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Date of Loss</label><input type="date" className={invoiceInputCls} value={data.dateOfLoss} onChange={(e) => onChange({ dateOfLoss: e.target.value })} /></div>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Insurance Company</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={invoiceLabelCls}>Name</label><input className={invoiceInputCls} value={data.insuranceCompany} onChange={(e) => onChange({ insuranceCompany: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Adjuster</label><input className={invoiceInputCls} value={data.adjuster} onChange={(e) => onChange({ adjuster: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Phone</label><input className={invoiceInputCls} value={data.insurancePhone} onChange={(e) => onChange({ insurancePhone: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Email</label><input className={invoiceInputCls} value={data.insuranceEmail} onChange={(e) => onChange({ insuranceEmail: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>CL #</label><input className={invoiceInputCls} value={data.claimNumber} onChange={(e) => onChange({ claimNumber: e.target.value })} /></div>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Vehicle</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div><label className={invoiceLabelCls}>Year</label><input className={invoiceInputCls} value={data.vehicleYear} onChange={(e) => onChange({ vehicleYear: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Make</label><input className={invoiceInputCls} value={data.vehicleMake} onChange={(e) => onChange({ vehicleMake: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>Model</label><input className={invoiceInputCls} value={data.vehicleModel} onChange={(e) => onChange({ vehicleModel: e.target.value })} /></div>
                <div><label className={invoiceLabelCls}>VIN</label><input className={invoiceInputCls} value={data.vin} onChange={(e) => onChange({ vin: e.target.value })} /></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
