"use client"

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  ArrowLeft,
  Loader2,
  Search,
  AlertCircle,
  Car,
  Save,
  Upload,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClaimInfo, ACVAdjustments, ACVResult } from '@/lib/acv/types'
import { parseClaimPDF } from '@/lib/parse-claim-pdf'
import { saveACVHistory } from '@/lib/supabase/history'
import { LogoutButton } from '@/components/logout-button'

interface LossListing {
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

interface LossHistoryEntry {
  id: string
  date: string
  mode: string
  vehicle: string
  vin: string
  maNumber: string
  acv: number
  claim: ClaimInfo
  comps: never[]
  adjustments: Record<string, unknown>
  result: Record<string, unknown>
  auctionListings: LossListing[]
}

const defaultClaim: ClaimInfo = {
  maNumber: '',
  claimNumber: '',
  dateOfLoss: '',
  clientType: 'Insured',
  clientName: '',
  insuredName: '',
  ownerPhone: '',
  ownerEmail: '',
  ownerAddress: '',
  insuranceCompany: '',
  adjuster: '',
  adjusterPhone: '',
  adjusterEmail: '',
  vin: '',
  year: 0,
  make: '',
  model: '',
  trim: '',
  engine: '',
  drivetrain: '',
  transmission: '',
  mileage: 0,
  zip: '',
  radius: 150,
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

async function saveToHistory(
  claim: ClaimInfo,
  listings: LossListing[],
  editId?: string | null,
) {
  const id = editId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const entry = {
    id,
    date: new Date().toISOString(),
    mode: 'auction',
    vehicle: `${claim.year} ${claim.make} ${claim.model}`,
    vin: claim.vin,
    maNumber: claim.maNumber,
    acv: 0,
    claim,
    comps: [],
    adjustments: {} as ACVAdjustments,
    result: {} as ACVResult,
    auctionListings: listings,
  }
  await saveACVHistory(entry, editId)
  return id
}

// ── Claim Info Form ───────────────────────────────────────────────────────────
function ClaimInfoForm({
  claim,
  onChange,
  nationwide,
  onNationwideChange,
}: {
  claim: ClaimInfo
  onChange: (updated: ClaimInfo) => void
  nationwide: boolean
  onNationwideChange: (value: boolean) => void
}) {
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfSuccess, setPdfSuccess] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof ClaimInfo, value: string | number) =>
    onChange({ ...claim, [field]: value })

