import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Search, ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AuditEvent, ActorType } from '../types/database'

const EVENT_TYPES = [
  'DEAL_CREATED', 'DEAL_STATUS_CHANGED', 'DEAL_ASSIGNED',
  'DOCUMENT_UPLOADED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED',
  'EXTRACTION_ACCEPTED', 'EXTRACTION_OVERRIDDEN', 'EXTRACTION_FLAGGED',
  'PHOTO_SET_UPLOADED', 'PHOTO_APPROVED', 'PHOTO_REJECTED',
  'AI_EVAL_COMPLETE', 'AI_EVAL_OVERRIDDEN',
  'QUOTE_CREATED', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_DECLINED',
  'INSPECTION_SCHEDULED', 'INSPECTION_COMPLETE',
  'CONTRACT_SENT', 'CONTRACT_SIGNED', 'CONTRACT_DECLINED',
  'NATIS_SUBMITTED', 'NATIS_COMPLETE',
  'TASK_CREATED', 'TASK_CLAIMED', 'TASK_COMPLETED', 'TASK_ESCALATED',
  'HUMAN_OVERRIDE', 'SYSTEM_ERROR',
]

const ACTOR_TYPES: ActorType[] = ['SYSTEM', 'AGENT', 'BUYER', 'SELLER', 'ADMIN']

const MOCK_EVENTS: AuditEvent[] = [
  { id: 'a01', deal_id: 'VF-2024-001', event_type: 'DEAL_CREATED',        actor_id: 'system',  actor_type: 'SYSTEM', actor_name: 'WhatsApp Bot',   details: { trigger: 'buyer_opt_in', phone: '+27823456789' },                          created_at: new Date(Date.now() - 86_400_000 * 4).toISOString() },
  { id: 'a02', deal_id: 'VF-2024-001', event_type: 'DOCUMENT_UPLOADED',   actor_id: 'b1',      actor_type: 'BUYER',  actor_name: 'Sipho Dlamini',   details: { document_type: 'ID_DOCUMENT', file_name: 'id_document.pdf' },               created_at: new Date(Date.now() - 86_400_000 * 3.5).toISOString() },
  { id: 'a03', deal_id: 'VF-2024-001', event_type: 'DOCUMENT_APPROVED',   actor_id: 'agent1',  actor_type: 'AGENT',  actor_name: 'Thabo Mokoena',   details: { document_id: 'd1', document_type: 'ID_DOCUMENT' },                         created_at: new Date(Date.now() - 86_400_000 * 3).toISOString() },
  { id: 'a04', deal_id: 'VF-2024-002', event_type: 'DEAL_CREATED',        actor_id: 'system',  actor_type: 'SYSTEM', actor_name: 'WhatsApp Bot',   details: { trigger: 'buyer_opt_in', phone: '+27734567890' },                          created_at: new Date(Date.now() - 86_400_000 * 3).toISOString() },
  { id: 'a05', deal_id: 'VF-2024-001', event_type: 'PHOTO_SET_UPLOADED',  actor_id: 's1',      actor_type: 'SELLER', actor_name: 'Johan van der Merwe', details: { photo_count: 8, set_id: 'ps1' },                                       created_at: new Date(Date.now() - 86_400_000 * 2.5).toISOString() },
  { id: 'a06', deal_id: 'VF-2024-001', event_type: 'AI_EVAL_COMPLETE',    actor_id: 'system',  actor_type: 'SYSTEM', actor_name: 'AI Engine',       details: { condition_band: 'FAIR', confidence: 0.73, damage_count: 4 },               created_at: new Date(Date.now() - 86_400_000 * 2).toISOString() },
  { id: 'a07', deal_id: 'VF-2024-002', event_type: 'TASK_ESCALATED',      actor_id: 'agent2',  actor_type: 'AGENT',  actor_name: 'Mpho Sithole',    details: { task_id: 't7', reason: 'Credit score below threshold — manual review' },   created_at: new Date(Date.now() - 86_400_000 * 1.8).toISOString() },
  { id: 'a08', deal_id: 'VF-2024-001', event_type: 'QUOTE_SENT',          actor_id: 'agent1',  actor_type: 'AGENT',  actor_name: 'Thabo Mokoena',   details: { quote_id: 'q1', loan_amount: 168000, term_months: 72, rate: 11.25 },        created_at: new Date(Date.now() - 86_400_000 * 1).toISOString() },
  { id: 'a09', deal_id: 'VF-2024-003', event_type: 'CONTRACT_SIGNED',     actor_id: 's3',      actor_type: 'SELLER', actor_name: 'Thabo Molete',    details: { contract_id: 'c3', type: 'SELLER', envelope: 'env_303' },                   created_at: new Date(Date.now() - 50_400_000).toISOString() },
  { id: 'a10', deal_id: 'VF-2024-001', event_type: 'EXTRACTION_FLAGGED',  actor_id: 'agent1',  actor_type: 'AGENT',  actor_name: 'Thabo Mokoena',   details: { field: 'Monthly Income', extracted: 'R 32,500', customer: 'R 35,000', reason: 'Income mismatch exceeds 10%' }, created_at: new Date(Date.now() - 36_000_000).toISOString() },
  { id: 'a11', deal_id: 'VF-2024-004', event_type: 'INSPECTION_SCHEDULED',actor_id: 'ops1',    actor_type: 'AGENT',  actor_name: 'Zanele Dube',     details: { inspector: 'Hartcon', scheduled_for: new Date(Date.now() + 86_400_000 * 2).toISOString() }, created_at: new Date(Date.now() - 21_600_000).toISOString() },
  { id: 'a12', deal_id: 'VF-2024-005', event_type: 'NATIS_SUBMITTED',     actor_id: 'system',  actor_type: 'SYSTEM', actor_name: 'NATIS Integration', details: { reference: 'NAT-2024-00982', vehicle_reg: 'WC555666' },                   created_at: new Date(Date.now() - 7_200_000).toISOString() },
  { id: 'a13', deal_id: 'VF-2024-006', event_type: 'DEAL_STATUS_CHANGED', actor_id: 'system',  actor_type: 'SYSTEM', actor_name: 'Workflow Engine', details: { from: 'DOCS_REVIEW', to: 'FNI_REVIEW' },                                   created_at: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 'a14', deal_id: 'VF-2024-001', event_type: 'HUMAN_OVERRIDE',      actor_id: 'admin1',  actor_type: 'ADMIN',  actor_name: 'Lerato Admin',    details: { field: 'condition_band', old: 'FAIR', new: 'GOOD', notes: 'Reviewed physical photos — minor cosmetic only' }, created_at: new Date(Date.now() - 1_800_000).toISOString() },
]

