import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SLAIndicator } from '../components/SLAIndicator'

interface StatCard {
  label: string
  value: number | null
  icon: React.ReactNode
  slaState: 'ok' | 'warning' | 'overdue'
  route: string
  description: string
}

const MOCK_STATS: StatCard[] = [
  { label: 'Total Active Deals',          value: 42,  icon: <TrendingUp className="h-6 w-6" />,    slaState: 'ok',      route: '/deals',                          description: 'Deals currently in pipeline' },
  { label: 'Pending Documents',           value: 11,  icon: <FileText className="h-6 w-6" />,       slaState: 'warning', route: '/queue/Q_BUYER_DOC_REVIEW',       description: 'Awaiting review or upload' },
  { label: 'Pending Photos',              value: 7,   icon: <Camera className="h-6 w-6" />,         slaState: 'ok',      route: '/queue/Q_SELLER_PHOTO_REVIEW',    description: 'Photo sets awaiting review' },
  { label: 'Quotes Pending',              value: 5,   icon: <Clock className="h-6 w-6" />,          slaState: 'overdue', route: '/queue/Q_FNI_QUOTE_PREP',         description: 'F&I quotes in preparation' },
  { label: 'Contracts Awaiting Signature',value: 3,   icon: <FileSignature className="h-6 w-6" />,  slaState: 'warning', route: '/queue/Q_SELLER_CONTRACT',        description: 'Sent, awaiting signing' },
  { label: 'Deals Pending Approval',      value: 8,   icon: <CheckCircle2 className="h-6 w-6" />,   slaState: 'ok',      route: '/queue/Q_DEAL_APPROVAL',          description: 'Awaiting final sign-off' },
]