  const handlePdfUpload = async (file: File) => {
    setPdfUploading(true)
    setPdfError(null)
    setPdfSuccess(false)
    try {
      const data = await parseClaimPDF(file)
      onChange({
        ...claim,
        maNumber: data.maNumber || claim.maNumber,
        claimNumber: data.claimNumber || claim.claimNumber,
        dateOfLoss: data.dateOfLoss || claim.dateOfLoss,
        clientType: data.clientType || claim.clientType,
        clientName: data.clientName || claim.clientName,
        insuredName: data.insuredName || claim.insuredName,
        ownerPhone: data.ownerPhone || claim.ownerPhone,
        ownerEmail: data.ownerEmail || claim.ownerEmail,
        ownerAddress: data.ownerAddress || claim.ownerAddress,
        insuranceCompany: data.insuranceCompany || claim.insuranceCompany,
        adjuster: data.adjuster || claim.adjuster,
        adjusterPhone: data.adjusterPhone || claim.adjusterPhone,
        adjusterEmail: data.adjusterEmail || claim.adjusterEmail,
        vin: data.vin || claim.vin,
        year: data.year || claim.year,
        make: data.make || claim.make,
        model: data.model || claim.model,
        mileage: data.mileage || claim.mileage,
        zip: data.zip || claim.zip,
      })
      setPdfSuccess(true)
      setTimeout(() => setPdfSuccess(false), 3000)
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF parse failed')
    } finally {
      setPdfUploading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  const decodeVin = async () => {
    if (claim.vin.length !== 17) {
      setDecodeError('VIN must be exactly 17 characters')
      return
    }
    setDecoding(true)
    setDecodeError(null)
    try {
      const res = await fetch(`/api/acv/decode-vin?vin=${claim.vin}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Decode failed')
      onChange({
        ...claim,
        year: data.year ?? claim.year,
        make: data.make ?? claim.make,
        model: data.model ?? claim.model,
        trim: data.trim ?? claim.trim,
      })
    } catch (err) {
      setDecodeError(err instanceof Error ? err.message : 'VIN decode failed')
    } finally {
      setDecoding(false)
    }
  }

  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="space-y-6">
      {/* PDF Upload */}
      <div className="flex items-center gap-3">
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handlePdfUpload(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`gap-2 border-dashed ${pdfSuccess ? 'border-emerald-500 text-emerald-600' : ''}`}
          disabled={pdfUploading}
          onClick={() => pdfInputRef.current?.click()}
        >
          {pdfUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : pdfSuccess ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {pdfUploading ? 'Parsing...' : pdfSuccess ? 'Filled!' : 'Upload Claim PDF'}
        </Button>
        <span className="text-xs text-gray-400">Auto-fill from a claim assignment PDF</span>
        {pdfError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {pdfError}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Report Info
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>MA Number</label>
            <input className={inputCls} placeholder="MA-12345" value={claim.maNumber} onChange={(e) => set('maNumber', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Insurance Claim #</label>
            <input className={inputCls} placeholder="CLM-00001" value={claim.claimNumber} onChange={(e) => set('claimNumber', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Date of Loss</label>
            <input type="date" className={inputCls} value={claim.dateOfLoss} onChange={(e) => set('dateOfLoss', e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Owner / Client
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Client Type</label>
            <select className={inputCls} value={claim.clientType} onChange={(e) => set('clientType', e.target.value as 'Insured' | 'Claimant')}>
              <option value="Insured">Insured</option>
              <option value="Claimant">Claimant</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Client Name</label>
            <input className={inputCls} placeholder="Sedgwick" value={claim.clientName} onChange={(e) => set('clientName', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Insured / Owner Name</label>
            <input className={inputCls} placeholder="John Smith" value={claim.insuredName} onChange={(e) => set('insuredName', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Owner Phone</label>
            <input className={inputCls} placeholder="(555) 000-0000" value={claim.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Owner Email</label>
            <input className={inputCls} placeholder="owner@email.com" value={claim.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Owner Address</label>
            <input className={inputCls} placeholder="123 Main St, City, ST 00000" value={claim.ownerAddress} onChange={(e) => set('ownerAddress', e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Insurance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Insurance Company</label>
            <input className={inputCls} placeholder="State Farm" value={claim.insuranceCompany} onChange={(e) => set('insuranceCompany', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Name</label>
            <input className={inputCls} placeholder="Jane Doe" value={claim.adjuster} onChange={(e) => set('adjuster', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Phone</label>
            <input className={inputCls} placeholder="(555) 000-0000" value={claim.adjusterPhone} onChange={(e) => set('adjusterPhone', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Adjuster Email</label>
            <input className={inputCls} placeholder="adjuster@insurer.com" value={claim.adjusterEmail} onChange={(e) => set('adjusterEmail', e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Vehicle
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>VIN</label>
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1 font-mono uppercase`}
                placeholder="17-character VIN"
                maxLength={17}
                value={claim.vin}
                onChange={(e) => set('vin', e.target.value.toUpperCase())}
              />
              <Button
                onClick={decodeVin}
                disabled={decoding || claim.vin.length !== 17}
                className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white"
                size="sm"
              >
                {decoding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Decode'}
              </Button>
            </div>
            {decodeError && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {decodeError}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <input type="number" className={inputCls} placeholder="2020" value={claim.year || ''} onChange={(e) => set('year', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className={labelCls}>Make</label>
            <input className={inputCls} placeholder="Toyota" value={claim.make} onChange={(e) => set('make', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <input className={inputCls} placeholder="Camry" value={claim.model} onChange={(e) => set('model', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Trim</label>
            <input className={inputCls} placeholder="XLE" value={claim.trim} onChange={(e) => set('trim', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Mileage</label>
            <input type="number" className={inputCls} placeholder="45000" value={claim.mileage || ''} onChange={(e) => set('mileage', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className={labelCls}>Search Radius</label>
            <select
              className={inputCls}
              value={nationwide ? 'nationwide' : String(claim.radius || 150)}
              onChange={(e) => {
                if (e.target.value === 'nationwide') {
                  onNationwideChange(true)
                } else {
                  onNationwideChange(false)
                  set('radius', parseInt(e.target.value))
                }
              }}
            >
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="100">100 miles</option>
              <option value="200">200 miles</option>
              <option value="300">300 miles</option>
              <option value="500">500 miles</option>
              <option value="nationwide">Nationwide</option>
            </select>
          </div>
          {!nationwide && (
            <div>
              <label className={labelCls}>ZIP Code</label>
              <input className={inputCls} placeholder="90210" maxLength={5} value={claim.zip} onChange={(e) => set('zip', e.target.value)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Loss Listing Card ─────────────────────────────────────────────────────────
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
      <a href={listing.vdpUrl} target="_blank" rel="noopener noreferrer">
        {card}
      </a>
    )
  }
  return card
}

// ── Main Inner ────────────────────────────────────────────────────────────────
function LossSearchInner() {
  const searchParams = useSearchParams()
  const isEdit = searchParams.get('edit') === 'true'

  const [claim, setClaim] = useState<ClaimInfo>({ ...defaultClaim })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [listings, setListings] = useState<LossListing[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [saved, setSaved] = useState(false)
  const [nationwide, setNationwide] = useState(false)

  // Load edit data
  useEffect(() => {
    if (!isEdit) return
    try {
      const raw = sessionStorage.getItem('modern-tools-acv-edit')
      if (!raw) return
      const entry = JSON.parse(raw)
      sessionStorage.removeItem('modern-tools-acv-edit')
      if (entry.claim) setClaim(entry.claim)
      if (entry.id) setEditingId(entry.id)
      if (entry.auctionListings && entry.auctionListings.length > 0) {
        setListings(entry.auctionListings)
        setHasSearched(true)
      }
    } catch { /* ignore */ }
  }, [isEdit])

  const canSearch = claim.year > 0 && claim.make && claim.model && (nationwide || claim.zip)

  const handleSearch = async () => {
    if (!canSearch) return
    setSearching(true)
    setSearchError(null)
    setHasSearched(false)
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
      setListings(data.listings ?? [])
      setHasSearched(true)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSave = async () => {
    const savedId = await saveToHistory(claim, listings, editingId)
    if (!editingId) setEditingId(savedId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
          <Link href="/"><Image src="/logo.png" alt="Modern Appraisers" width={160} height={48} className="h-9 w-auto" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/estimate-dispute" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Estimate Dispute</Link>
            <Link href="/acv" className="text-sm font-medium text-white">ACV</Link>
            <Link href="/rules-laws" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Rules / Laws</Link>
            <Link href="/negotiations" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Negotiations</Link>
          </nav>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/acv" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"><ArrowLeft className="w-4 h-4" />ACV Claims</Link>
          <h1 className="text-2xl font-bold text-gray-900">Loss Search</h1>
        </div>
        {/* Claim Info */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <ClaimInfoForm claim={claim} onChange={setClaim} nationwide={nationwide} onNationwideChange={setNationwide} />
        </div>

        {/* Search Button */}
        <div className="flex items-center gap-3">
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

          {hasSearched && (
            <Button
              onClick={handleSave}
              variant="outline"
              className="gap-2 border-gray-200"
            >
              <Save className="w-4 h-4" />
              {saved ? 'Saved!' : 'Save Claim'}
            </Button>
          )}

          {!canSearch && (
            <p className="text-xs text-gray-400">Fill in Year, Make, Model{nationwide ? '' : ', and ZIP'} to search</p>
          )}
        </div>

        {searchError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {searchError}
          </div>
        )}

        {/* Results */}
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
      </main>
    </div>
  )
}

export default function LossSearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <LossSearchInner />
    </Suspense>
  )
}
