"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Marker, Popup, NavigationControl, type MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Building2 } from 'lucide-react'
import { CLIENT_TYPE_LABELS, type Client, type ClientType } from '@/lib/supabase/clients'

// Single config object for pin color per client type. Henry: "make colors a
// single config object". Attorneys + insurance companies get neutral gray for
// now; adjust here to change palette.
const PIN_COLOR: Record<ClientType, string> = {
  tpa:               '#2563eb', // blue-600
  body_shop:         '#059669', // emerald-600
  attorney:          '#6b7280', // gray-500
  insurance_company: '#6b7280',
  referral:          '#8b5cf6', // violet-500
  other:             '#d97706', // amber-600
  // Legacy 'adjuster' kept for pre-migration rows; same color as tpa.
  adjuster:          '#2563eb',
}

// Las Vegas — default center per Henry.
const DEFAULT_VIEW = { longitude: -115.1391, latitude: 36.1699, zoom: 9 }

// Roughly centered on continental US so "Fit all" without pins still shows something sensible.
const US_VIEW = { longitude: -98.5, latitude: 39.8, zoom: 3.5 }

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

export function MapPane({
  clients,
  selectedId,
  onSelect,
}: {
  clients: Client[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const mapRef = useRef<MapRef | null>(null)
  const [popupId, setPopupId] = useState<string | null>(null)

  const pinned = useMemo(() => clients.filter(c => typeof c.lat === 'number' && typeof c.lng === 'number'), [clients])

  // Recenter map on the selected client when the list picks one.
  useEffect(() => {
    if (!selectedId || !mapRef.current) return
    const target = pinned.find(c => c.id === selectedId)
    if (target && target.lat && target.lng) {
      mapRef.current.flyTo({ center: [target.lng, target.lat], zoom: 12, duration: 800 })
      setPopupId(selectedId)
    }
  }, [selectedId, pinned])

  const fitAll = () => {
    if (!mapRef.current || pinned.length === 0) return
    const lngs = pinned.map(p => p.lng!)
    const lats = pinned.map(p => p.lat!)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 800, maxZoom: 12 })
  }

  const resetView = () => {
    if (!mapRef.current) return
    mapRef.current.flyTo({ center: [DEFAULT_VIEW.longitude, DEFAULT_VIEW.latitude], zoom: DEFAULT_VIEW.zoom, duration: 800 })
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center text-sm text-gray-500 p-6">
        Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the map. Client list still works without it.
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={pinned.length > 0 ? DEFAULT_VIEW : US_VIEW}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {pinned.map(c => (
          <Marker
            key={c.id}
            longitude={c.lng!}
            latitude={c.lat!}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setPopupId(c.id)
              onSelect(c.id)
            }}
          >
            <div
              className={`w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer transition-transform ${selectedId === c.id ? 'scale-125' : 'hover:scale-110'}`}
              style={{ backgroundColor: PIN_COLOR[c.type] }}
              title={c.name}
            >
              <Building2 className="w-3 h-3 text-white" />
            </div>
          </Marker>
        ))}
        {popupId && (() => {
          const p = pinned.find(c => c.id === popupId)
          if (!p) return null
          return (
            <Popup
              longitude={p.lng!}
              latitude={p.lat!}
              anchor="top"
              offset={12}
              onClose={() => setPopupId(null)}
              closeButton
              closeOnClick={false}
            >
              <div className="text-xs">
                <div className="font-bold text-gray-900 mb-0.5">{p.name}</div>
                <div className="text-gray-500 mb-1">{CLIENT_TYPE_LABELS[p.type]}</div>
                {p.addressLine && <div>{p.addressLine}</div>}
                {(p.city || p.state) && <div>{[p.city, p.state, p.zip].filter(Boolean).join(' ')}</div>}
                {p.phone && <div className="mt-1">{p.phone}</div>}
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Open →
                </button>
              </div>
            </Popup>
          )
        })()}
      </Map>

      <div className="absolute top-3 left-3 flex gap-2">
        <button
          type="button"
          onClick={fitAll}
          disabled={pinned.length === 0}
          className="text-xs font-semibold bg-white border border-gray-200 hover:border-gray-300 shadow-sm px-3 py-1.5 rounded-md disabled:opacity-40"
          title="Zoom to fit all pinned clients"
        >
          Fit all ({pinned.length})
        </button>
        <button
          type="button"
          onClick={resetView}
          className="text-xs font-semibold bg-white border border-gray-200 hover:border-gray-300 shadow-sm px-3 py-1.5 rounded-md"
          title="Recenter on Las Vegas"
        >
          Reset
        </button>
      </div>
      {clients.length > 0 && pinned.length < clients.length && (
        <div className="absolute bottom-3 left-3 text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded font-semibold">
          {clients.length - pinned.length} client{clients.length - pinned.length === 1 ? '' : 's'} not geocoded yet
        </div>
      )}
    </div>
  )
}
