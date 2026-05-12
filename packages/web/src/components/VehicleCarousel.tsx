import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, X, Image as ImageIcon } from 'lucide-react'
import type { VehiclePhoto } from '../types/database'

/**
 * VehicleCarousel — hotspot/360 viewer for the seller's vehicle photos.
 *
 *   ┌──────────────────────────────┐
 *   │                              │  ← big image (current angle)
 *   │      ◀         ▶             │  ← prev/next exterior orbit
 *   │                              │
 *   │      [ top-down car icon ]   │  ← 4 dots: front/right/rear/left,
 *   │                              │     current angle highlighted
 *   └──────────────────────────────┘
 *   [interior front] [interior rear] [engine] [boot] [odometer]
 *      ↑ tap any to swap into the main view
 *
 * The 4 exterior angles form an orbit; left/right arrows + keyboard
 * navigate them. Detail shots sit as thumbnails below — clicking one
 * promotes it to the main view; the back-to-orbit button returns.
 *
 * Photos prop comes from `vehicle_photos` joined through `vehicle_photo_sets`.
 */

const ENUM_TO_KEY: Record<string, string> = {
  FRONT_VIEW: 'front',
  REAR_VIEW: 'rear',
  RIGHT_SIDE: 'driver_side',     // SA right-hand drive
  LEFT_SIDE: 'passenger_side',
  INTERIOR_DASHBOARD: 'interior_front',
  REAR_LEFT_ANGLE: 'interior_rear',   // bot repurposes this slot — see _shared/supabase-helpers.ts
  BOOT_INTERIOR: 'boot',
  ENGINE_BAY: 'engine_bay',
  ODOMETER: 'odometer',
}

const KEY_LABEL: Record<string, string> = {
  front: 'Front',
  rear: 'Rear',
  driver_side: 'Driver side',
  passenger_side: 'Passenger side',
  interior_front: 'Dashboard',
  interior_rear: 'Rear interior',
  engine_bay: 'Engine bay',
  boot: 'Boot',
  odometer: 'Odometer',
}

// Clockwise orbit, viewed from above. Index 0 = front of car.
const ORBIT: Array<'front' | 'driver_side' | 'rear' | 'passenger_side'> = [
  'front', 'driver_side', 'rear', 'passenger_side',
]

const DETAIL_ANGLES = ['interior_front', 'interior_rear', 'engine_bay', 'boot', 'odometer'] as const

interface Photo {
  id: string
  key: string                  // angle bucket
  url: string
  label: string                // human label e.g. "Driver side"
  upload_timestamp: string | null
}