const slaConfig = {
  ok:      { bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-500',  text: 'text-green-700',  label: 'Within SLA' },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500',  text: 'text-amber-700',  label: 'At Risk'    },
  overdue: { bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500',    text: 'text-red-700',    label: 'SLA Breach' },
}

interface RecentDeal {
  id: string
  deal_number: string
  status: string
  buyer_name: string
  vehicle_summary: string
  updated_at: string
  sla_due_at: string | null
}

const MOCK_RECENT: RecentDeal[] = [
  { id: '1', deal_number: 'VF-2024-001', status: 'DOCS_REVIEW',          buyer_name: 'Sipho Dlamini',    vehicle_summary: '2019 Toyota Corolla',      updated_at: new Date(Date.now() - 3_600_000).toISOString(),  sla_due_at: new Date(Date.now() + 2_700_000).toISOString() },
  { id: '2', deal_number: 'VF-2024-002', status: 'QUOTE_PENDING',        buyer_name: 'Naledi Mokoena',   vehicle_summary: '2021 VW Polo',             updated_at: new Date(Date.now() - 7_200_000).toISOString(),  sla_due_at: new Date(Date.now() - 1_800_000).toISOString() },
  { id: '3', deal_number: 'VF-2024-003', status: 'CONTRACT_PENDING',     buyer_name: 'Thandeka Nkosi',   vehicle_summary: '2020 Ford Ranger',         updated_at: new Date(Date.now() - 1_800_000).toISOString(),  sla_due_at: new Date(Date.now() + 18_000_000).toISOString() },
  { id: '4', deal_number: 'VF-2024-004', status: 'INSPECTION_PENDING',   buyer_name: 'Bongani Zulu',     vehicle_summary: '2018 Hyundai Tucson',      updated_at: new Date(Date.now() - 5_400_000).toISOString(),  sla_due_at: new Date(Date.now() + 86_400_000).toISOString() },
  { id: '5', deal_number: 'VF-2024-005', status: 'NATIS_PENDING',        buyer_name: 'Lerato Sithole',   vehicle_summary: '2022 Kia Picanto',         updated_at: new Date(Date.now() - 900_000).toISOString(),    sla_due_at: null },
]

export function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StatCard[]>(MOCK_STATS)
  const [recentDeals, setRecentDeals] = useState<RecentDeal[]>(MOCK_RECENT)
  const [loading, setLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const fetchStats = async () => {
    setLoading(true)
    try {
      // Try live Supabase counts; fall back to mock on error
      const [activeDeals, pendingDocs, pendingPhotos, pendingQuotes, pendingContracts, pendingApproval] =
        await Promise.allSettled([
          supabase.from('deals').select('id', { count: 'exact', head: true }).not('status', 'in', '("SETTLED","CANCELLED","DECLINED")'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_BUYER_DOC_REVIEW').eq('status', 'PENDING'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_SELLER_PHOTO_REVIEW').eq('status', 'PENDING'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_FNI_QUOTE_PREP').eq('status', 'PENDING'),
          supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'SENT'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('queue', 'Q_DEAL_APPROVAL').eq('status', 'PENDING'),
        ])

      const counts = [activeDeals, pendingDocs, pendingPhotos, pendingQuotes, pendingContracts, pendingApproval].map(
        (r) => (r.status === 'fulfilled' && r.value.count != null ? r.value.count : null)
      )

      setStats((prev) =>
        prev.map((s, i) => ({ ...s, value: counts[i] ?? s.value }))
      )

      // Fetch recent deals
      const { data } = await supabase
        .from('deals')
        .select('id, deal_number, status, sla_due_at, updated_at, buyers(first_name, last_name), vehicles(make, model, year)')
        .not('status', 'in', '("SETTLED","CANCELLED")')
        .order('updated_at', { ascending: false })
        .limit(10)

      if (data && data.length > 0) {
        setRecentDeals(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data as any[]).map((d) => ({
            id: d.id as string,
            deal_number: d.deal_number as string,
            status: d.status as string,
            buyer_name: d.buyers ? `${d.buyers.first_name} ${d.buyers.last_name}` : '—',
            vehicle_summary: d.vehicles ? `${d.vehicles.year} ${d.vehicles.make} ${d.vehicles.model}` : '—',
            updated_at: d.updated_at as string,
            sla_due_at: d.sla_due_at as string | null,
          }))
        )
      }
    } catch {
      // silently stay on mock data
    } finally {
      setLoading(false)
      setLastRefreshed(new Date())
    }
  }

  useEffect(() => { fetchStats() }, [])

  const statusLabel: Record<string, string> = {
    DOCS_REVIEW: 'Docs Review', QUOTE_PENDING: 'Quote Pending',
    CONTRACT_PENDING: 'Contract Pending', INSPECTION_PENDING: 'Inspection Pending',
    NATIS_PENDING: 'NATIS Pending',
  }

  const statusColor: Record<string, string> = {
    DOCS_REVIEW:         'bg-blue-100 text-blue-800',
    QUOTE_PENDING:       'bg-purple-100 text-purple-800',
    CONTRACT_PENDING:    'bg-amber-100 text-amber-800',
    INSPECTION_PENDING:  'bg-orange-100 text-orange-800',
    NATIS_PENDING:       'bg-sky-100 text-sky-800',
  }

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
        {stats.map((card) => {
          const cfg = slaConfig[card.slaState]
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
                  {card.value ?? '—'}
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

      {/* Alert strip */}
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600" />
        <p className="text-sm text-red-800">
          <span className="font-semibold">2 deals</span> have breached SLA and require immediate attention.{' '}
          <button onClick={() => navigate('/queue/Q_HUMAN_ESCALATION')} className="underline font-medium">
            View escalations
          </button>
        </p>
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Deal Activity</h2>
          <button
            onClick={() => navigate('/deals')}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            View all
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {recentDeals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => navigate(`/deals/${deal.id}`)}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{deal.deal_number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[deal.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel[deal.status] ?? deal.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {deal.buyer_name} · {deal.vehicle_summary}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <SLAIndicator dueAt={deal.sla_due_at} compact />
                <span className="text-xs text-gray-400">
                  {new Date(deal.updated_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
