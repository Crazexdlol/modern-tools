// Per-company display labels for shared fields whose name changes by
// company. Keeps the DB column names generic (ma_number) and only swaps
// the UI copy.

export function fileNumberLabel(companySlug: string | null | undefined): string {
  if (companySlug === 'eagleview') return 'EV #'
  return 'MA #'
}

export function fileNumberLongLabel(companySlug: string | null | undefined): string {
  if (companySlug === 'eagleview') return 'EV Number'
  return 'MA Number'
}
