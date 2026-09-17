"use client"

import { useState } from 'react'
import { Loader2, Search, AlertCircle, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClaimInfo } from '@/lib/acv/types'
import { safeHref } from '@/lib/safe-href'

export interface LossListing {
  id: string
  vin: string
  price: number
  miles: number
  year: number
  make: string
  model: string
  trim: string
  heading: string
  vdpUrl: string
  source: string
  exteriorColor: string
  bodyType: string
  transmission: string
  drivetrain: string
  engine: string
  dealerName: string
  dealerCity: string
  dealerState: string
  dealerPhone: string
  photoUrl: string
  photoCount: number
  dom: number
  dist: number
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function LossCard({ listing }: { listing: LossListing }) {
  const card = (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden hover:border-blue-400 hover:shadow-md transition-all cursor-pointer">
      {listing.photoUrl ? (
        <div className="relative h-44 bg-gray-100">
          <img
            src={listing.photoUrl}
            alt={listing.heading}
            className="w-full h-full object-cover"
          />
          {listing.photoCount > 1 && (
            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
              {listing.photoCount} photos
            </span>
          )}
        </div>
      ) : (
        <div className="h-44 bg-gray-100 flex items-center justify-center">
          <Car className="w-10 h-10 text-gray-300" />
        </div>
      )}
      <div className="p-4 space-y-2">
        <h4 className="font-semibold text-sm text-gray-900 line-clamp-1">
          {listing.heading || `${listing.year} ${listing.make} ${listing.model} ${listing.trim}`}
        </h4>
        <div className="flex items-center justify-between text-sm">
          <span className="text-lg font-bold text-blue-600">
            {formatCurrency(listing.price)}
          </span>
          <span className="text-gray-500">
            {listing.miles ? `${listing.miles.toLocaleString()} mi` : '—'}
          </span>
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          {listing.vin && (
            <p className="font-mono text-[11px]">{listing.vin}</p>
          )}
          {listing.engine && (
            <p>{[listing.engine, listing.transmission, listing.drivetrain].filter(Boolean).join(' · ')}</p>
          )}
          {listing.exteriorColor && (
            <p>{listing.exteriorColor}</p>
          )}
          {(listing.dealerCity || listing.dealerState) && (
            <p>{[listing.dealerName, listing.dealerCity, listing.dealerState].filter(Boolean).join(', ')}</p>
          )}
          {listing.dist > 0 && (
            <p>{Math.round(listing.dist)} miles away</p>
          )}
        </div>
      </div>
    </div>
  )

  if (listing.vdpUrl) {
    return (
      <a href={safeHref(listing.vdpUrl)} target="_blank" rel="noopener noreferrer">
        {card}
      </a>
    )
  }
  return card
}

// Loss Search inside the claim workspace: the vehicle/ZIP come from the claim's
// Claim Info tab, and found listings persist on the claim row via the
// workspace auto-save (onListingsChange).
export function LossSearchTab({
  claim,
  listings,
  onListingsChange,
}: {
  claim: ClaimInfo
  listings: LossListing[]
  onListingsChange: (listings: LossListing[]) => void
}) {
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(listings.length > 0)
  const [nationwide, setNationwide] = useState(claim.radius === 0)

  const canSearch = claim.year > 0 && claim.make && claim.model && (nationwide || claim.zip)

  const handleSearch = async () => {
    if (!canSearch) return
    setSearching(true)
    setSearchError(null)
    try {
      const params = new URLSearchParams({
        year: String(claim.year),
        make: claim.make,
        model: claim.model,
        ...(nationwide
          ? { nationwide: 'true' }
          : { zip: claim.zip, radius: String(claim.radius || 150) }),
        ...(claim.trim ? { trim: claim.trim } : {}),
      })
      const res = await fetch(`/api/acv/search-auction?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      onListingsChange(data.listings ?? [])
      setHasSearched(true)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={handleSearch}
          disabled={!canSearch || searching}
          className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
        >
          {searching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {searching ? 'Searching...' : 'Search Comps with Accidents'}
        </Button>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={nationwide}
            onChange={(e) => setNationwide(e.target.checked)}
            className="rounded border-gray-300"
          />
          Nationwide
        </label>
        {!canSearch && (
          <p className="text-xs text-gray-400">
            Fill in Year, Make, Model{nationwide ? '' : ', and ZIP'} on the Claim Info tab to search
          </p>
        )}
      </div>

      {searchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {searchError}
        </div>
      )}

      {hasSearched && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            Comparables with Accident History
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {listings.length} vehicle{listings.length !== 1 ? 's' : ''} found with prior accidents
          </p>

          {listings.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">
              No vehicles with accident history found for this search.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {listings.map((listing) => (
                <LossCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