export function VehicleCarousel({ photos }: { photos: VehiclePhoto[] }) {
  // Build a flat list of ALL photos + group by angle (preserve duplicates).
  // The user wanted full visibility — multiple photos per angle are common
  // and we shouldn't hide them.
  const { allPhotos, byKey } = useMemo(() => {
    const sorted = [...photos].sort((a, b) =>
      (a.upload_timestamp ?? '') < (b.upload_timestamp ?? '') ? -1 : 1, // chronological
    )
    const flat: Photo[] = []
    const grouped: Record<string, Photo[]> = {}
    for (const p of sorted) {
      const key = ENUM_TO_KEY[p.angle_type ?? ''] ?? 'other'
      if (!p.file_url) continue
      const item: Photo = {
        id: p.id,
        key,
        url: p.file_url,
        label: KEY_LABEL[key] ?? key,
        upload_timestamp: p.upload_timestamp ?? null,
      }
      flat.push(item)
      ;(grouped[key] ??= []).push(item)
    }
    return { allPhotos: flat, byKey: grouped }
  }, [photos])

  const exteriorAvailable = ORBIT.filter((a) => (byKey[a]?.length ?? 0) > 0)

  // Active selection: which photo (by id) is currently in the main view.
  const [activeId, setActiveId] = useState<string | null>(allPhotos[0]?.id ?? null)
  const active = activeId ? allPhotos.find((p) => p.id === activeId) ?? null : null
  const [lightbox, setLightbox] = useState(false)

  // Auto-pick first photo as it arrives.
  useEffect(() => {
    if (!activeId && allPhotos[0]) setActiveId(allPhotos[0].id)
  }, [activeId, allPhotos])

  // Treat the active photo's "key" as the active angle for the compass.
  const activeKey = active?.key ?? null

  // Spin = move to the first photo of the next exterior angle.
  // If multiple photos exist at the next angle, ops can step through them
  // via the Prev/Next within-angle buttons (added below).
  const onOrbit = useCallback((dir: -1 | 1) => {
    if (exteriorAvailable.length === 0) return
    const currentExteriorIdx = activeKey
      ? exteriorAvailable.indexOf(activeKey as typeof ORBIT[number])
      : -1
    const safe = currentExteriorIdx < 0 ? 0 : currentExteriorIdx
    const next = (safe + dir + exteriorAvailable.length) % exteriorAvailable.length
    const targetKey = exteriorAvailable[next]
    const first = byKey[targetKey]?.[0]
    if (first) setActiveId(first.id)
  }, [exteriorAvailable, activeKey, byKey])

  // Step within the same angle (when there are duplicates).
  const onWithinAngle = useCallback((dir: -1 | 1) => {
    if (!active) return
    const list = byKey[active.key] ?? []
    if (list.length <= 1) return
    const i = list.findIndex((p) => p.id === active.id)
    const next = (i + dir + list.length) % list.length
    setActiveId(list[next].id)
  }, [active, byKey])

  const activeAngleList = active ? (byKey[active.key] ?? []) : []
  const activeAngleIdx = active ? activeAngleList.findIndex((p) => p.id === active.id) : -1

  // Keyboard nav: ←/→ orbit between angles, Shift+←/→ step within same angle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightbox && e.key === 'Escape') { setLightbox(false); return }
      if (e.key === 'ArrowLeft')  e.shiftKey ? onWithinAngle(-1) : onOrbit(-1)
      if (e.key === 'ArrowRight') e.shiftKey ? onWithinAngle(1)  : onOrbit(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOrbit, onWithinAngle, lightbox])

  if (allPhotos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <ImageIcon className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="text-sm font-medium text-gray-700">No vehicle photos yet</p>
        <p className="mt-1 text-xs text-gray-500">
          The seller hasn't uploaded photos. Once they send them on WhatsApp, the spin view appears here.
        </p>
      </div>
    )
  }

  const isExterior = activeKey ? ORBIT.includes(activeKey as typeof ORBIT[number]) : false
  const orbitIndex = isExterior && activeKey ? exteriorAvailable.indexOf(activeKey as typeof ORBIT[number]) : -1

  return (
    <div className="space-y-4">
      {/* Main viewport */}
      <div className="relative rounded-xl border border-gray-200 bg-gradient-to-br from-slate-100 to-white overflow-hidden aspect-[16/10] flex items-center justify-center group">
        {active ? (
          <>
            <img
              key={active.url}
              src={active.url}
              alt={active.label}
              className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300 animate-fade-in"
              loading="eager"
            />

            {/* Top-left: angle label + within-angle position + orbit pos */}
            <div className="absolute top-3 left-3 z-10 rounded-full bg-black/70 backdrop-blur px-3 py-1 text-xs font-semibold text-white flex items-center gap-2">
              <span>{active.label}</span>
              {activeAngleList.length > 1 && (
                <span className="text-white/70 text-[10px] font-mono">
                  {activeAngleIdx + 1}/{activeAngleList.length}
                </span>
              )}
              {isExterior && exteriorAvailable.length > 1 && activeAngleList.length === 1 && (
                <span className="text-white/70 text-[10px]">·  {orbitIndex + 1}/{exteriorAvailable.length}</span>
              )}
            </div>

            {/* Within-angle prev/next — only when there are duplicates of this angle */}
            {activeAngleList.length > 1 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-1 py-1">
                <button
                  type="button"
                  onClick={() => onWithinAngle(-1)}
                  className="rounded-full hover:bg-white/10 p-1 text-white"
                  title="Previous photo at this angle (Shift+←)"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="text-[10px] text-white/80 px-1">photo</span>
                <button
                  type="button"
                  onClick={() => onWithinAngle(1)}
                  className="rounded-full hover:bg-white/10 p-1 text-white"
                  title="Next photo at this angle (Shift+→)"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Top-right: lightbox button */}
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="absolute top-3 right-3 z-10 rounded-full bg-black/70 hover:bg-black/85 backdrop-blur p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              title="Expand"
            >
              <Maximize2 className="h-4 w-4" />
            </button>

            {/* Orbit prev/next arrows — only if on exterior */}
            {isExterior && exteriorAvailable.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => onOrbit(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/95 hover:bg-white shadow p-2 transition-transform hover:-translate-x-0.5"
                  title="Rotate left"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-800" />
                </button>
                <button
                  type="button"
                  onClick={() => onOrbit(1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/95 hover:bg-white shadow p-2 transition-transform hover:translate-x-0.5"
                  title="Rotate right"
                >
                  <ChevronRight className="h-5 w-5 text-gray-800" />
                </button>
              </>
            )}

            {/* Top-down car compass — only on exterior */}
            {isExterior && (
              <CarCompass
                activeKey={activeKey as typeof ORBIT[number] | null}
                available={exteriorAvailable}
                onSelect={(k) => { const first = byKey[k]?.[0]; if (first) setActiveId(first.id) }}
              />
            )}

            {/* "Back to spin" if on a detail angle */}
            {!isExterior && exteriorAvailable.length > 0 && (
              <button
                type="button"
                onClick={() => { const first = byKey[exteriorAvailable[0]]?.[0]; if (first) setActiveId(first.id) }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/95 hover:bg-white shadow px-3 py-1.5 text-xs font-medium text-gray-800"
              >
                ← Back to spin view
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">Pick an angle below to view.</p>
        )}
      </div>

      {/* Coverage summary — soft, just a count per angle */}
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-gray-500">
          {allPhotos.length} photos
        </span>
        <span className="text-gray-300">·</span>
        {[...ORBIT, ...DETAIL_ANGLES].map((k) => {
          const count = byKey[k]?.length ?? 0
          const isActive = activeKey === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => count > 0 && setActiveId(byKey[k][0].id)}
              disabled={count === 0}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                count === 0
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed line-through'
                  : isActive
                  ? 'bg-wesbank-navy text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {KEY_LABEL[k]} {count > 1 && <span className="opacity-70">×{count}</span>}
            </button>
          )
        })}
      </div>

      {/* All photos — full visibility, including duplicates */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          All photos ({allPhotos.length})
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
          {allPhotos.map((p) => {
            const isActive = activeId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveId(p.id)}
                className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                  isActive ? 'border-wesbank-navy shadow-md ring-2 ring-wesbank-navy/20' : 'border-gray-200 hover:border-wesbank-navy/30'
                }`}
                title={`${p.label}${p.upload_timestamp ? ` · ${new Date(p.upload_timestamp).toLocaleTimeString()}` : ''}`}
              >
                <img src={p.url} alt={p.label} className="h-full w-full object-cover" />
                <div className={`absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8px] font-semibold leading-none truncate ${
                  isActive ? 'bg-wesbank-navy text-white' : 'bg-black/60 text-white'
                }`}>
                  {p.label}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute top-6 right-6 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={active.url}
            alt={active.label}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {isExterior && exteriorAvailable.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOrbit(-1) }}
                className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOrbit(1) }}
                className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-3 text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Top-down car silhouette with 4 selectable hotspots: front/right/rear/left.
 * Sits as a small overlay in the bottom-right of the main viewport so it's
 * visible without dominating the photo.
 */
function CarCompass({
  activeKey,
  available,
  onSelect,
}: {
  activeKey: typeof ORBIT[number] | null
  available: typeof ORBIT[number][]
  onSelect: (k: typeof ORBIT[number]) => void
}) {
  // Hotspot positions on a 64×96 SVG viewport (top-down car shape).
  const dots: Array<{ key: typeof ORBIT[number]; cx: number; cy: number; label: string }> = [
    { key: 'front',           cx: 32, cy: 8,  label: 'F' },
    { key: 'driver_side',     cx: 56, cy: 48, label: 'R' },  // right side
    { key: 'rear',            cx: 32, cy: 88, label: 'B' },
    { key: 'passenger_side',  cx: 8,  cy: 48, label: 'L' },  // left side
  ]
  return (
    <div className="absolute bottom-3 right-3 z-10 rounded-xl bg-white/90 backdrop-blur shadow-lg p-2 border border-gray-200">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mb-1 text-center">
        Spin
      </p>
      <svg viewBox="0 0 64 96" width="56" height="80" className="block">
        {/* Car silhouette — simple capsule shape */}
        <rect x="14" y="6" width="36" height="84" rx="14" ry="14"
          fill="#e0e7ff" stroke="#a5b4fc" strokeWidth="1" />
        {/* Windscreen + rear window hint */}
        <rect x="18" y="22" width="28" height="18" rx="4" ry="4" fill="#c7d2fe" opacity="0.8" />
        <rect x="18" y="56" width="28" height="18" rx="4" ry="4" fill="#c7d2fe" opacity="0.6" />
        {/* Hotspots */}
        {dots.map((d) => {
          const isActive = activeKey === d.key
          const has = available.includes(d.key)
          return (
            <g key={d.key}
              onClick={() => has && onSelect(d.key)}
              style={{ cursor: has ? 'pointer' : 'not-allowed', opacity: has ? 1 : 0.3 }}>
              <circle cx={d.cx} cy={d.cy} r={isActive ? 7 : 5}
                fill={isActive ? '#4f46e5' : has ? '#6366f1' : '#9ca3af'}
                stroke="#fff" strokeWidth="1.5"
                style={{ transition: 'r 150ms ease' }} />
              <text x={d.cx} y={d.cy + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize="6" fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}>
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
