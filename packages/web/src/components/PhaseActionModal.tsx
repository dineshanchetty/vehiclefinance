import { useState, useEffect } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { X, Loader2, AlertCircle, CheckCircle2, Send, ChevronRight, ClipboardList, ExternalLink, Activity, Bot, MessageSquare, FileText } from 'lucide-react'
import { phaseDisplayName, PHASES } from './PhaseTimeline'
import { getPhaseWorkflow, type PhaseAction, type ActionTone } from '../lib/phaseWorkflows'
import { listTasks, listDocuments } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/auth'
import type { DealWithRelations, TaskWithDeal, Document } from '../types/database'

// Map phase → audit event types that signal completion via the WhatsApp flow.
// Used to render a "Completed signals" timeline so ops can see what the bot
// already did before deciding whether to approve/decline.
const PHASE_SIGNAL_EVENTS: Record<string, string[]> = {
  POPIA_CONSENT:     ['popia_consent_granted', 'popia_consent_received', 'consent_granted'],
  OFFER_TO_PURCHASE: ['otp_uploaded', 'otp_extracted', 'DOCUMENT_EXTRACTED'],
  PRICE_GATE:        ['price_captured', 'price_gate_passed'],
  ID_DOC:            ['id_uploaded', 'id_verified', 'DOCUMENT_EXTRACTED'],
  PROOF_OF_ADDRESS:  ['poa_uploaded', 'address_verified', 'DOCUMENT_EXTRACTED'],
  BANK_STATEMENTS:   ['bank_statement_uploaded', 'bank_statements_uploaded', 'DOCUMENT_EXTRACTED'],
  AFFORDABILITY:     ['affordability_confirmed', 'affordability_assessed', 'ops_affordability_approved'],
  SELLER_NOTIFY:     ['seller_invited', 'ops_seller_invited', 'seller_responded'],
  CREDIT_DECISION:   ['credit_approved', 'credit_declined', 'ops_credit_approved', 'ops_credit_declined'],
  INSPECTION_REVIEW: ['inspection_passed', 'inspection_failed', 'ops_inspection_passed'],
  QUOTE:             ['quote_accepted', 'quote_declined', 'ops_quote_accepted'],
  CONTRACT:          ['contract_signed', 'ops_contract_signed'],
  HANDOVER:          ['handover_confirmed', 'ops_handover_confirmed'],
  PAYOUT:            ['paid_out', 'ops_payout_confirmed'],
  DONE:              [],
}

// Map phase → relevant document doc_types so we can show "buyer uploaded
// SA_ID_SMART_CARD at 14:32" inline.
const PHASE_DOC_TYPES: Record<string, string[]> = {
  OFFER_TO_PURCHASE: ['OFFER_TO_PURCHASE'],
  ID_DOC:            ['SA_ID_SMART_CARD', 'SA_ID_GREEN_BOOK'],
  PROOF_OF_ADDRESS:  ['PROOF_OF_ADDRESS'],
  BANK_STATEMENTS:   ['BANK_STATEMENT'],
  CONTRACT:          ['BUYER_FINANCE_AGREEMENT', 'SELLER_AGREEMENT'],
}

interface AuditEventRow {
  id: string
  event_type: string
  created_at: string
  actor: string | null
  actor_type: string | null
  details: Record<string, unknown> | null
}

// Each phase surfaces tasks from these queues as a shortcut. Lets ops jump
// from the journey strip straight to the tasks they need to clear without
// going to the global Queues sidebar.
const PHASE_TO_QUEUES: Record<string, string[]> = {
  POPIA_CONSENT:     [],
  OFFER_TO_PURCHASE: ['Q_BUYER_DOC_REVIEW', 'Q_MISMATCH_REVIEW'],
  PRICE_GATE:        ['Q_FNI_REVIEW'],
  ID_DOC:            ['Q_BUYER_DOC_REVIEW', 'Q_HUMAN_ESCALATION'],
  PROOF_OF_ADDRESS:  ['Q_BUYER_DOC_REVIEW'],
  BANK_STATEMENTS:   ['Q_BUYER_DOC_REVIEW'],
  AFFORDABILITY:     ['Q_FNI_REVIEW'],
  SELLER_NOTIFY:     ['Q_SELLER_FOLLOWUP', 'Q_SELLER_DOC_REVIEW'],
  CREDIT_DECISION:   ['Q_FNI_REVIEW', 'Q_DEAL_APPROVAL'],
  INSPECTION_REVIEW: ['Q_HARTCON_INSPECTION'],
  QUOTE:             ['Q_FNI_QUOTE_PREP'],
  CONTRACT:          ['Q_BUYER_CONTRACT', 'Q_SELLER_CONTRACT'],
  HANDOVER:          ['Q_DEAL_APPROVAL'],
  PAYOUT:            ['Q_DEAL_APPROVAL'],
  DONE:              ['Q_NATIS_FULFILMENT'],
}

