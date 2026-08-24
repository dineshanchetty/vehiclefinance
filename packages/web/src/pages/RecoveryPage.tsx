import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertCircle, TrendingUp, PhoneOff, ArrowRight, Plus, X, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  listDeclineLeads, getRecoveryFunnel, createLead,
  type DeclineLead, type RecoveryFunnel, type RecoveryWorkstream, type NewLeadInput,
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
  const navigate = useNavigate()
  const [leads, setLeads] = useState<DeclineLead[]>([])
  const [funnel, setFunnel] = useState<RecoveryFunnel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsFilter, setWsFilter] = useState<RecoveryWorkstream | ''>('')
  const [showNew, setShowNew] = useState(false)

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 rounded-md bg-claimtec-forest px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-claimtec-forest-2 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New lead
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-claimtec-forest hover:text-claimtec-forest disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Funnel stat cards */}
        {funnel && (
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-6 gap-2.5">
            <StatCard label="Total declines" value={funnel.total} tone="ink" />
            <StatCard label="Upsell (A)" value={funnel.byWorkstream.A_UPSELL} tone="teal" icon={<TrendingUp className="h-3.5 w-3.5" />} />
            <StatCard label="Reactivation (B)" value={funnel.byWorkstream.B_REACTIVATION} tone="amber" icon={<PhoneOff className="h-3.5 w-3.5" />} />
            <StatCard label="A · priced" value={funnel.aFunnel.priced} tone="sky" />
            <StatCard label="B · traced" value={funnel.bFunnel.traced} tone="amber" />
            <StatCard label="Recovered · funded" value={funnel.funded} tone="emerald" />
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
                <th className="px-4 py-2.5 font-semibold">Recovery</th>
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
                const traced = l.workstream === 'B_REACTIVATION' && l.traced_phone != null
                return (
                  <tr
                    key={l.id}
                    onClick={() => navigate(`/recovery/${l.id}`)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
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
                      ) : traced ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span className="text-gray-400 line-through tabular-nums">{l.phone ?? '—'}</span>
                          <ArrowRight className="h-3 w-3 text-emerald-500" />
                          <span className="font-semibold text-claimtec-forest tabular-nums">+{l.traced_phone}</span>
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

      {showNew && (
        <NewLeadModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); load(); if (id) navigate(`/recovery/${id}`) }}
        />
      )}
    </div>
  )
}

// ─── new-lead modal ───────────────────────────────────────────────────────────
function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id?: string) => void }) {
  const [form, setForm] = useState<NewLeadInput>({ full_name: '', phone: '', decline_reason: 'Affordability' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof NewLeadInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const lead = await createLead(form)
      onCreated(lead.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the lead')
      setBusy(false)
    }
  }

  const isAffordability = /afford/i.test(form.decline_reason)
  const inputCls = 'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-claimtec-forest focus:outline-none focus:ring-1 focus:ring-claimtec-forest'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-bold text-claimtec-forest">New decline lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">
            Add a declined applicant manually. Affordability declines are priced instantly;
            non-contactable declines are traced. (In production these arrive on Absa's feed.)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name *"><input className={inputCls} value={form.full_name} onChange={set('full_name')} placeholder="Thabo Nkosi" /></Field>
            <Field label="Phone *"><input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="27821234567" /></Field>
            <Field label="Decline reason *">
              <select className={inputCls} value={form.decline_reason} onChange={set('decline_reason')}>
                <option>Affordability</option>
                <option>Unable to contact</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="ID number"><input className={inputCls} value={form.id_number ?? ''} onChange={set('id_number')} placeholder="8501125007087" /></Field>
            <Field label="Vehicle make"><input className={inputCls} value={form.vehicle_make ?? ''} onChange={set('vehicle_make')} placeholder="Volkswagen" /></Field>
            <Field label="Vehicle model"><input className={inputCls} value={form.vehicle_model ?? ''} onChange={set('vehicle_model')} placeholder="Tiguan" /></Field>
            <Field label="Vehicle price (R)"><input className={inputCls} value={form.vehicle_price ?? ''} onChange={set('vehicle_price')} placeholder="285000" /></Field>
            <Field label="Deposit (R)"><input className={inputCls} value={form.deposit_amount ?? ''} onChange={set('deposit_amount')} placeholder="25000" /></Field>
            {isAffordability && <>
              <Field label="Monthly income (R)"><input className={inputCls} value={form.monthly_income ?? ''} onChange={set('monthly_income')} placeholder="30000" /></Field>
              <Field label="Disposable income (R)"><input className={inputCls} value={form.disposable_income ?? ''} onChange={set('disposable_income')} placeholder="5000" /></Field>
            </>}
          </div>
          {err && <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={busy || !form.full_name || !form.phone}
            className="inline-flex items-center gap-1.5 rounded-md bg-claimtec-forest px-3 py-1.5 text-xs font-semibold text-white hover:bg-claimtec-forest-2 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create &amp; process
          </button>
        </div>
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
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
