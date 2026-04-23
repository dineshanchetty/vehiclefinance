import { useState } from 'react'
import { CheckCircle2, Edit3, AlertTriangle, Flag, X, Save } from 'lucide-react'
import type { ExtractionResult } from '../types/database'

interface Props {
  results: ExtractionResult[]
  onAccept?: (id: string) => void
  onOverride?: (id: string, value: string) => void
  onFlag?: (id: string, reason: string) => void
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 80 ? 'bg-green-500' :
    pct >= 60 ? 'bg-amber-400' :
    'bg-red-500'
  const textColor =
    pct >= 80 ? 'text-green-700' :
    pct >= 60 ? 'text-amber-700' :
    'text-red-700'

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-gray-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${textColor}`}>{pct}%</span>
    </div>
  )
}

const docLabel: Record<string, string> = {
  d1: 'SA ID Document',
  d2: 'Payslip (March)',
  d3: 'Proof of Address',
}

const statusConfig = {
  ACCEPTED:   { label: 'Accepted',   cls: 'bg-green-100 text-green-800' },
  OVERRIDDEN: { label: 'Overridden', cls: 'bg-blue-100 text-blue-800' },
  PENDING:    { label: 'Pending',    cls: 'bg-gray-100 text-gray-700' },
  FLAGGED:    { label: 'Flagged',    cls: 'bg-red-100 text-red-700' },
}

interface OverrideModal {
  id: string
  current: string | null
}

export function ExtractionConfidencePanel({ results = [], onAccept, onOverride, onFlag }: Props) {
  const [items, setItems] = useState(results)
  const [overrideModal, setOverrideModal] = useState<OverrideModal | null>(null)
  const [overrideValue, setOverrideValue] = useState('')
  const [flagModal, setFlagModal] = useState<string | null>(null)
  const [flagReason, setFlagReason] = useState('')

  const accept = (id: string) => {
    setItems((prev) => prev.map((r) => r.id === id ? { ...r, status: 'ACCEPTED' } : r))
    onAccept?.(id)
  }

  const saveOverride = () => {
    if (!overrideModal) return
    setItems((prev) => prev.map((r) =>
      r.id === overrideModal.id ? { ...r, status: 'OVERRIDDEN', override_value: overrideValue } : r
    ))
    onOverride?.(overrideModal.id, overrideValue)
    setOverrideModal(null)
    setOverrideValue('')
  }

  const saveFlag = () => {
    if (!flagModal) return
    setItems((prev) => prev.map((r) =>
      r.id === flagModal ? { ...r, status: 'FLAGGED', flag_reason: flagReason } : r
    ))
    onFlag?.(flagModal, flagReason)
    setFlagModal(null)
    setFlagReason('')
  }

  const lowConfidence = items.filter((r) => r.confidence < 0.60).length
  const pending = items.filter((r) => r.status === 'PENDING').length

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
          <span className="text-gray-500">Total fields:</span>
          <span className="font-semibold text-gray-900">{items.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-amber-700">{lowConfidence} low confidence</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
          <span className="text-blue-700">{pending} pending review</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Field</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Extracted Value</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Confidence</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source Doc</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Value</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((row) => {
              const isLow = row.confidence < 0.60
              const sc = statusConfig[row.status] ?? statusConfig.PENDING
              return (
                <tr key={row.id} className={isLow ? 'bg-red-50/50' : 'bg-white hover:bg-gray-50/50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.field_name}
                    {isLow && <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-red-500" />}
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                    {row.status === 'OVERRIDDEN'
                      ? <span className="text-blue-700">{row.override_value}</span>
                      : row.extracted_value ?? <span className="italic text-gray-400">not extracted</span>}
                  </td>
                  <td className="px-4 py-3"><ConfidenceBar value={row.confidence} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {docLabel[row.document_id] ?? row.document_id}
                    {row.source_page && <span className="ml-1 text-gray-400">p.{row.source_page}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 font-mono">
                    {row.customer_value ?? <span className="italic text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc.cls}`}>
                      {sc.label}
                    </span>
                    {row.flag_reason && (
                      <p className="mt-0.5 text-xs text-red-600">{row.flag_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {row.status !== 'ACCEPTED' && (
                        <button
                          onClick={() => accept(row.id)}
                          title="Accept"
                          className="rounded p-1 text-green-600 hover:bg-green-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => { setOverrideModal({ id: row.id, current: row.extracted_value }); setOverrideValue(row.override_value ?? row.extracted_value ?? '') }}
                        title="Override"
                        className="rounded p-1 text-blue-600 hover:bg-blue-50"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {row.status !== 'FLAGGED' && (
                        <button
                          onClick={() => { setFlagModal(row.id); setFlagReason(row.flag_reason ?? '') }}
                          title="Flag for review"
                          className="rounded p-1 text-amber-600 hover:bg-amber-50"
                        >
                          <Flag className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Override Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Override Value</h3>
              <button onClick={() => setOverrideModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Extracted: <span className="font-mono text-gray-700">{overrideModal.current ?? 'not extracted'}</span>
            </p>
            <input
              type="text"
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
              placeholder="Enter correct value…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOverrideModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={saveOverride} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <Save className="h-4 w-4" /> Save Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Modal */}
      {flagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Flag for Review</h3>
              <button onClick={() => setFlagModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Reason for flagging…"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFlagModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={saveFlag} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600">
                <Flag className="h-4 w-4" /> Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
