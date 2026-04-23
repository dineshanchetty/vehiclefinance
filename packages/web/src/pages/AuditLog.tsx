import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Search, ChevronDown, ChevronRight, Filter, RefreshCw, AlertCircle } from 'lucide-react'
import { listAuditFeed } from '../lib/queries'
import type { AuditFeedItem } from '../types/database'

const EVENT_TYPES = [
  'DEAL_CREATED', 'DEAL_STATUS_CHANGED', 'DEAL_ASSIGNED',
  'DOCUMENT_UPLOADED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED',
  'EXTRACTION_ACCEPTED', 'EXTRACTION_OVERRIDDEN', 'EXTRACTION_FLAGGED', 'EXTRACTION_REVIEWED',
  'PHOTO_SET_UPLOADED', 'PHOTO_APPROVED', 'PHOTO_REJECTED',
  'AI_EVAL_COMPLETE', 'AI_EVAL_OVERRIDDEN',
  'QUOTE_CREATED', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_DECLINED',
  'INSPECTION_SCHEDULED', 'INSPECTION_COMPLETE',
  'CONTRACT_SENT', 'CONTRACT_SIGNED', 'CONTRACT_DECLINED',
  'NATIS_SUBMITTED', 'NATIS_COMPLETE',
  'TASK_CREATED', 'TASK_CLAIMED', 'TASK_COMPLETED', 'TASK_ESCALATED',
  'HUMAN_OVERRIDE', 'SYSTEM_ERROR',
]

// audit_events.actor_type is a free-text column in the DB. These are the
// conventional labels the bot + ops portal use — any other value will
// render as-is.
const ACTOR_TYPES = ['SYSTEM', 'AGENT', 'BUYER', 'SELLER', 'ADMIN', 'BOT']

const actorTypeColor: Record<string, string> = {
  SYSTEM: 'bg-gray-100 text-gray-700',
  AGENT:  'bg-blue-100 text-blue-800',
  BUYER:  'bg-green-100 text-green-800',
  SELLER: 'bg-amber-100 text-amber-800',
  ADMIN:  'bg-purple-100 text-purple-800',
  BOT:    'bg-indigo-100 text-indigo-800',
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
  const [events, setEvents] = useState<AuditFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAuditFeed({
        eventType: typeFilter || undefined,
        actorType: actorFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 200,
      })
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, actorFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const toggle = (id: string) =>
    setExpanded((p) => { const next = new Set(p); next.has(id) ? next.delete(id) : next.add(id); return next })

  const filtered = events.filter((e) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (e.deal_id?.toLowerCase().includes(q) ?? false) ||
      e.event_type.toLowerCase().includes(q) ||
      (e.actor ?? '').toLowerCase().includes(q) ||
      (e.deal?.deal_number?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Complete audit trail — merges <code className="text-xs">audit_events</code> and{' '}
              <code className="text-xs">audit_logs</code> ordered newest-first.
            </p>
          </div>
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

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
              onChange={(e) => setActorFilter(e.target.value)}
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
        <p className="mt-2 text-xs text-gray-400">
          {loading ? 'Loading…' : `${filtered.length} events`}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={fetchEvents} className="ml-auto text-sm font-medium text-red-700 underline">Retry</button>
        </div>
      )}

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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actor Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-gray-300" />
                    Loading audit log…
                  </td>
                </tr>
              )}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    No events match the current filters.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((ev) => {
                const rowKey = `${ev.source}-${ev.id}`
                return (
                  <>
                    <tr key={rowKey} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggle(rowKey)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {expanded.has(rowKey)
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        <div>{format(new Date(ev.created_at), 'dd MMM yyyy')}</div>
                        <div className="text-gray-400">{format(new Date(ev.created_at), 'HH:mm:ss')}</div>
                      </td>
                      <td className="px-4 py-3">
                        {ev.deal?.deal_number
                          ? <span className="font-semibold text-gray-900">{ev.deal.deal_number}</span>
                          : ev.deal_id
                            ? <span className="font-semibold text-gray-900">{ev.deal_id}</span>
                            : <span className="text-gray-400 italic text-xs">system</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-mono font-medium ${eventTypeColor[ev.event_type] ?? 'bg-gray-50 text-gray-700'}`}>
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                          {ev.source === 'audit_logs' ? 'log' : 'event'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {ev.actor_type
                          ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actorTypeColor[ev.actor_type] ?? 'bg-gray-100 text-gray-700'}`}>
                              {ev.actor_type}
                            </span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {ev.actor ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-gray-500 truncate">
                          {ev.details
                            ? Object.entries(ev.details).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
                            : '—'}
                        </p>
                      </td>
                    </tr>
                    {expanded.has(rowKey) && (
                      <tr key={`${rowKey}-exp`} className="bg-gray-50">
                        <td />
                        <td colSpan={7} className="px-4 py-3">
                          <pre className="rounded-lg bg-gray-100 border border-gray-200 p-4 text-xs text-gray-700 overflow-auto whitespace-pre-wrap">
                            {JSON.stringify(ev.details ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
