// Shared, client-safe invoice types/helpers. Keep fs/pdf-lib out of this file
// (see invoice-pdf-filler.ts) so it can be imported directly by client
// components without pulling Node built-ins into the browser bundle.

export type InvoiceVariant = 'long' | 'very-long'

// How many line-item rows each printed template has room for.
export const INVOICE_MAX_ROWS: Record<InvoiceVariant, number> = {
  long: 8,
  'very-long': 14,
}

// Which template a line-item count fits — the user never picks this directly,
// it's chosen for them based on how many lines they've entered.
export function pickInvoiceVariant(lineItemCount: number): InvoiceVariant {
  return lineItemCount > INVOICE_MAX_ROWS.long ? 'very-long' : 'long'
}

export interface InvoiceLineItem {
  quantity: string
  description: string
  total: string
}

export function emptyLineItem(): InvoiceLineItem {
  return { quantity: '', description: '', total: '' }
}

export function invoiceLineTotal(item: InvoiceLineItem): number {
  return parseFloat(item.total.replace(/[^0-9.-]/g, '')) || 0
}

export function invoiceSubtotal(lineItems: InvoiceLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0)
}

// Neither template has a working Sales Tax field (Modern Appraisers' invoices
// don't charge tax on appraisal services) — Total always equals Subtotal.
export function formatInvoiceMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

export function formatInvoiceMoneyWithSign(n: number): string {
  return `$${formatInvoiceMoney(n)}`
}

// For the PDF payload: reformats each line's total to "$0.00" — but only if
// something was actually entered, so unused/blank rows print blank instead
// of a stray "$0.00".
export function formatLineItemsForPdf(lineItems: InvoiceLineItem[]): InvoiceLineItem[] {
  return lineItems.map((item) => ({
    ...item,
    total: item.total.trim() ? formatInvoiceMoneyWithSign(invoiceLineTotal(item)) : '',
  }))
}

// The full set of fields the PDF templates can fill. Owner/Insurance/Vehicle
// detail fields only exist on the "long" template — "very-long" only has room
// for date/invoiceNumber/client/lineItems/subtotal. There's no separate
// "total" here on purpose: neither template charges sales tax, so the
// template itself prints "subtotal" in both the Subtotal and Total boxes —
// see invoice-pdf-filler.ts.
export interface InvoicePdfData {
  date: string
  invoiceNumber: string
  client: string
  ownerName: string
  ownerAddress: string
  ownerPhone: string
  dateOfLoss: string
  insuranceCompany: string
  adjuster: string
  insurancePhone: string
  insuranceEmail: string
  claimNumber: string
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  vin: string
  lineItems: InvoiceLineItem[]
  subtotal: string
}

// The editable invoice form shape — shared by both the standalone
// /reports/invoice builder (starts empty, everything entered by hand) and the
// claim workspace's Reports tab (starts pre-filled from that claim's Claim
// Info, but every field stays editable and is saved as entered — nothing is
// silently pulled from the claim behind the scenes at generation time). No
// "variant" field — which template gets used is derived from
// lineItems.length via pickInvoiceVariant().
export interface InvoiceFormData {
  date: string
  invoiceNumber: string
  client: string
  ownerName: string
  ownerAddress: string
  ownerPhone: string
  dateOfLoss: string
  insuranceCompany: string
  adjuster: string
  insurancePhone: string
  insuranceEmail: string
  claimNumber: string
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  vin: string
  lineItems: InvoiceLineItem[]
}

export function emptyInvoiceFormData(): InvoiceFormData {
  return {
    date: new Date().toISOString().split('T')[0],
    invoiceNumber: '',
    client: '',
    ownerName: '',
    ownerAddress: '',
    ownerPhone: '',
    dateOfLoss: '',
    insuranceCompany: '',
    adjuster: '',
    insurancePhone: '',
    insuranceEmail: '',
    claimNumber: '',
    vehicleYear: '',
    vehicleMake: '',
    vehicleModel: '',
    vin: '',
    lineItems: [emptyLineItem()],
  }
}
