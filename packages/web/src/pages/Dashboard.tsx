import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Camera,
  TrendingUp,
  FileSignature,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { StatusBadge } from '../components/StatusBadge'
import { listDeals } from '../lib/queries'
import { supabase } from '../lib/supabase'
import type { DealWithRelations } from '../types/database'

interface QueueCount {
  label: string
  value: number | null
  icon: React.ReactNode
  route: string
  description: string
}

const slaConfig = {
  ok:      { bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-500',  text: 'text-green-700',  label: 'Within SLA' },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500',  text: 'text-amber-700',  label: 'At Risk'    },
  overdue: { bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500',    text: 'text-red-700',    label: 'SLA Breach' },
}

function getSlaState(count: number | null): 'ok' | 'warning' | 'overdue' {
  if (count === null) return 'ok'
  if (count === 0) return 'ok'
  if (count <= 3) return 'warning'
  return 'overdue'
}

export function Dashboard() {
  const navigate = useNavigate()
  const [queueCounts, setQueueCounts] = useState<QueueCount[]>([
    { label: 'Total Active Deals',           value: null, icon: <TrendingUp className="h-6 w-6" />,   route: '/deals',                          description: 'Deals currently in pipeline' },
    { label: 'Pending Documents',            value: null, icon: <FileText className="h-6 w-6" />,      route: '/queue/Q_BUYER_DOC_REVIEW',       description: 'Awaiting review or upload' },
    { label: 'Pending Photos',               value: null, icon: <Camera className="h-6 w-6" />,        route: '/queue/Q_SELLER_PHOTO_REVIEW',    description: 'Photo sets awaiting review' },
    { label: 'Quotes Pending',               value: null, icon: <Clock className="h-6 w-6" />,         route: '/queue/Q_FNI_QUOTE_PREP',         description: 'F&I quotes in preparation' },
    { label: 'Contracts Awaiting Signature', value: null, icon: <FileSignature className="h-6 w-6" />, route: '/queue/Q_SELLER_CONTRACT',        description: 'Sent, awaiting signing' },
    { label: 'Deals Pending Approval',       value: null, icon: <CheckCircle2 className="h-6 w-6" />,  route: '/queue/Q_DEAL_APPROVAL',          description: 'Awaiting final sign-off' },
  ])
  const [recentDeals, setRecentDeals] = useState<DealWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [activeDeals, pendingDocs, pendingPhotos, pendingQuotes, pendingContracts, pendingApproval, recentData] =
        await Promise.allSettled([
          supabase.from('deals').select('id', { count: 'exact', head: true }).not('status', 'in', '("DEAL_FULFILLED","DEAL_CANCELLED","DEAL_DECLINED")'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_BUYER_DOC_REVIEW').eq('status', 'PENDING'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_SELLER_PHOTO_REVIEW').eq('status', 'PENDING'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_FNI_QUOTE_PREP').eq('status', 'PENDING'),
          supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('signature_status', 'SENT'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_DEAL_APPROVAL').eq('status', 'PENDING'),
          listDeals({ sortKey: 'updated_at', sortDir: 'desc', limit: 10 }),
        ])

      const counts = [activeDeals, pendingDocs, pendingPhotos, pendingQuotes, pendingContracts, pendingApproval].map(
        (r) => (r.status === 'fulfilled' && (r.value as { count: number | null }).count != null
          ? (r.value as { count: number }).count
          : null)
      )

      setQueueCounts((prev) => prev.map((q, i) => ({ ...q, value: counts[i] ?? q.value })))

      if (recentData.status === 'fulfilled') {
        setRecentDeals(recentData.value)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
      setLastRefreshed(new Date())
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Last refreshed: {lastRefreshed.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* SLA Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700">SLA Status:</span>
        {Object.entries(slaConfig).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {queueCounts.map((card) => {
          const slaState = getSlaState(card.value)
          const cfg = slaConfig[slaState]
          return (
            <button
              key={card.label}
              onClick={() => navigate(card.route)}
              className={`group relative flex items-start gap-4 rounded-xl border p-5 text-left shadow-sm hover:shadow-md transition-all ${cfg.bg} ${cfg.border}`}
            >
              <div className={`rounded-lg p-2.5 ${cfg.bg} ring-1 ${cfg.border}`}>
                <span className={cfg.text}>{card.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-600 truncate">{card.label}</p>
                <p className={`text-3xl font-bold ${cfg.text}`}>
                  {loading ? '—' : (card.value ?? '—')}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{card.description}</p>
              </div>
              <span className={`absolute right-4 top-4 flex items-center gap-1 text-xs font-medium ${cfg.text}`}>
                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Deal Activity</h2>
          <button
            onClick={() => navigate('/deals')}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            View all
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {loading && (
            <div className="py-8 text-center text-sm text-gray-400">
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-gray-300" />
              Loading recent activity…
            </div>
          )}
          {!loading && recentDeals.length === 0 && !error && (
            <div className="py-8 text-center text-sm text-gray-400">No recent deals.</div>
          )}
          {recentDeals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => navigate(`/deals/${deal.id}`)}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{deal.deal_number}</span>
                  <StatusBadge status={deal.status} variant="sm" />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {deal.buyer?.full_name ?? '—'}
                  {deal.vehicle ? ` · ${deal.vehicle.year ?? ''} ${deal.vehicle.make ?? ''} ${deal.vehicle.model ?? ''}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-gray-400">
                  {new Date(deal.updated_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Escalation alert — only shown when there are tasks in escalation queue */}
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600" />
        <p className="text-sm text-red-800">
          Check the escalations queue for deals requiring immediate attention.{' '}
          <button onClick={() => navigate('/queue/Q_HUMAN_ESCALATION')} className="underline font-medium">
            View escalations
          </button>
        </p>
      </div>
    </div>
  )
}
