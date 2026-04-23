import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowUpCircle,
  X,
  Save,
  ZoomIn,
  ShieldAlert,
} from 'lucide-react'
import type { VehiclePhoto, VehicleQuickEvaluation, ConditionBand, DamageSeverity, PhotoQualityStatus } from '../types/database'

// The `damage_items` column is `Json` in the schema — shape below is what
// the vehicle-evaluation edge function emits.
interface DamageItem {
  description: string
  severity: DamageSeverity
  location: string | null
  estimated_repair_cost: number | null
}

interface Props {
  photos?: VehiclePhoto[]
  evaluation?: VehicleQuickEvaluation | null
  onApprove?: (photoId: string) => void
  onRequestReupload?: (photoId: string, reason: string) => void
  onEscalate?: (reason: string) => void
  onOverride?: (band: ConditionBand, notes: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Matches the `photo_angle` enum in baseline_schema.sql.
const ANGLE_LABELS: Record<string, string> = {
  FRONT_VIEW: 'Front', REAR_VIEW: 'Rear',
  LEFT_SIDE: 'Driver Side', RIGHT_SIDE: 'Passenger Side',
  FRONT_LEFT_ANGLE: 'Front Left', FRONT_RIGHT_ANGLE: 'Front Right',
  REAR_LEFT_ANGLE: 'Rear Left', REAR_RIGHT_ANGLE: 'Rear Right',
  ODOMETER: 'Odometer', INTERIOR_DASHBOARD: 'Dashboard', VIN_CHASSIS: 'VIN/Chassis',
  TYRE_FL: 'Tyre — Front Left', TYRE_FR: 'Tyre — Front Right',
  TYRE_RL: 'Tyre — Rear Left', TYRE_RR: 'Tyre — Rear Right',
  BOOT_INTERIOR: 'Boot Interior', DAMAGE_CLOSEUP: 'Damage Closeup',
  ENGINE_BAY: 'Engine Bay',
}

const bandConfig: Record<ConditionBand, { label: string; bg: string; border: string; text: string; dot: string }> = {
  EXCELLENT: { label: 'Excellent', bg: 'bg-green-50',  border: 'border-green-300', text: 'text-green-800',  dot: 'bg-green-500' },
  GOOD:      { label: 'Good',      bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  dot: 'bg-green-400' },
  FAIR:      { label: 'Fair',      bg: 'bg-amber-50',  border: 'border-amber-300', text: 'text-amber-800',  dot: 'bg-amber-500' },
  POOR:      { label: 'Poor',      bg: 'bg-red-50',    border: 'border-red-300',   text: 'text-red-800',    dot: 'bg-red-500' },
  SEVERE:    { label: 'Severe',    bg: 'bg-red-100',   border: 'border-red-400',   text: 'text-red-900',    dot: 'bg-red-600' },
}

// Matches damage_severity enum: NONE | MINOR | MODERATE | MAJOR | SEVERE.
const severityConfig: Record<DamageSeverity, { label: string; cls: string }> = {
  NONE:     { label: 'None',     cls: 'bg-gray-100 text-gray-700' },
  MINOR:    { label: 'Minor',    cls: 'bg-yellow-100 text-yellow-800' },
  MODERATE: { label: 'Moderate', cls: 'bg-orange-100 text-orange-800' },
  MAJOR:    { label: 'Major',    cls: 'bg-red-100 text-red-800' },
  SEVERE:   { label: 'Severe',   cls: 'bg-red-200 text-red-900' },
}

// photo_quality_status enum: ACCEPTED | ACCEPTED_WITH_WARNING | REJECTED.
// `ACCEPTED_WITH_WARNING` maps to the old "re-upload requested" UI slot.
const photoStatusConfig: Record<string, { label: string; cls: string }> = {
  ACCEPTED:              { label: 'Accepted',     cls: 'bg-green-100 text-green-800' },
  ACCEPTED_WITH_WARNING: { label: 'Warning',      cls: 'bg-amber-100 text-amber-800' },
  REJECTED:              { label: 'Rejected',     cls: 'bg-red-100 text-red-800' },
  PENDING:               { label: 'Pending',      cls: 'bg-gray-100 text-gray-700' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VehiclePhotoPanel({
  photos = [],
  evaluation = null,
  onApprove,
  onRequestReupload,
  onEscalate,
  onOverride,
}: Props) {
  const [items, setItems] = useState(photos)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [reuploadModal, setReuploadModal] = useState<string | null>(null)
  const [reuploadReason, setReuploadReason] = useState('')
  const [escalateModal, setEscalateModal] = useState(false)
  const [escalateReason, setEscalateReason] = useState('')
  const [overrideModal, setOverrideModal] = useState(false)
  const [overrideBand, setOverrideBand] = useState<ConditionBand>(evaluation?.condition_band ?? 'FAIR')
  const [overrideNotes, setOverrideNotes] = useState('')

  const approvePhoto = (id: string) => {
    // `quality_status` on vehicle_photos is the photo_quality_status enum.
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, quality_status: 'ACCEPTED' as PhotoQualityStatus } : p,
      ),
    )
    onApprove?.(id)
  }

  const requestReupload = () => {
    if (!reuploadModal) return
    setItems((prev) =>
      prev.map((p) =>
        p.id === reuploadModal
          ? { ...p, quality_status: 'REJECTED' as PhotoQualityStatus, rejection_reason: reuploadReason }
          : p,
      ),
    )
    onRequestReupload?.(reuploadModal, reuploadReason)
    setReuploadModal(null)
    setReuploadReason('')
  }

  const band = (evaluation?.condition_band ?? 'FAIR') as ConditionBand
  const bandCfg = bandConfig[band]
  const confidencePct = Math.round((evaluation?.overall_confidence ?? 0) * 100)
  // damage_items is stored as `Json` in the DB; cast to the UI shape.
  const damageItems: DamageItem[] = Array.isArray(evaluation?.damage_items)
    ? (evaluation!.damage_items as unknown as DamageItem[])
    : []

  return (
    <div className="space-y-6">
      {/* Advisory Banner */}
      <div className="flex items-start gap-3 rounded-lg bg-red-600 px-4 py-3 text-white">
        <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">ADVISORY ONLY</p>
          <p className="text-xs mt-0.5 text-red-100">
            Preliminary AI photo assessment. Does <strong>not</strong> replace a formal Hartcon inspection.
            Values and condition ratings are indicative estimates only and must not be used for final lending decisions.
          </p>
        </div>
      </div>

      {/* AI Quick Evaluation Card */}
      {evaluation && (
        <div className={`rounded-xl border p-5 ${bandCfg.bg} ${bandCfg.border}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">AI Quick Evaluation</h3>
            <span className="text-xs text-gray-400">
              {new Date(evaluation.created_at).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
            {/* Condition Band */}
            <div className={`rounded-lg border p-3 text-center ${bandCfg.bg} ${bandCfg.border}`}>
              <p className="text-xs text-gray-500 mb-1">Condition Band</p>
              <div className="flex items-center justify-center gap-2">
                <span className={`h-3 w-3 rounded-full ${bandCfg.dot}`} />
                <span className={`text-xl font-bold ${bandCfg.text}`}>{bandCfg.label}</span>
              </div>
            </div>

            {/* Confidence */}
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500 mb-2">AI Confidence</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${confidencePct >= 80 ? 'bg-green-500' : confidencePct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900">{confidencePct}%</span>
              </div>
            </div>

            {/* Recommendation — schema has no dedicated min/max columns. */}
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500 mb-1">Recommendation</p>
              <p className="text-sm font-medium text-gray-900">
                {evaluation.recommendation ?? '—'}
              </p>
            </div>
          </div>

          {/* Damage Items */}
          {damageItems.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Identified Damage</p>
              <div className="space-y-1.5">
                {damageItems.map((d, i) => {
                  const sc = severityConfig[d.severity]
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-white/60 border border-white px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc.cls}`}>{sc.label}</span>
                      <span className="text-sm text-gray-800">{d.description}</span>
                      {d.location && <span className="text-xs text-gray-400 ml-auto">{d.location}</span>}
                      {d.estimated_repair_cost && (
                        <span className="text-xs font-medium text-gray-600">~R {d.estimated_repair_cost.toLocaleString()}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Advisory / review notes */}
          {(evaluation.review_notes || evaluation.disclaimer) && (
            <div className="rounded-lg bg-white/60 border border-white px-3 py-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">Advisory Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {evaluation.review_notes ?? evaluation.disclaimer}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setEscalateModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <AlertTriangle className="h-4 w-4" /> Escalate
            </button>
            <button
              onClick={() => setOverrideModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              <RefreshCw className="h-4 w-4" /> Override Band
            </button>
          </div>
        </div>
      )}

      {/* Photo Grid */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Photo Set ({items.length} photos)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((photo) => {
            const statusKey = photo.quality_status ?? 'PENDING'
            const sc = photoStatusConfig[statusKey] ?? photoStatusConfig.PENDING
            const qualityPct = photo.quality_score ? Math.round(photo.quality_score * 100) : null
            const angleKey = photo.angle_type ?? 'OTHER'
            return (
              <div
                key={photo.id}
                className="group relative rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
              >
                {/* Photo */}
                <div
                  className="relative cursor-pointer bg-gray-100"
                  onClick={() => photo.file_url && setLightbox(photo.file_url)}
                >
                  {photo.file_url && (
                    <img
                      src={photo.file_url}
                      alt={ANGLE_LABELS[angleKey] ?? angleKey}
                      className="h-36 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                    <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {qualityPct !== null && (
                    <div className={`absolute bottom-2 right-2 rounded-full px-1.5 py-0.5 text-xs font-bold ${
                      qualityPct >= 80 ? 'bg-green-500 text-white' :
                      qualityPct >= 60 ? 'bg-amber-400 text-white' :
                      'bg-red-500 text-white'
                    }`}>
                      {qualityPct}%
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-gray-800">{ANGLE_LABELS[angleKey] ?? angleKey}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sc.cls}`}>
                    {sc.label}
                  </span>
                  {photo.rejection_reason && (
                    <p className="mt-1 text-xs text-red-600">{photo.rejection_reason}</p>
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex gap-1 border-t border-gray-100 px-3 py-2">
                  {photo.quality_status !== 'ACCEPTED' && (
                    <button
                      onClick={() => approvePhoto(photo.id)}
                      title="Approve"
                      className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> OK
                    </button>
                  )}
                  <button
                    onClick={() => { setReuploadModal(photo.id); setReuploadReason('') }}
                    title="Request re-upload"
                    className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" /> Re-upload
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute right-6 top-6 text-white/70 hover:text-white">
            <X className="h-7 w-7" />
          </button>
          <img src={lightbox} className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" alt="Full size" />
        </div>
      )}

      {/* Re-upload Modal */}
      {reuploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Request Re-upload</h3>
              <button onClick={() => setReuploadModal(null)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <textarea
              value={reuploadReason}
              onChange={(e) => setReuploadReason(e.target.value)}
              placeholder="Reason for re-upload request…"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReuploadModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={requestReupload} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600">
                <ArrowUpCircle className="h-4 w-4" /> Send Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {escalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Escalate Photo Review</h3>
              <button onClick={() => setEscalateModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <textarea
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder="Escalation reason…"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEscalateModal(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => { onEscalate?.(escalateReason); setEscalateModal(false) }}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                <AlertTriangle className="h-4 w-4" /> Escalate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Band Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Override Condition Band</h3>
              <button onClick={() => setOverrideModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="space-y-2 mb-4">
              {(['EXCELLENT','GOOD','FAIR','POOR','SEVERE'] as ConditionBand[]).map((b) => (
                <label key={b} className={`flex items-center gap-3 cursor-pointer rounded-lg border p-3 transition-colors ${overrideBand === b ? `${bandConfig[b].bg} ${bandConfig[b].border}` : 'border-gray-200'}`}>
                  <input type="radio" name="band" value={b} checked={overrideBand === b} onChange={() => setOverrideBand(b)} className="sr-only" />
                  <span className={`h-3 w-3 rounded-full ${bandConfig[b].dot}`} />
                  <span className={`text-sm font-medium ${overrideBand === b ? bandConfig[b].text : 'text-gray-700'}`}>{bandConfig[b].label}</span>
                </label>
              ))}
            </div>
            <textarea
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              placeholder="Reason for override (required)…"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOverrideModal(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                disabled={!overrideNotes.trim()}
                onClick={() => { onOverride?.(overrideBand, overrideNotes); setOverrideModal(false) }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Save Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
