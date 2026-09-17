// Client-side helper around Mapbox Geocoding API v6.
// Public token is safe to expose per Mapbox's token model. Falls back
// silently on failure so a bad address doesn't block the save.

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

export interface GeocodeResult {
  lat: number
  lng: number
}

// Full address = "street, city, state zip". Missing pieces are fine.
export async function geocodeAddress(parts: {
  addressLine?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) return null
  const q = [parts.addressLine, parts.city, parts.state, parts.zip]
    .filter(Boolean)
    .join(', ')
    .trim()
  if (!q) return null
  try {
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
    url.searchParams.set('q', q)
    url.searchParams.set('access_token', MAPBOX_TOKEN)
    url.searchParams.set('country', 'us')
    url.searchParams.set('limit', '1')
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const data = await res.json()
    const feature = data?.features?.[0]
    const coords = feature?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    return { lng: coords[0], lat: coords[1] }
  } catch (err) {
    console.error('geocodeAddress failed:', err)
    return null
  }
}
