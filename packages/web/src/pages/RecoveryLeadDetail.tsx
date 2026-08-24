import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, TrendingUp, PhoneOff, CheckCircle2, Phone,
  Building2, ShieldCheck, ArrowRight, MessageSquare, Bot,
} from 'lucide-react'
import { format } from 'date-fns'
import { getDeclineLead, getLeadConversation, type DeclineLead, type ConversationMessage } from '../lib/recovery'

function rand(n: number | null | undefined): string {
  if (n == null) return '—'
  return 'R ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-600', ROUTED: 'bg-sky-100 text-sky-800',
  TRACING: 'bg-amber-100 text-amber-800', ENGAGING: 'bg-amber-100 text-amber-800',
  RE_ENGAGED: 'bg-indigo-100 text-indigo-800', RETURNED: 'bg-claimtec-forest/10 text-claimtec-forest',
  FUNDED: 'bg-emerald-100 text-emerald-800', OPTED_OUT: 'bg-rose-100 text-rose-800',
  UNREACHABLE: 'bg-rose-100 text-rose-800', CLOSED: 'bg-gray-100 text-gray-500',
}

// The recovery lifecycle, in order, for the timeline.
const A_STEPS = ['ROUTED', 'RE_ENGAGED', 'RETURNED', 'FUNDED']
const B_STEPS = ['ROUTED', 'ENGAGING', 'RE_ENGAGED', 'RETURNED', 'FUNDED']
const STEP_LABEL: Record<string, string> = {
  ROUTED: 'Ingested & routed', ENGAGING: 'Traced · ready to contact',
  RE_ENGAGED: 'Customer re-engaged', RETURNED: 'Returned to Absa', FUNDED: 'Funded',
}

