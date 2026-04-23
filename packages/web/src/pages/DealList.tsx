import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronUp, ChevronDown, Filter, RefreshCw, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { StatusBadge } from '../components/StatusBadge'
import { SLAIndicator } from '../components/SLAIndicator'
import { listDeals } from '../lib/queries'
import type { Deal, DealStatus } from '../types/database'

const DEAL_STATUSES: DealStatus[] = [
  'LEAD','DOCS_PENDING','DOCS_REVIEW','FNI_REVIEW','QUOTE_PENDING','QUOTE_SENT',
  'QUOTE_ACCEPTED','INSPECTION_PENDING','INSPECTION_COMPLETE','CONTRACT_PENDING',
  'CONTRACT_SIGNED','NATIS_PENDING','NATIS_COMPLETE','SETTLED','CANCELLED','DECLINED',
]

type SortKey = 'deal_number' | 'status' | 'created_at' | 'updated_at'
type SortDir = 'asc' | 'desc'

export function DealList() {
  const navigate = useNavigate()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DealStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

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
    if (!search) return true
    const q = search.toLowerCase()
    const buyerName = d.buyer ? `${d.buyer.first_name} ${d.buyer.last_name}`.toLowerCase() : ''
    const phone = d.buyer?.phone?.toLowerCase() ?? ''
    const dealNum = d.deal_number.toLowerCase()
    return buyerName.includes(q) || phone.includes(q) || dealNum.includes(q)
  })

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
      : <ChevronDown className="h-3.5 w-3.5 opacity-30" />

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Deals</h1>
            <p className="text-sm text-gray-500">{loading ? 'Loading…' : `${filtered.length} deals`}</p>
          </div>
          <button
            onClick={fetchDeals}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, phone, deal number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DealStatus | '')}
              className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {DEAL_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
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

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: 'deal_number' as SortKey, label: 'Deal #' },
                  { key: null, label: 'Buyer' },
                  { key: null, label: 'Seller' },
                  { key: null, label: 'Vehicle' },
                  { key: 'status' as SortKey, label: 'Status' },
                  { key: 'created_at' as SortKey, label: 'Created' },
                  { key: 'updated_at' as SortKey, label: 'Updated' },
                  { key: null, label: 'SLA' },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={`border-b border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${key ? 'cursor-pointer select-none hover:text-gray-800' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      {key && <SortIcon col={key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-gray-300" />
                    Loading deals…
                  </td>
                </tr>
              )}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    No deals found
                  </td>
                </tr>
              )}
              {!loading && filtered.map((deal) => (
                <tr
                  key={deal.id}
                  onClick={() => navigate(`/deals/${deal.id}`)}
                  className="cursor-pointer hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-gray-900">{deal.deal_number}</span>
                    {deal.current_blockers && deal.current_blockers.length > 0 && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        <span className="text-xs text-red-600">{deal.current_blockers[0]}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {deal.buyer
                      ? <div>
                          <p className="font-medium text-gray-900">{deal.buyer.first_name} {deal.buyer.last_name}</p>
                          <p className="text-xs text-gray-400">{deal.buyer.phone}</p>
                        </div>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-gray-700">
                    {deal.seller
                      ? `${deal.seller.first_name} ${deal.seller.last_name}`
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {deal.vehicle
                      ? <div>
                          <p className="font-medium text-gray-900">{deal.vehicle.year} {deal.vehicle.make} {deal.vehicle.model}</p>
                          <p className="text-xs text-gray-400">
                            {deal.vehicle.registration_number}
                            {deal.vehicle.odometer_km ? ` · ${deal.vehicle.odometer_km.toLocaleString()} km` : ''}
                          </p>
                        </div>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={deal.status} />
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {format(new Date(deal.created_at), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {format(new Date(deal.updated_at), 'dd MMM HH:mm')}
                  </td>
                  <td className="px-4 py-3.5">
                    <SLAIndicator dueAt={deal.sla_due_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
