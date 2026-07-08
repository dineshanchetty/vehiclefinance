import { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw, AlertCircle, AlertTriangle, Activity, TrendingUp, PhoneOff,
  CheckCircle2, Clock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getRecoveryReport, type RecoveryReport } from '../lib/recovery'

export function ReportsPage() {
  const [report, setReport] = useState<RecoveryReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true); setError(null)
    try { setReport(await getRecoveryReport()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load report') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchReport() }, [fetchReport])

  if (loading && !report) return <Centered>Loading report…</Centered>
  if (error) return (
    <Centered>
      <span className="inline-flex items-center gap-2 text-red-600"><AlertCircle className="h-4 w-4" />{error}</span>
    </Centered>
  )
  if (!report) return null

  const feedSilent = report.feed.lastReceivedAt
    ? Date.now() - new Date(report.feed.lastReceivedAt).getTime() > 72 * 3_600_000
    : true
  const attentionTotal = report.attention.optedOut + report.attention.unreachable +
    report.attention.unpriced + report.attention.stale48h

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b border-gray-200 bg-white px-6 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-claimtec-forest">Reports</h1>
          <p className="text-xs text-gray-500">Recovery operations — what's working, what needs attention</p>
        </div>
        <button onClick={fetchReport} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="px-6 py-4 space-y-4 max-w-5xl">
        {/* ── Feed health ── */}
        <Section title="Feed health" icon={<Activity className="h-4 w-4 text-claimtec-forest" />}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Stat
              label="Last decline received"
              value={report.feed.lastReceivedAt ? formatDistanceToNow(new Date(report.feed.lastReceivedAt), { addSuffix: true }) : 'never'}
              alert={feedSilent}
              hint={feedSilent ? 'Feed silent >72h — check Absa intake' : undefined}
            />
            <Stat label="Received today" value={String(report.feed.receivedToday)} />
            <Stat label="Received · 7 days" value={String(report.feed.received7d)} />
            <Stat
              label="Unrouted (OTHER)"
              value={String(report.feed.unrouted)}
              alert={report.feed.unrouted > 0}
              hint={report.feed.unrouted > 0 ? 'Decline reasons that mapped to no workstream' : undefined}
            />
          </div>
          {/* 14-day intake sparkline as CSS bars */}
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Intake · last 14 days</p>
            <div className="flex items-end gap-1 h-16">
              {report.byDay.map((d) => {
                const max = Math.max(...report.byDay.map((x) => x.count), 1)
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}: ${d.count}`}>
                    <div
                      className={`w-full rounded-t ${d.count > 0 ? 'bg-claimtec-forest' : 'bg-gray-100'}`}
                      style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 8 : 3)}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
              <span>{report.byDay[0]?.day.slice(5)}</span>
              <span>{report.byDay[report.byDay.length - 1]?.day.slice(5)}</span>
            </div>
          </div>
        </Section>

        {/* ── Needs attention ── */}
        <Section
          title={`Needs attention ${attentionTotal > 0 ? `(${attentionTotal})` : ''}`}
          icon={<AlertTriangle className={`h-4 w-4 ${attentionTotal > 0 ? 'text-amber-500' : 'text-gray-400'}`} />}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Stat label="Stalled >48h" value={String(report.attention.stale48h)} alert={report.attention.stale48h > 0}
              hint="Engaged but no movement — consider a follow-up nudge" />
            <Stat label="Unpriced A-leads" value={String(report.attention.unpriced)} alert={report.attention.unpriced > 0}
              hint="Routed but pricing pass never ran" />
            <Stat label="Unreachable (B)" value={String(report.attention.unreachable)}
              hint="Tracing exhausted, no contact found" />
            <Stat label="Opted out" value={String(report.attention.optedOut)}
              hint="Suppressed — never contact again" />
          </div>
        </Section>

        {/* ── Conversion funnels ── */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Upsell conversion (A)" icon={<TrendingUp className="h-4 w-4 text-claimtec-forest" />}>
            <FunnelBar label="Routed" n={report.aConversion.routed} pctv={100} />
            <FunnelBar label="Priced" n={report.aConversion.priced} pctv={report.aConversion.pricedPct} />
            <FunnelBar label="Engaged" n={report.aConversion.engaged} pctv={report.aConversion.engagedPct} />
            <FunnelBar label="Returned to bank" n={report.aConversion.returned} pctv={report.aConversion.returnedPct} />
            <FunnelBar label="Funded" n={report.aConversion.funded} pctv={report.aConversion.fundedPct} strong />
          </Section>
          <Section title="Reactivation conversion (B)" icon={<PhoneOff className="h-4 w-4 text-claimtec-forest" />}>
            <FunnelBar label="Routed" n={report.bConversion.routed} pctv={100} />
            <FunnelBar label="Traced" n={report.bConversion.traced} pctv={report.bConversion.tracedPct} />
            <FunnelBar label="Returned to bank" n={report.bConversion.returned} pctv={report.bConversion.returnedPct} strong />
            <FunnelBar label="Unreachable" n={report.bConversion.unreachable} pctv={report.bConversion.unreachablePct} danger />
          </Section>
        </div>

        {/* ── Speed ── */}
        <Section title="Speed" icon={<Clock className="h-4 w-4 text-claimtec-forest" />}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <div className="text-2xl font-bold text-claimtec-forest tabular-nums">
                {report.medianHoursToReturn != null ? `${report.medianHoursToReturn}h` : '—'}
              </div>
              <div className="text-xs text-gray-500">median time from decline received → returned to bank</div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

// ─── presentational helpers ───────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900">{icon}{title}</h3>
      {children}
    </div>
  )
}

function Stat({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${alert ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${alert ? 'text-amber-700' : 'text-gray-900'}`}>{value}</div>
      {hint && <div className={`text-[10px] mt-0.5 ${alert ? 'text-amber-600' : 'text-gray-400'}`}>{hint}</div>}
    </div>
  )
}

function FunnelBar({ label, n, pctv, strong, danger }: { label: string; n: number; pctv: number; strong?: boolean; danger?: boolean }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold tabular-nums text-gray-900">{n} <span className="text-gray-400">({pctv}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${danger ? 'bg-rose-400' : strong ? 'bg-emerald-500' : 'bg-claimtec-forest'}`}
          style={{ width: `${Math.min(pctv, 100)}%` }}
        />
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-gray-400">{children}</div>
}
