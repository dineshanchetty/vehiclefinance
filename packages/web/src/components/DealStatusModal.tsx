import { useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { supabase } from '../lib/supabase'
import type { DealStatus } from '../types/database'

const STATUS_GROUPS: { heading: string; statuses: DealStatus[] }[] = [
  { heading: 'Application',  statuses: ['APPLICATION_INITIATED','CONSENT_PENDING','CONSENT_GRANTED'] },
  { heading: 'Buyer docs',   statuses: ['BUYER_DOCS_PENDING','EXTRACTION_IN_PROGRESS','BUYER_DOCS_EXTRACTED','BUYER_CONFIRMATION_PENDING','BUYER_CONFIRMED'] },
  { heading: 'Seller flow',  statuses: ['SELLER_INVITED','SELLER_CONSENT_PENDING','SELLER_CONSENT_GRANTED','SELLER_DOCS_PENDING','SELLER_EXTRACTION_IN_PROGRESS','SELLER_DOCS_EXTRACTED'] },
  { heading: 'Vehicle',      statuses: ['VEHICLE_PHOTOS_PENDING','VEHICLE_PHOTOS_PARTIAL','VEHICLE_PHOTOS_COMPLETE','QUICK_EVAL_IN_PROGRESS','QUICK_EVAL_COMPLETE'] },
  { heading: 'Decision',     statuses: ['FNI_REVIEW_PENDING','QUOTE_PREPARATION','QUOTE_SENT','QUOTE_ACCEPTED','QUOTE_DECLINED','QUOTE_EXPIRED'] },
  { heading: 'Inspection',   statuses: ['INSPECTION_SCHEDULED','INSPECTION_COMPLETE'] },
  { heading: 'Contracts',    statuses: ['SELLER_CONTRACT_PENDING','SELLER_CONTRACT_SENT','SELLER_CONTRACT_SIGNED','BUYER_CONTRACT_PENDING','BUYER_CONTRACT_SENT','BUYER_CONTRACT_SIGNED'] },
  { heading: 'Approval',     statuses: ['DEAL_PENDING_APPROVAL','DEAL_APPROVED','DEAL_DECLINED'] },
  { heading: 'NATIS',        statuses: ['NATIS_COLLECTION_PENDING','NATIS_COLLECTED','NATIS_TRANSFER_IN_PROGRESS','NATIS_COMPLETE'] },
  { heading: 'Terminal',     statuses: ['DEAL_FULFILLED','DEAL_CANCELLED','DEAL_ON_HOLD'] },
]

export function DealStatusModal({
  dealId, current, onClose, onChanged,
}: {
  dealId: string
  current: DealStatus
  onClose: () => void
  onChanged: (next: DealStatus) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  async function setStatus(next: DealStatus) {
    if (next === current) { onClose(); return }
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase
        .from('deals')
        .update({ status: next, updated_at: new Date().toISOString() } as never)
        .eq('id', dealId)
      if (error) throw error
      // Audit
      await supabase.from('audit_events').insert({
        deal_id: dealId,
        event_type: 'ops_status_changed',
        actor_type: 'ops_user',
        details: { from: current, to: next },
      } as never)
      onChanged(next)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update status')
    } finally { setBusy(false) }
  }

  const matches = (s: string) => s.toLowerCase().includes(filter.toLowerCase())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Update deal status</h3>
            <p className="text-xs text-gray-500 mt-0.5">Click a status to update the legacy <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded">deal_status</code> enum.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 pt-3 pb-2 border-b border-gray-100">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {err && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {STATUS_GROUPS.map((g) => {
            const list = g.statuses.filter(matches)
            if (list.length === 0) return null
            return (
              <div key={g.heading}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{g.heading}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((s) => {
                    const isCurrent = s === current
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        disabled={busy || isCurrent}
                        className={`group flex items-center gap-1 rounded-lg px-2 py-1 transition-colors ${
                          isCurrent
                            ? 'ring-2 ring-indigo-500 ring-offset-1 cursor-default'
                            : 'hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <StatusBadge status={s} variant="sm" />
                        {isCurrent && <span className="text-[10px] text-indigo-600 font-medium">current</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 rounded-b-xl">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
