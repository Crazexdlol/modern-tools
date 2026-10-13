import { compsDbClient } from './client'

export type MirrorInput = {
  vin: string
  price: number
  miles: number
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  dealerName: string
  dealerPhone: string
  dealerCity: string
  dealerState: string
  dealerZip: string
  photoUrl: string
  vdpUrl: string
  firstSeenAt: string | null
  priorAccident: boolean | null
  priorOwnerCount: number | null
}

type ListingRow = {
  id: number
  listing_url: string
  price: number | null
  date_first_scraped: string
}

/**
 * Mirror normalized listings (MarketCheck or Auto.dev) into the comparable-vehicles DB.
 *
 * - Upsert by listing_url (unique in listings).
 * - On price change vs most recent price_history row → insert a new price_history row.
 * - On first insert → seed a price_history row for the starting price.
 */
export async function mirrorListings(
  listings: MirrorInput[],
  opts: { active: boolean },
): Promise<void> {
  const sb = compsDbClient()
  if (!sb) return
  if (!listings.length) return

  const nowIso = new Date().toISOString()
  const todayDate = nowIso.slice(0, 10)

  const rows = listings
    .filter((l) => l.vdpUrl && l.vdpUrl.startsWith('http'))
    .map((l) => ({
      listing_url: l.vdpUrl,
      data_provider: 'scrape',
      vin: l.vin || null,
      year: l.year || null,
      make: l.make || null,
      model: l.model || null,
      trim: l.trim || null,
      mileage: l.miles || null,
      price: l.price || null,
      city: l.dealerCity || null,
      state: l.dealerState || null,
      zip: l.dealerZip || null,
      dealer_name: l.dealerName || null,
      dealer_phone: l.dealerPhone || null,
      photo_url: l.photoUrl || null,
      transmission: l.transmission || null,
      drivetrain: l.drivetrain || null,
      fuel: l.fuelType || null,
      engine_summary: l.engine || null,
      is_dealer: true,
      is_active: opts.active,
      date_listed: l.firstSeenAt ? l.firstSeenAt.slice(0, 10) : null,
      prior_accident: l.priorAccident,
      prior_owner_count: l.priorOwnerCount,
      date_first_scraped: nowIso,
      date_last_seen: nowIso,
      miss_count: 0,
    }))

  if (!rows.length) return

  const urls = rows.map((r) => r.listing_url)
  const { data: existing, error: selErr } = await sb
    .from('listings')
    .select('id, listing_url, price, date_first_scraped')
    .in('listing_url', urls)

  if (selErr) {
    console.error('[comps-mirror] pre-upsert select failed:', selErr.message)
    return
  }

  const prevById = new Map<string, ListingRow>(
    (existing ?? []).map((r) => [r.listing_url, r as ListingRow]),
  )

  const upsertRows = rows.map((r) => {
    const prev = prevById.get(r.listing_url)
    return prev ? { ...r, date_first_scraped: prev.date_first_scraped } : r
  })

  const { data: upserted, error: upErr } = await sb
    .from('listings')
    .upsert(upsertRows, { onConflict: 'listing_url' })
    .select('id, listing_url, price')

  if (upErr) {
    console.error('[comps-mirror] upsert failed:', upErr.message)
    return
  }

  const upsertedById = new Map<string, ListingRow>(
    (upserted ?? []).map((r) => [r.listing_url, r as ListingRow]),
  )

  const historyRows: { listing_id: number; price: number; date_scraped: string }[] = []
  for (const r of rows) {
    const after = upsertedById.get(r.listing_url)
    if (!after || r.price == null) continue
    const prev = prevById.get(r.listing_url)
    const priceChanged = !prev || prev.price !== r.price
    if (priceChanged) {
      historyRows.push({
        listing_id: after.id,
        price: r.price,
        date_scraped: todayDate,
      })
    }
  }

  if (historyRows.length) {
    const { error: phErr } = await sb.from('price_history').insert(historyRows)
    if (phErr) {
      console.error('[comps-mirror] price_history insert failed:', phErr.message)
    }
  }
}
