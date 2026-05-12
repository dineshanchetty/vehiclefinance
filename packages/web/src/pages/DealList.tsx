import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, ChevronUp, ChevronDown, Filter, RefreshCw, AlertCircle,
  Briefcase, Clock, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { StatusBadge } from '../components/StatusBadge'
import { PHASES } from '../components/PhaseTimeline'
import { listDeals } from '../lib/queries'
import type { DealWithRelations, DealStatus } from '../types/database'

// Quick filter chips — semantic groupings of the legacy deal_status enum.
type QuickFilter = 'all' | 'in_progress' | 'awaiting_decision' | 'stuck' | 'done'

const DONE_STATUSES = new Set<DealStatus>([
  'DEAL_FULFILLED', 'DEAL_CANCELLED', 'DEAL_DECLINED',
])
const AWAITING_DECISION = new Set<DealStatus>([
  'FNI_REVIEW_PENDING', 'DEAL_PENDING_APPROVAL',
])
const STUCK_THRESHOLD_HOURS = 48

function isStuck(deal: DealWithRelations): boolean {
  if (DONE_STATUSES.has(deal.status)) return false
  const ageHrs = (Date.now() - new Date(deal.updated_at).getTime()) / 36e5
  return ageHrs > STUCK_THRESHOLD_HOURS
}

function dealMatchesFilter(deal: DealWithRelations, f: QuickFilter): boolean {
  if (f === 'all') return true
  if (f === 'done') return DONE_STATUSES.has(deal.status)
  if (f === 'in_progress') return !DONE_STATUSES.has(deal.status)
  if (f === 'awaiting_decision') {
    return AWAITING_DECISION.has(deal.status)
      || (deal as { current_phase?: string }).current_phase === 'CREDIT_DECISION'
  }
  if (f === 'stuck') return isStuck(deal)
  return true
}

const DEAL_STATUSES: DealStatus[] = [
  'APPLICATION_INITIATED',
  'BUYER_DOCS_PENDING',
  'BUYER_DOCS_EXTRACTED',
  'SELLER_INVITED',
  'SELLER_DOCS_PENDING',
  'VEHICLE_PHOTOS_PENDING',
  'VEHICLE_PHOTOS_COMPLETE',
  'QUICK_EVAL_COMPLETE',
  'FNI_REVIEW_PENDING',
  'QUOTE_SENT',
  'QUOTE_ACCEPTED',
  'INSPECTION_SCHEDULED',
  'INSPECTION_COMPLETE',
  'SELLER_CONTRACT_SIGNED',
  'BUYER_CONTRACT_SIGNED',
  'DEAL_PENDING_APPROVAL',
  'DEAL_APPROVED',
  'NATIS_COMPLETE',
  'DEAL_FULFILLED',
  'DEAL_CANCELLED',
  'DEAL_ON_HOLD',
]

type SortKey = 'deal_number' | 'status' | 'created_at' | 'updated_at'
type SortDir = 'asc' | 'desc'

