import type { SelectedComp, ACVAdjustments, ACVResult } from './types'

export function calculateCompValue(comp: Pick<SelectedComp, 'price' | 'mileageAdjDollar' | 'yearAdjDollar'>): number {
  return comp.price + comp.mileageAdjDollar + comp.yearAdjDollar
}

export function calculateACV(comps: SelectedComp[], adjustments: ACVAdjustments): ACVResult {
  const comp1Value = comps[0]?.compValue ?? 0
  const comp2Value = comps[1]?.compValue ?? 0
  const comp3Value = comps[2]?.compValue ?? 0
  const averageValue = (comp1Value + comp2Value + comp3Value) / 3
  const totalAdjustments =
    adjustments.vehicleHistory +
    adjustments.priorDamages +
    adjustments.additions +
    adjustments.deductions
  const taxAmount = averageValue * (adjustments.taxRate / 100)
  const acv = averageValue + totalAdjustments + taxAmount
  return { comp1Value, comp2Value, comp3Value, averageValue, totalAdjustments, taxAmount, acv }
}

export function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
}

export function defaultAdjustments(): ACVAdjustments {
  return {
    vehicleHistory: 0,
    vehicleHistoryNote: '',
    priorDamages: 0,
    priorDamagesNote: '',
    additions: 0,
    additionsNote: '',
    deductions: -500,
    deductionsNote: 'Dealer Vs. Private ($500.00)',
    taxRate: 0,
    notes: 'Based on the information provided, I have attached the recommended ACV on this vehicle. Information was calculated using the information supplied and established with 3 available comps.',
  }
}