export function RecoveryLeadDetail() {
  const { id } = useParams<{ id: string }>()
  const [lead, setLead] = useState<DeclineLead | null>(null)
  const [convo, setConvo] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true); setError(null)
    getDeclineLead(id!)
      .then((l) => {
        if (!live) return
        setLead(l)
        if (l?.phone) getLeadConversation(l.phone).then((c) => { if (live) setConvo(c) }).catch(() => {})
      })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id])

  if (loading) return <Centered>Loading…</Centered>
  if (error) return <Centered><span className="text-red-600">{error}</span></Centered>
  if (!lead) return <Centered>Lead not found.</Centered>

  const isA = lead.workstream === 'A_UPSELL'
  const isB = lead.workstream === 'B_REACTIVATION'
  const steps = isB ? B_STEPS : A_STEPS
  const reachedIdx = steps.indexOf(lead.recovery_status)

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 pt-4 pb-3">
        <Link to="/recovery" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-claimtec-forest">
          <ArrowLeft className="h-3.5 w-3.5" /> Recovery
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-lg font-bold text-claimtec-forest">{lead.full_name ?? 'Unnamed applicant'}</h1>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[lead.recovery_status]}`}>
            {lead.recovery_status}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
            {isA ? <TrendingUp className="h-3.5 w-3.5" /> : <PhoneOff className="h-3.5 w-3.5" />}
            {isA ? 'Affordability upsell' : isB ? 'Contact reactivation' : 'Held'}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-xs text-gray-400">{lead.absa_ref} · {lead.decline_reason_raw ?? lead.decline_reason}</p>
      </div>

      <div className="px-6 py-4 space-y-4 max-w-4xl">
        {/* Recovery timeline */}
        <Card title="Recovery progress">
          <ol className="flex flex-wrap items-center gap-2">
            {steps.map((s, i) => {
              const done = reachedIdx >= i && reachedIdx >= 0
              return (
                <li key={s} className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    done ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-400'}`}>
                    {done && <CheckCircle2 className="h-3 w-3" />}{STEP_LABEL[s]}
                  </span>
                  {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-gray-300" />}
                </li>
              )
            })}
          </ol>
          {(lead.recovery_status === 'UNREACHABLE' || lead.recovery_status === 'OPTED_OUT') && (
            <p className="mt-2 text-xs text-rose-600">
              {lead.recovery_status === 'UNREACHABLE'
                ? 'Tracing + contact exhausted — no reachable details found.'
                : 'Customer opted out — suppressed from all further contact.'}
            </p>
          )}
        </Card>

        {/* The recovery outcome — A pricing or B tracing */}
        {isA && (
          <Card title="Upsell — qualifying amount" icon={<TrendingUp className="h-4 w-4 text-claimtec-forest" />}>
            <div className="flex items-center gap-4">
              <Metric label="Applied for" value={rand(lead.vehicle_price)} muted />
              <ArrowRight className="h-5 w-5 text-emerald-500" />
              <Metric label="Qualifies for" value={rand(lead.qualifying_ceiling)} strong />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
              <Row k="Monthly income" v={rand(lead.monthly_income)} />
              <Row k="Disposable income" v={rand(lead.disposable_income)} />
              <Row k="Deposit" v={rand(lead.deposit_amount)} />
              <Row k="Original vehicle" v={[lead.vehicle_make, lead.vehicle_model, lead.vehicle_year].filter(Boolean).join(' ') || '—'} />
            </div>
            {lead.qualifying_ceiling == null && (
              <p className="mt-2 text-xs text-amber-600">Not yet priced — run the pricing pass (recovery-process).</p>
            )}
          </Card>
        )}

        {isB && (
          <Card title="Reactivation — contact tracing" icon={<Phone className="h-4 w-4 text-claimtec-forest" />}>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
              <Row k="Number on file (dead)" v={lead.phone ? <span className="line-through text-gray-400">{lead.phone}</span> : '—'} />
              <Row k="Traced number" v={lead.traced_phone
                ? <span className="font-semibold text-claimtec-forest">+{lead.traced_phone}</span>
                : <span className="text-amber-600">not yet traced</span>} />
              <Row k="Trace source" v={lead.trace_source ?? '—'} />
              <Row k="Confidence" v={lead.trace_confidence != null ? `${Math.round(lead.trace_confidence * 100)}%` : '—'} />
              {lead.traced_email && <Row k="Traced email" v={lead.traced_email} />}
              {lead.traced_address && <Row k="Traced address" v={lead.traced_address} />}
            </div>
          </Card>
        )}

        {/* WhatsApp conversation — the journey, live */}
        <Card
          title={`Conversation ${convo.length ? `(${convo.length})` : ''}`}
          icon={<MessageSquare className="h-4 w-4 text-emerald-600" />}
        >
          {convo.length === 0 ? (
            <p className="text-xs text-gray-400">No messages yet — the journey starts when the customer is contacted.</p>
          ) : (
            <div className="rounded-lg bg-[#ECE5DD] p-3 max-h-96 overflow-y-auto space-y-1.5">
              {convo.map((m) => {
                const outbound = m.role === 'assistant'
                const isFollowup = m.tool_use && (m.tool_use as { source?: string }).source === 'recovery-followup'
                return (
                  <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-lg px-2.5 py-1.5 text-xs shadow-sm ${
                      outbound ? 'bg-[#DCF8C6] text-gray-900' : 'bg-white text-gray-900'}`}>
                      {outbound && (
                        <div className="flex items-center gap-1 text-[9px] font-semibold text-emerald-700 mb-0.5">
                          <Bot className="h-2.5 w-2.5" /> {isFollowup ? 'Claimtec · auto follow-up' : 'Claimtec'}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <div className="text-[9px] text-gray-400 text-right mt-0.5">
                        {new Date(m.created_at).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Original decline record */}
        <Card title="Decline record from Absa" icon={<Building2 className="h-4 w-4 text-gray-500" />}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
            <Row k="Absa reference" v={<span className="font-mono">{lead.absa_ref}</span>} />
            <Row k="Decline reason" v={lead.decline_reason_raw ?? lead.decline_reason} />
            <Row k="ID number" v={lead.id_number ?? '—'} />
            <Row k="Email on file" v={lead.email ?? '—'} />
            <Row k="Received" v={format(new Date(lead.created_at), 'dd MMM yyyy, HH:mm')} />
            <Row k="Routed" v={lead.routed_at ? format(new Date(lead.routed_at), 'dd MMM yyyy, HH:mm') : '—'} />
          </div>
        </Card>

        {/* Compliance */}
        <Card title="Consent & compliance" icon={<ShieldCheck className="h-4 w-4 text-gray-500" />}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
            <Row k="Consent basis" v={lead.consent_basis ?? <span className="text-amber-600">not recorded</span>} />
            <Row k="Source" v={lead.source} />
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Outbound re-contact is held pending template approval (G2) and written consent confirmation (G1).
          </p>
        </Card>
      </div>
    </div>
  )
}

// ─── small presentational helpers ─────────────────────────────────────────────
function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900">{icon}{title}</h3>
      {children}
    </div>
  )
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-50 py-0.5">
      <span className="text-gray-500">{k}</span>
      <span className="text-right text-gray-900">{v}</span>
    </div>
  )
}
function Metric({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${strong ? 'text-claimtec-forest' : muted ? 'text-gray-400' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-gray-400">{children}</div>
}
