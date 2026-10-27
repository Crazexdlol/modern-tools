"use client"

import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { alertDialog } from '@/components/ui/dialog-service'
import { updateClient, type Client } from '@/lib/supabase/clients'
import {
  PRIMARY_RATE_KEYS,
  PRIMARY_RATE_LABELS,
  ADDON_RATE_KEYS,
  ADDON_RATE_LABELS,
  defaultRateCard,
  rateCardEquals,
  type ClientRateCard,
} from '@/lib/supabase/rate-card'

// Decimal text input for a dollar amount. Empty string = null.
function RateInput({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  const display = value === null ? '' : String(value)
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const raw = e.target.value.trim()
        if (raw === '') return onChange(null)
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) return
        onChange(parsed)
      }}
      className="w-28 bg-white border border-gray-200 rounded px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}

export function RatesTab({
  client,
  onSaved,
}: {
  client: Client
  onSaved: () => Promise<void> | void
}) {
  const [card, setCard] = useState<ClientRateCard>(client.rateCard ?? defaultRateCard())
  const [busy, setBusy] = useState(false)

  const dirty = !rateCardEquals(card, client.rateCard ?? defaultRateCard())

  const save = async () => {
    if (!dirty || busy) return
    setBusy(true)
    const updated = await updateClient(client.id, { rateCard: card })
    setBusy(false)
    if (!updated) {
      await alertDialog({
        title: 'Save failed',
        message: 'Could not save rate card. Check the console for details.',
        variant: 'danger',
      })
      return
    }
    // If the DB round-trip stripped rate_card (pre-migration 42703 fallback),
    // the returned client will have null-leaves everywhere while our local
    // card does not. Flag it so the admin runs the migration.
    if (
      rateCardEquals(updated.rateCard, defaultRateCard()) &&
      !rateCardEquals(card, defaultRateCard())
    ) {
      await alertDialog({
        title: 'Rates not persisted',
        message:
          'The rate_card column is missing from the database. Run supabase/migration-client-rate-card.sql in the Supabase SQL editor, then re-save.',
        variant: 'danger',
      })
    }
    await onSaved()
  }

  const setPrimary = (
    key: typeof PRIMARY_RATE_KEYS[number],
    slot: 'bare' | 'withRta',
    v: number | null,
  ) => {
    setCard((prev) => ({
      ...prev,
      primary: { ...prev.primary, [key]: { ...prev.primary[key], [slot]: v } },
    }))
  }

  const setAddOn = (key: typeof ADDON_RATE_KEYS[number], v: number | null) => {
    setCard((prev) => ({ ...prev, addOns: { ...prev.addOns, [key]: v } }))
  }

  const setTime = (key: 'hourly' | 'mileage', v: number | null) => {
    setCard((prev) => ({ ...prev, time: { ...prev.time, [key]: v } }))
  }

  return (
    <div className="space-y-5">
      {/* Section 1 — Primary rates */}
      <section className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Primary Assignment Rates
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Bare ($)</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">With RTA ($)</th>
              </tr>
            </thead>
            <tbody>
              {PRIMARY_RATE_KEYS.map((k, i) => (
                <tr key={k} className={i < PRIMARY_RATE_KEYS.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="px-3 py-2 text-gray-800">{PRIMARY_RATE_LABELS[k]}</td>
                  <td className="px-3 py-2 text-right">
                    <RateInput
                      value={card.primary[k].bare}
                      onChange={(v) => setPrimary(k, 'bare', v)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RateInput
                      value={card.primary[k].withRta}
                      onChange={(v) => setPrimary(k, 'withRta', v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2 — Add-ons */}
      <section className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Add-On Rates
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Flat rate ($)</th>
              </tr>
            </thead>
            <tbody>
              {ADDON_RATE_KEYS.map((k, i) => (
                <tr key={k} className={i < ADDON_RATE_KEYS.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="px-3 py-2 text-gray-800">{ADDON_RATE_LABELS[k]}</td>
                  <td className="px-3 py-2 text-right">
                    <RateInput
                      value={card.addOns[k]}
                      onChange={(v) => setAddOn(k, v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3 — Time */}
      <section className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Time Rates
        </div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 text-gray-800">
                  Hourly <span className="text-xs text-gray-400">($/hr)</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <RateInput value={card.time.hourly} onChange={(v) => setTime('hourly', v)} />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-800">
                  Mileage <span className="text-xs text-gray-400">($/mile)</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <RateInput value={card.time.mileage} onChange={(v) => setTime('mileage', v)} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={!dirty || busy}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  )
}
