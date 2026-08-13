"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink, MapPin, Car } from 'lucide-react'

type DecodedVehicle = {
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  transmission: string
  fuelType: string
  bodyStyle: string
  vin: string
}

type Listing = {
  id: string
  vin: string
  price: number
  miles: number
  year: number
  make: string
  model: string
  trim: string
  dealerName: string
  dealerCity: string
  dealerState: string
  photoUrl: string
  heading: string
  vdpUrl: string
  source?: string
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtMiles = (n: number) => new Intl.NumberFormat('en-US').format(n)

export default function TestAutoDevPage() {
  const [vin, setVin] = useState('')
  const [zip, setZip] = useState('')
  const [radius, setRadius] = useState('150')
  const [decoded, setDecoded] = useState<DecodedVehicle | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setError(null)
    setDecoded(null)
    setListings([])

    if (vin.length !== 17) {
      setError('VIN must be 17 characters')
      return
    }
    if (!zip || zip.length < 5) {
      setError('ZIP is required')
      return
    }

    setLoading(true)
    try {
      const decodeRes = await fetch(`/api/acv/decode-vin?vin=${encodeURIComponent(vin)}`)
      const decodeData = await decodeRes.json()
      if (!decodeRes.ok) {
        setError(decodeData.error || 'VIN decode failed')
        return
      }
      setDecoded(decodeData)

      const params = new URLSearchParams({
        year: String(decodeData.year),
        make: decodeData.make,
        model: decodeData.model,
        zip,
        radius,
      })
      const compsRes = await fetch(`/api/acv/search-autodev?${params}`)
      const compsData = await compsRes.json()
      if (!compsRes.ok) {
        setError(compsData.error || 'Comp search failed')
        return
      }
      setListings(compsData.listings ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Auto.dev Test</h1>
        <p className="text-sm text-muted-foreground">
          Enter a VIN, decode it, and pull comps from Auto.dev only (no MarketCheck).
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">VIN</label>
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase().trim())}
                maxLength={17}
                placeholder="17 characters"
                className="w-full mt-1 px-3 py-2 border rounded-md font-mono uppercase"
              />
            </div>
            <div>
              <label className="text-sm font-medium">ZIP</label>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="90210"
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Radius (miles)</label>
              <select
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="150">150</option>
                <option value="250">250</option>
                <option value="500">500</option>
                <option value="0">Nationwide</option>
              </select>
            </div>
          </div>
          <Button onClick={run} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              'Decode VIN & Find Comps'
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-300">
          <CardContent className="pt-6 text-red-700">{error}</CardContent>
        </Card>
      )}

      {decoded && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Decoded Vehicle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Year:</span> {decoded.year}</div>
              <div><span className="text-muted-foreground">Make:</span> {decoded.make}</div>
              <div><span className="text-muted-foreground">Model:</span> {decoded.model}</div>
              <div><span className="text-muted-foreground">Trim:</span> {decoded.trim || '—'}</div>
              <div><span className="text-muted-foreground">Engine:</span> {decoded.engine || '—'}</div>
              <div><span className="text-muted-foreground">Drivetrain:</span> {decoded.drivetrain || '—'}</div>
              <div><span className="text-muted-foreground">Transmission:</span> {decoded.transmission || '—'}</div>
              <div><span className="text-muted-foreground">Fuel:</span> {decoded.fuelType || '—'}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {listings.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{listings.length} comps from Auto.dev</h2>
          <Badge variant="secondary">Source: Auto.dev only</Badge>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {listings.map((l) => (
          <Card key={l.id} className="overflow-hidden">
            {l.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={l.photoUrl}
                alt={l.heading}
                className="w-full h-48 object-cover bg-muted"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="w-full h-48 bg-muted flex items-center justify-center text-muted-foreground">
                <Car className="h-10 w-10" />
              </div>
            )}
            <CardContent className="p-4 space-y-2">
              <div className="font-semibold leading-tight">
                {l.year} {l.make} {l.model} {l.trim}
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold text-lg">{fmtUsd(l.price)}</span>
                <span className="text-muted-foreground">{fmtMiles(l.miles)} mi</span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {l.dealerName || 'Unknown dealer'}
                {l.dealerCity && `, ${l.dealerCity}`}
                {l.dealerState && `, ${l.dealerState}`}
              </div>
              <div className="text-xs font-mono text-muted-foreground">{l.vin}</div>
              {l.vdpUrl && (
                <a
                  href={l.vdpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  View listing <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && decoded && listings.length === 0 && !error && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No Auto.dev comps found for this vehicle in this radius.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