const actorTypeColor: Record<ActorType, string> = {
  SYSTEM: 'bg-gray-100 text-gray-700',
  AGENT:  'bg-blue-100 text-blue-800',
  BUYER:  'bg-green-100 text-green-800',
  SELLER: 'bg-amber-100 text-amber-800',
  ADMIN:  'bg-purple-100 text-purple-800',
}

const eventTypeColor: Record<string, string> = {
  DEAL_CREATED:         'text-emerald-700 bg-emerald-50',
  DEAL_STATUS_CHANGED:  'text-blue-700 bg-blue-50',
  DOCUMENT_APPROVED:    'text-green-700 bg-green-50',
  DOCUMENT_REJECTED:    'text-red-700 bg-red-50',
  TASK_ESCALATED:       'text-red-700 bg-red-50',
  HUMAN_OVERRIDE:       'text-purple-700 bg-purple-50',
  SYSTEM_ERROR:         'text-red-800 bg-red-100',
  EXTRACTION_FLAGGED:   'text-amber-700 bg-amber-50',
  AI_EVAL_COMPLETE:     'text-indigo-700 bg-indigo-50',
}

export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>(MOCK_EVENTS)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [actorFilter, setActorFilter] = useState<ActorType | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    setLoading(true)
    const run = async () => {
      try {
        const { data } = await supabase
          .from('audit_events')
          .select('*, deal:deals(deal_number)')
          .order('created_at', { ascending: false })
          .limit(200)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data && data.length > 0) setEvents(data as any as AuditEvent[])
      } catch { /* stay on mock */ } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const toggle = (id: string) =>
    setExpanded((p) => { const next = new Set(p); next.has(id) ? next.delete(id) : next.add(id); return next })

  const filtered = events.filter((e) => {
    if (search) {
      const q = search.toLowerCase()
      if (!e.deal_id?.toLowerCase().includes(q) && !e.event_type.toLowerCase().includes(q) && !(e.actor_name ?? '').toLowerCase().includes(q)) return false
    }
    if (typeFilter && e.event_type !== typeFilter) return false
    if (actorFilter && e.actor_type !== actorFilter) return false
    if (dateFrom && e.created_at < dateFrom) return false
    if (dateTo && e.created_at > dateTo + 'T23:59:59') return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">Complete audit trail of all platform events</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search deal #, event type, actor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-7 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Event Types</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>

            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value as ActorType | '')}
              className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-7 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Actors</option>
              {ACTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">{filtered.length} events</p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deal #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Event Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actor Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">Loading audit log…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No events match the current filters.</td></tr>
              )}
              {!loading && filtered.map((ev) => (
                <>
                  <tr key={ev.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle(ev.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expanded.has(ev.id)
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      <div>{format(new Date(ev.created_at), 'dd MMM yyyy')}</div>
                      <div className="text-gray-400">{format(new Date(ev.created_at), 'HH:mm:ss')}</div>
                    </td>
                    <td className="px-4 py-3">
                      {ev.deal_id
                        ? <span className="font-semibold text-gray-900">{ev.deal_id}</span>
                        : <span className="text-gray-400 italic text-xs">system</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-mono font-medium ${eventTypeColor[ev.event_type] ?? 'bg-gray-50 text-gray-700'}`}>
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actorTypeColor[ev.actor_type]}`}>
                        {ev.actor_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {ev.actor_name ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs text-gray-500 truncate">
                        {Object.entries(ev.details).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </p>
                    </td>
                  </tr>
                  {expanded.has(ev.id) && (
                    <tr key={`${ev.id}-exp`} className="bg-gray-50">
                      <td />
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="rounded-lg bg-gray-100 border border-gray-200 p-4 text-xs text-gray-700 overflow-auto whitespace-pre-wrap">
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