const PRIORITY_PILL: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-indigo-100 text-indigo-700',
  HIGH: 'bg-orange-100 text-orange-800',
  URGENT: 'bg-red-100 text-red-800',
}

const TONE_BTN: Record<ActionTone, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  danger:  'bg-rose-600    hover:bg-rose-700    text-white',
  warn:    'bg-amber-500   hover:bg-amber-600   text-white',
  neutral: 'bg-gray-200    hover:bg-gray-300    text-gray-800',
}

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? 'http://localhost:3001'

interface Props {
  deal: DealWithRelations
  phaseKey: string
  onClose: () => void
  onChanged: (next: { current_phase: string | null; completed_milestones: string[]; status?: string }) => void
}

/**
 * PhaseActionModal — opens when ops clicks a phase pill in the Deal Journey.
 * Shows the workflow for that phase: requirements checklist + action buttons
 * (approve / decline / re-send / etc). Decline-style actions trigger the
 * reason modal which lets ops type a reason + send a WhatsApp message.
 */
export function PhaseActionModal({ deal, phaseKey, onClose, onChanged }: Props) {
  const profile = useProfile()
  const wf = getPhaseWorkflow(phaseKey)
  const phaseLabel = phaseDisplayName(phaseKey)
  const phaseIdx = PHASES.findIndex((p) => p.key === phaseKey)

  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState<PhaseAction | null>(null)
  const [phaseTasks, setPhaseTasks] = useState<TaskWithDeal[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [tasksReload, setTasksReload] = useState(0)
  const [signalEvents, setSignalEvents] = useState<AuditEventRow[]>([])
  const [phaseDocs, setPhaseDocs] = useState<Document[]>([])
  const [signalsLoading, setSignalsLoading] = useState(true)

  // Fetch tasks for this deal, filter to the queues this phase cares about.
  useEffect(() => {
    let alive = true
    const queues = PHASE_TO_QUEUES[phaseKey] ?? []
    setTasksLoading(true)
    listTasks({ dealId: deal.id, limit: 100 })
      .then((all) => {
        if (!alive) return
        const filtered = queues.length === 0
          ? []
          : all.filter((t) => t.queue && queues.includes(t.queue))
        setPhaseTasks(filtered)
      })
      .catch((e) => { if (alive) console.warn('[PhaseActionModal] task load failed:', e) })
      .finally(() => { if (alive) setTasksLoading(false) })
    return () => { alive = false }
  }, [deal.id, phaseKey, tasksReload])

  const openCount = phaseTasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS' || t.status === 'ESCALATED').length
  const doneCount = phaseTasks.filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED').length

  // Fetch the audit events + docs that signal phase completion via WhatsApp.
  useEffect(() => {
    let alive = true
    setSignalsLoading(true)
    const eventTypes = PHASE_SIGNAL_EVENTS[phaseKey] ?? []
    const docTypes = PHASE_DOC_TYPES[phaseKey] ?? []
    Promise.all([
      eventTypes.length === 0
        ? Promise.resolve({ data: [] as AuditEventRow[] })
        : supabase
            .from('audit_events')
            .select('id, event_type, created_at, actor, actor_type, details')
            .eq('deal_id', deal.id)
            .in('event_type', eventTypes)
            .order('created_at', { ascending: false })
            .limit(20)
            .then((r) => ({ data: (r.data ?? []) as unknown as AuditEventRow[] })),
      docTypes.length === 0
        ? Promise.resolve([] as Document[])
        : listDocuments(deal.id).then((all) => all.filter((d) => d.doc_type && docTypes.includes(d.doc_type))),
    ])
      .then(([eventsRes, docs]) => {
        if (!alive) return
        setSignalEvents(eventsRes.data)
        setPhaseDocs(docs)
      })
      .catch((e) => { if (alive) console.warn('[PhaseActionModal] signals load failed:', e) })
      .finally(() => { if (alive) setSignalsLoading(false) })
    return () => { alive = false }
  }, [deal.id, phaseKey])

  // Did the WhatsApp flow already complete this phase? Used for the header pill.
  const milestones = (deal as DealWithRelations & { completed_milestones?: string[] }).completed_milestones ?? []
  const phasePhases = PHASES.find((p) => p.key === phaseKey)
  const milestoneMet = phasePhases?.milestones.some((m) => milestones.includes(m)) ?? false
  const hasSignals = signalEvents.length > 0 || phaseDocs.length > 0 || milestoneMet

  async function handleQuickComplete(taskId: string) {
    setBusy(`task:${taskId}`)
    try {
      await supabase
        .from('tasks')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() } as never)
        .eq('id', taskId)
      await supabase.from('audit_events').insert({
        deal_id: deal.id,
        event_type: 'ops_task_completed_from_phase',
        actor: profile?.id ?? null,
        actor_type: 'ops_user',
        details: { task_id: taskId, from_phase: phaseKey },
      } as never)
      setTasksReload((n) => n + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Task update failed')
    } finally {
      setBusy(null)
    }
  }

  const buyer = deal.buyer
  const seller = deal.seller
  const buyerFirst = buyer?.full_name?.split(/\s+/)[0] ?? 'there'
  const sellerFirst = seller?.full_name?.split(/\s+/)[0] ?? 'there'

  async function applyAction(action: PhaseAction, reason: string | null, whatsappBody: string | null) {
    setBusy(action.id); setErr(null)
    try {
      // 1. Deal patch (phase / status / milestones)
      const dealPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (action.advanceToPhase) dealPatch.current_phase = action.advanceToPhase
      if (action.setDealStatus) dealPatch.status = action.setDealStatus

      let nextMilestones = (deal as DealWithRelations & { completed_milestones?: string[] }).completed_milestones ?? []
      if (action.markMilestone && !nextMilestones.includes(action.markMilestone)) {
        nextMilestones = [...nextMilestones, action.markMilestone]
        dealPatch.completed_milestones = nextMilestones
      }

      if (Object.keys(dealPatch).length > 1) {
        const { error } = await supabase.from('deals').update(dealPatch as never).eq('id', deal.id)
        if (error) throw error
      }

      // 2. Audit
      if (action.auditEventType) {
        await supabase.from('audit_events').insert({
          deal_id: deal.id,
          event_type: action.auditEventType,
          actor: profile?.id ?? null,
          actor_type: 'ops_user',
          details: {
            phase: phaseKey,
            action_id: action.id,
            reason: reason ?? null,
            advanced_to: action.advanceToPhase ?? null,
            milestone: action.markMilestone ?? null,
          },
        } as never).then(({ error }) => {
          if (error) console.warn('[PhaseAction] audit insert failed:', error.message)
        })
      }

      // 3. WhatsApp message
      if (whatsappBody) {
        const targetPhone = action.whatsappTarget === 'seller' ? seller?.phone : buyer?.phone
        if (targetPhone) {
          const res = await fetch(`${BOT_API_URL}/api/ops-send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: targetPhone,
              message: whatsappBody,
              deal_id: deal.id,
              ops_user_id: profile?.id ?? null,
            }),
          })
          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(`WhatsApp dispatch failed (${res.status}): ${text.slice(0, 200)}`)
          }
        }
      }

      // 4. Optional bot endpoint
      if (action.botEndpoint) {
        const res = await fetch(`${BOT_API_URL}${action.botEndpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deal_id: deal.id, ops_user_id: profile?.id ?? null }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`${action.botEndpoint} failed (${res.status}): ${text.slice(0, 200)}`)
        }
      }

      const currentPhase = (deal as DealWithRelations & { current_phase?: string | null }).current_phase ?? null
      onChanged({
        current_phase: action.advanceToPhase ?? currentPhase,
        completed_milestones: nextMilestones,
        status: action.setDealStatus,
      })
      setPending(null)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  function handleAction(action: PhaseAction) {
    if (action.requiresReason || action.whatsappTemplate) {
      setPending(action); return
    }
    applyAction(action, null, null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
              {phaseIdx >= 0 ? `Step ${phaseIdx + 1} of ${PHASES.length}` : 'Phase'}
            </p>
            <h3 className="text-sm font-semibold text-gray-900">{phaseLabel}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Hint */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
            <p className="text-xs text-indigo-900">{wf.hint}</p>
          </div>

          {/* Checklist */}
          {wf.checklist && wf.checklist.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Validation requirements
              </p>
              <ul className="space-y-1">
                {wf.checklist.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                    <ChevronRight className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Activity / Signals — what already happened via the WhatsApp flow */}
          {(PHASE_SIGNAL_EVENTS[phaseKey]?.length ?? 0) > 0 || (PHASE_DOC_TYPES[phaseKey]?.length ?? 0) > 0 ? (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" /> Activity & signals
                </p>
                {milestoneMet && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5">
                    Milestone met
                  </span>
                )}
              </div>

              {signalsLoading ? (
                <div className="text-xs text-gray-400 italic flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : !hasSignals ? (
                <p className="text-xs text-gray-400 italic">
                  No signals yet — the buyer hasn't completed this step on WhatsApp.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {/* Document signals */}
                  {phaseDocs.map((d) => (
                    <SignalRow
                      key={`doc:${d.id}`}
                      icon={<FileText className="h-3 w-3" />}
                      tone={d.status === 'extracted' ? 'good' : d.status === 'failed' ? 'bad' : 'neutral'}
                      title={`${d.doc_type?.replace(/_/g, ' ')} ${d.status === 'extracted' ? 'extracted' : `(${d.status})`}`}
                      subtitle={d.file_name ?? `Document ${d.id.slice(0, 8)}`}
                      timestamp={d.upload_timestamp ?? d.created_at}
                    />
                  ))}
                  {/* Audit signals */}
                  {signalEvents.slice(0, 6).map((ev) => (
                    <SignalRow
                      key={`ev:${ev.id}`}
                      icon={ev.actor_type === 'ops_user' ? <MessageSquare className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                      tone={
                        /declined|failed|fraud/.test(ev.event_type) ? 'bad'
                        : /approved|granted|passed|extracted|confirmed|signed|completed/.test(ev.event_type) ? 'good'
                        : 'neutral'
                      }
                      title={ev.event_type.replace(/_/g, ' ').replace(/^ops /, '')}
                      subtitle={ev.actor_type === 'ops_user' ? 'Ops action' : 'Bot / WhatsApp flow'}
                      timestamp={ev.created_at}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Linked tasks panel + progress */}
          {(PHASE_TO_QUEUES[phaseKey]?.length ?? 0) > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
                  <ClipboardList className="h-3.5 w-3.5" /> Linked tasks
                </p>
                {phaseTasks.length > 0 && (
                  <span className="text-[10px] text-gray-500">
                    {doneCount}/{phaseTasks.length} done
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {phaseTasks.length > 0 && (
                <div className="mb-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round((doneCount / phaseTasks.length) * 100)}%` }}
                  />
                </div>
              )}

              {/* Task list */}
              {tasksLoading ? (
                <div className="text-xs text-gray-400 italic flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading tasks…
                </div>
              ) : phaseTasks.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No tasks queued for this phase.</p>
              ) : (
                <div className="space-y-1.5">
                  {phaseTasks.map((t) => {
                    const isOpen = t.status === 'PENDING' || t.status === 'IN_PROGRESS' || t.status === 'ESCALATED'
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                          isOpen ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50'
                        }`}
                      >
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0 ${PRIORITY_PILL[t.priority] ?? PRIORITY_PILL.NORMAL}`}>
                          {t.priority}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs truncate ${isOpen ? 'text-gray-900 font-medium' : 'text-gray-500 line-through'}`}>
                            {t.task_type ?? 'Task'}
                          </p>
                          {t.notes && isOpen && <p className="text-[10px] text-gray-500 truncate">{t.notes}</p>}
                        </div>
                        {isOpen ? (
                          <button
                            type="button"
                            onClick={() => handleQuickComplete(t.id)}
                            disabled={busy === `task:${t.id}`}
                            className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
                            title="Mark task complete"
                          >
                            {busy === `task:${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Done'}
                          </button>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        )}
                        <a
                          href={`/queue/${t.queue}`}
                          className="text-gray-400 hover:text-indigo-600"
                          title="Open in queue"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )
                  })}
                </div>
              )}

              {phaseTasks.length > 0 && openCount === 0 && (
                <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> All linked tasks cleared.
                </p>
              )}
            </div>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {/* Actions */}
          {wf.actions.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No actions available for this phase.</p>
          ) : (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Action
              </p>
              <div className="flex flex-wrap gap-2">
                {wf.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleAction(action)}
                    disabled={busy != null}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${TONE_BTN[action.tone]}`}
                  >
                    {busy === action.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : action.tone === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" />
                      : action.tone === 'danger'  ? <AlertCircle  className="h-3.5 w-3.5" />
                      : action.tone === 'primary' ? <Send         className="h-3.5 w-3.5" />
                      : null}
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>

      {pending && (
        <ReasonModal
          action={pending}
          buyerFirst={buyerFirst}
          sellerFirst={sellerFirst}
          buyerPhone={buyer?.phone ?? null}
          sellerPhone={seller?.phone ?? null}
          busy={busy === pending.id}
          onCancel={() => setPending(null)}
          onConfirm={(reason, body) => applyAction(pending, reason, body)}
        />
      )}
    </div>
  )
}

function SignalRow({
  icon, tone, title, subtitle, timestamp,
}: {
  icon: React.ReactNode
  tone: 'good' | 'bad' | 'neutral'
  title: string
  subtitle?: string
  timestamp: string | null | undefined
}) {
  const TONE = {
    good:    { dot: 'bg-emerald-500', text: 'text-emerald-700' },
    bad:     { dot: 'bg-rose-500',    text: 'text-rose-700'    },
    neutral: { dot: 'bg-gray-300',    text: 'text-gray-700'    },
  } as const
  return (
    <div className="flex items-start gap-2 rounded-md border border-gray-100 bg-white px-2.5 py-1.5">
      <span className={`mt-0.5 inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${TONE[tone].dot}`} />
      <span className={`flex-shrink-0 ${TONE[tone].text}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate capitalize">{title}</p>
        {subtitle && <p className="text-[10px] text-gray-500 truncate">{subtitle}</p>}
      </div>
      {timestamp && (
        <span
          className="text-[10px] text-gray-400 flex-shrink-0"
          title={format(new Date(timestamp), 'dd MMM yyyy HH:mm')}
        >
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </span>
      )}
    </div>
  )
}

function ReasonModal({
  action, buyerFirst, sellerFirst, buyerPhone, sellerPhone,
  busy, onCancel, onConfirm,
}: {
  action: PhaseAction
  buyerFirst: string
  sellerFirst: string
  buyerPhone: string | null
  sellerPhone: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string, whatsappBody: string | null) => void
}) {
  const target = action.whatsappTarget ?? 'buyer'
  const targetFirst = target === 'seller' ? sellerFirst : buyerFirst
  const targetPhone = target === 'seller' ? sellerPhone : buyerPhone

  const [reason, setReason] = useState('')
  const [sendIt, setSendIt] = useState<boolean>(!!action.whatsappTemplate && !!targetPhone)
  const [body, setBody] = useState('')

  function handleReasonChange(v: string) {
    setReason(v)
    if (action.whatsappTemplate) {
      const next = action.whatsappTemplate
        .replace(/{{first_name}}/g, targetFirst)
        .replace(/{{reason}}/g, v || '(reason)')
      setBody(next)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{action.label}</h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          {(action.requiresReason || action.tone === 'danger') && (
            <label className="block">
              <span className="text-xs font-medium text-gray-700">
                Reason {action.tone === 'danger' && <span className="text-rose-600">*</span>}
              </span>
              <textarea
                value={reason}
                onChange={(e) => handleReasonChange(e.target.value)}
                rows={2}
                autoFocus
                placeholder="Brief reason — visible in audit log."
                className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </label>
          )}

          {action.whatsappTemplate && targetPhone && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={sendIt}
                  onChange={(e) => setSendIt(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Send WhatsApp message to {target} ({targetPhone})
              </label>
              {sendIt && (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none bg-white"
                />
              )}
              <p className="text-[10px] text-gray-400">
                Free-form text only works inside the 24h customer-care window. Outside it, this needs a pre-approved template.
              </p>
            </div>
          )}

          {action.whatsappTemplate && !targetPhone && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No {target} phone on file — the message can't be sent. The action will still record in audit.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 rounded-b-xl">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim(), sendIt ? body.trim() : null)}
            disabled={busy || (action.tone === 'danger' && !reason.trim())}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${TONE_BTN[action.tone]}`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
