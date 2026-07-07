import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, AlertCircle, TrendingUp, PhoneOff, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  listDeclineLeads, getRecoveryFunnel,
  type DeclineLead, type RecoveryFunnel, type RecoveryWorkstream,
} from '../lib/recovery'

// ─── formatting helpers ───────────────────────────────────────────────────────
function rand(n: number | null): string {
  if (n == null) return '—'
  return 'R ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-600',
  ROUTED: 'bg-sky-100 text-sky-800',
  TRACING: 'bg-amber-100 text-amber-800',
  ENGAGING: 'bg-amber-100 text-amber-800',
  RE_ENGAGED: 'bg-indigo-100 text-indigo-800',
  RETURNED: 'bg-claimtec-forest/10 text-claimtec-forest',
  FUNDED: 'bg-emerald-100 text-emerald-800',
  OPTED_OUT: 'bg-rose-100 text-rose-800',
  UNREACHABLE: 'bg-rose-100 text-rose-800',
  CLOSED: 'bg-gray-100 text-gray-500',
}

const WS_LABEL: Record<RecoveryWorkstream, string> = {
  A_UPSELL: 'Upsell',
  B_REACTIVATION: 'Reactivation',
  NONE: 'Held',
}

// ─── page ─────────────────────────────────────────────────────────────────────
export function RecoveryPage() {
  const [leads, setLeads] = useState<DeclineLead[]>([])
  const [funnel, setFunnel] = useState<RecoveryFunnel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsFilter, setWsFilter] = useState<RecoveryWorkstream | ''>('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [f, l] = await Promise.all([
        getRecoveryFunnel(),
        listDeclineLeads({ workstream: wsFilter || undefined, limit: 300 }),
      ])
      setFunnel(f); setLeads(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recovery data')
    } finally {
      setLoading(false)
    }
  }, [wsFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-claimtec-forest">Recovery</h1>
            <p className="text-xs text-gray-500">
              Declined applications received from Absa, routed into the recovery workstreams.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-claimtec-forest hover:text-claimtec-forest disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Funnel stat cards */}
        {funnel && (
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-6 gap-2.5">
            <StatCard label="Total declines" value={funnel.total} tone="ink" />
            <StatCard label="Upsell (A)" value={funnel.byWorkstream.A_UPSELL} tone="teal" icon={<TrendingUp className="h-3.5 w-3.5" />} />
            <StatCard label="Reactivation (B)" value={funnel.byWorkstream.B_REACTIVATION} tone="amber" icon={<PhoneOff className="h-3.5 w-3.5" />} />
            <StatCard label="A · priced" value={funnel.aFunnel.priced} tone="sky" />
            <StatCard label="A · returned" value={funnel.aFunnel.returned} tone="teal" />
            <StatCard label="A · funded" value={funnel.aFunnel.funded} tone="emerald" />
          </div>
        )}

        {/* Workstream filter */}
        <div className="mt-3 flex items-center gap-2">
          {(['', 'A_UPSELL', 'B_REACTIVATION', 'NONE'] as const).map((w) => (
            <button
              key={w || 'all'}
              onClick={() => setWsFilter(w)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                wsFilter === w
                  ? 'bg-claimtec-forest text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-claimtec-forest'
              }`}
            >
              {w === '' ? 'All' : WS_LABEL[w]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Leads table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Absa ref</th>
                <th className="px-4 py-2.5 font-semibold">Applicant</th>
                <th className="px-4 py-2.5 font-semibold">Workstream</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Original</th>
                <th className="px-4 py-2.5 font-semibold">Qualifies for</th>
                <th className="px-4 py-2.5 font-semibold">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && leads.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
              )}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No declined applications yet. Absa's decline feed lands here.
                </td></tr>
              )}
              {leads.map((l) => {
                const uplift = l.workstream === 'A_UPSELL' && l.qualifying_ceiling != null
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-claimtec-forest">{l.absa_ref}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{l.full_name ?? '—'}</div>
                      <div className="text-[11px] text-gray-400">{l.decline_reason_raw ?? l.decline_reason}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-gray-700">{WS_LABEL[l.workstream]}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[l.recovery_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {l.recovery_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 tabular-nums">{rand(l.vehicle_price)}</td>
                    <td className="px-4 py-2.5">
                      {uplift ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-claimtec-forest tabular-nums">
                          <ArrowRight className="h-3 w-3 text-emerald-500" />
                          {rand(l.qualifying_ceiling)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-400">
                      {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
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

// ─── stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, tone, icon }: {
  label: string; value: number; tone: 'ink' | 'teal' | 'amber' | 'sky' | 'emerald'; icon?: React.ReactNode
}) {
  const toneClass: Record<string, string> = {
    ink: 'text-claimtec-ink',
    teal: 'text-claimtec-forest',
    amber: 'text-amber-600',
    sky: 'text-sky-700',
    emerald: 'text-emerald-600',
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500">
        {icon}{label}
      </div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${toneClass[tone]}`}>{value}</div>
    </div>
  )
}