export function DealList() {
  const navigate = useNavigate()
  const [deals, setDeals] = useState<DealWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DealStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')

  const fetchDeals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listDeals({
        status: statusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortKey,
        sortDir,
        limit: 100,
      })
      setDeals(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dateFrom, dateTo, sortKey, sortDir])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = deals.filter((d) => {
    if (!dealMatchesFilter(d, quickFilter)) return false
    if (!search) return true
    const q = search.toLowerCase()
    const buyerName = d.buyer?.full_name?.toLowerCase() ?? ''
    const phone = d.buyer?.phone?.toLowerCase() ?? ''
    const dealNum = (d.deal_number ?? '').toLowerCase()
    const make = d.vehicle?.make?.toLowerCase() ?? ''
    const model = d.vehicle?.model?.toLowerCase() ?? ''
    return buyerName.includes(q) || phone.includes(q) || dealNum.includes(q)
      || make.includes(q) || model.includes(q)
  })

  const metrics = useMemo(() => ({
    total: deals.length,
    inProgress: deals.filter((d) => !DONE_STATUSES.has(d.status)).length,
    awaiting: deals.filter((d) =>
      AWAITING_DECISION.has(d.status)
      || (d as { current_phase?: string }).current_phase === 'CREDIT_DECISION'
    ).length,
    stuck: deals.filter(isStuck).length,
  }), [deals])

  const phaseCount = PHASES.length
  const phaseProgress = (deal: DealWithRelations): { done: number; total: number } => {
    const milestones = (deal as { completed_milestones?: string[] | null }).completed_milestones ?? []
    const currentPhase = (deal as { current_phase?: string | null }).current_phase
    const currentIdx = currentPhase ? PHASES.findIndex((p) => p.key === currentPhase) : -1
    const completedByMilestones = PHASES.filter((p, idx) => {
      if (p.milestones.some((m) => milestones.includes(m))) return true
      if (currentIdx > -1 && idx < currentIdx) return true
      return false
    }).length
    return { done: completedByMilestones, total: phaseCount - 1 }
  }

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
      : <ChevronDown className="h-3.5 w-3.5 opacity-30" />

  return (
    <div className="flex flex-col h-full">
      {/* Page header: refresh + metrics + filter bar */}
      <div className="border-b border-gray-200 bg-white px-6 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">{loading ? 'Loading…' : `${filtered.length} deals`}</p>
          <button
            onClick={fetchDeals}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-wesbank-navy hover:text-wesbank-navy disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Compact metric cards — h-16, uniform shape, just icon + colour varies */}
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <MetricCard
            icon={<Briefcase className="h-4 w-4" />}
            label="Total"
            value={metrics.total}
            tone="navy"
          />
          <MetricCard
            icon={<Clock className="h-4 w-4" />}
            label="In progress"
            value={metrics.inProgress}
            tone="amber"
          />
          <MetricCard
            icon={<AlertCircle className="h-4 w-4" />}
            label="Awaiting decision"
            value={metrics.awaiting}
            tone="sky"
          />
          <MetricCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label={`Stuck >${STUCK_THRESHOLD_HOURS}h`}
            value={metrics.stuck}
            tone="rose"
          />
        </div>

        {/* Unified filter bar: chips left, search + filters right */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: 'all',                label: 'All' },
              { id: 'in_progress',        label: 'In progress' },
              { id: 'awaiting_decision',  label: 'Awaiting decision' },
              { id: 'stuck',              label: 'Stuck' },
              { id: 'done',               label: 'Done' },
            ] as { id: QuickFilter; label: string }[]).map(({ id, label }) => {
              const active = quickFilter === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setQuickFilter(id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                    active
                      ? 'bg-wesbank-navy text-white border-wesbank-navy'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-wesbank-navy hover:text-wesbank-navy'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, phone, deal #…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-xs placeholder-gray-400 focus:border-wesbank-navy focus:outline-none focus:ring-1 focus:ring-wesbank-navy/30"
              />
            </div>

            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DealStatus | '')}
                className="rounded-md border border-gray-200 bg-white py-1.5 pl-2 pr-7 text-xs text-gray-700 focus:border-wesbank-navy focus:outline-none focus:ring-1 focus:ring-wesbank-navy/30"
              >
                <option value="">All statuses</option>
                {DEAL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-gray-200 bg-white py-1.5 px-2 text-xs text-gray-700 focus:border-wesbank-navy focus:outline-none focus:ring-1 focus:ring-wesbank-navy/30"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-gray-200 bg-white py-1.5 px-2 text-xs text-gray-700 focus:border-wesbank-navy focus:outline-none focus:ring-1 focus:ring-wesbank-navy/30"
            />
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={fetchDeals}
            className="ml-auto text-sm font-medium text-red-700 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table — 5 columns (Deal # · Parties · Vehicle/Progress · Status · Last activity) */}
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: 'deal_number' as SortKey, label: 'Deal #' },
                  { key: null, label: 'Parties' },
                  { key: null, label: 'Vehicle · Progress' },
                  { key: 'status' as SortKey, label: 'Status' },
                  { key: 'updated_at' as SortKey, label: 'Last activity' },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={`border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${key ? 'cursor-pointer select-none hover:text-wesbank-navy' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      {key && <SortIcon col={key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-gray-400">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-gray-300" />
                    Loading deals…
                  </td>
                </tr>
              )}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-gray-400">
                    No deals found
                  </td>
                </tr>
              )}
              {!loading && filtered.map((deal, idx) => {
                const { done, total } = phaseProgress(deal)
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                return (
                  <tr
                    key={deal.id}
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    className={`cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                      idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'
                    } hover:bg-wesbank-navy/[0.04]`}
                  >
                    <td className="px-4 py-3 align-top">
                      <span className="font-semibold text-gray-900">{deal.deal_number ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-0.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-10">Buy</span>
                          <span className="text-sm text-gray-900 truncate">
                            {deal.buyer?.full_name ?? <span className="text-gray-400">—</span>}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-10">Sell</span>
                          <span className="text-xs text-gray-600 truncate">
                            {deal.seller?.full_name ?? <span className="text-gray-400">—</span>}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {deal.vehicle ? (
                        <div className="min-w-[180px]">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {[deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ') || '—'}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-wesbank-navy'}`}
                                style={{ width: `${Math.max(pct, 4)}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-gray-500 whitespace-nowrap">{done}/{total}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <StatusBadge status={deal.status} />
                      {isStuck(deal) && (
                        <span className="ml-1.5 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-rose-600" title={`No update in over ${STUCK_THRESHOLD_HOURS}h`}>
                          <AlertTriangle className="h-3 w-3 mr-0.5" /> Stuck
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-500 whitespace-nowrap" title={format(new Date(deal.updated_at), 'dd MMM yyyy HH:mm')}>
                      {formatDistanceToNow(new Date(deal.updated_at), { addSuffix: true })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'navy' | 'amber' | 'sky' | 'rose'
}) {
  const iconColor: Record<typeof tone, string> = {
    navy:  'text-wesbank-navy bg-wesbank-navy/10',
    amber: 'text-amber-600 bg-amber-100',
    sky:   'text-sky-600 bg-sky-100',
    rose:  'text-rose-600 bg-rose-100',
  }
  return (
    <div className="flex h-16 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${iconColor[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  )
}

void CheckCircle2
