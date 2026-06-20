import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  CheckCircle2, AlertCircle, ExternalLink, Loader2, Send, ChevronRight,
} from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { SLAIndicator } from './SLAIndicator'
import { getWorkflow, type WorkflowAction, type ActionTone } from '../lib/taskWorkflows'
import { runTaskAction } from '../lib/runTaskAction'
import { useProfile } from '../lib/auth'
import type { TaskWithDeal } from '../types/database'

const TONE_BTN: Record<ActionTone, string> = {
  primary: 'bg-claimtec-forest hover:bg-claimtec-forest-2 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  danger:  'bg-rose-600    hover:bg-rose-700    text-white',
  warn:    'bg-amber-500   hover:bg-amber-600   text-white',
  neutral: 'bg-gray-200    hover:bg-gray-300    text-gray-800',
}

const PRIORITY_PILL: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-claimtec-forest/10 text-claimtec-forest-2',
  HIGH: 'bg-orange-100 text-orange-800',
  URGENT: 'bg-red-100 text-red-800',
}

interface Props {
  task: TaskWithDeal
  onChanged: () => void
}

export function TaskWorkflowCard({ task, onChanged }: Props) {
  const profile = useProfile()
  const wf = getWorkflow(task.queue, task.task_type)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<WorkflowAction | null>(null)

  const buyerFirstName = task.deal?.buyer?.full_name?.split(/\s+/)[0] ?? 'there'
  const buyerPhone = task.deal?.buyer?.phone ?? null
  const vehicle = task.deal?.vehicle
  const vehicleSummary = vehicle
    ? `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim()
    : null

  async function handleSimpleAction(action: WorkflowAction) {
    if (action.requiresReason) { setPending(action); return }
    setBusy(action.id); setError(null)
    try {
      await runTaskAction({
        task: { id: task.id, deal_id: task.deal_id, task_type: task.task_type, queue: task.queue },
        action, actor: profile?.id ?? null,
      })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleConfirmedAction(reason: string, buyerMessage: string | null) {
    if (!pending) return
    setBusy(pending.id); setError(null)
    try {
      await runTaskAction({
        task: { id: task.id, deal_id: task.deal_id, task_type: task.task_type, queue: task.queue },
        action: pending,
        reason,
        buyerMessage,
        buyerPhone,
        actor: profile?.id ?? null,
      })
      setPending(null)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_PILL[task.priority] ?? PRIORITY_PILL.NORMAL}`}>
              {task.priority}
            </span>
            <StatusBadge status={task.status} variant="sm" />
            <h3 className="text-sm font-semibold text-gray-900">{task.task_type}</h3>
          </div>
          {task.deal && (
            <p className="mt-1 text-xs text-gray-500">
              Deal{' '}
              <Link to={`/deals/${task.deal_id}`} className="font-medium text-claimtec-forest hover:underline">
                {task.deal.deal_number ?? task.deal_id.slice(0, 8)}
              </Link>
              {task.deal.buyer?.full_name && <> · {task.deal.buyer.full_name}</>}
              {vehicleSummary && <> · {vehicleSummary}</>}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {task.due_at && <SLAIndicator dueAt={task.due_at} />}
          {task.created_at && (
            <span className="text-[10px] text-gray-400">
              created {format(new Date(task.created_at), 'dd MMM HH:mm')}
            </span>
          )}
        </div>
      </div>

      {/* Workflow hint */}
      <div className="rounded-lg border border-claimtec-forest/10 bg-claimtec-forest/5/40 px-3 py-2.5 mb-3">
        <p className="text-xs text-claimtec-ink">{wf.hint}</p>
        {task.notes && (
          <p className="mt-1.5 text-xs text-gray-600 border-t border-claimtec-forest/10 pt-1.5">
            <span className="font-semibold text-gray-700">Note:</span> {task.notes}
          </p>
        )}
      </div>

      {/* Checklist */}
      {wf.checklist && wf.checklist.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Before you act
          </p>
          <ul className="space-y-1">
            {wf.checklist.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-gray-700">
                <ChevronRight className="h-3 w-3 text-gray-400" /> {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {wf.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busy != null}
            onClick={() => handleSimpleAction(action)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${TONE_BTN[action.tone]}`}
          >
            {busy === action.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : action.tone === 'success'
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : action.tone === 'danger'
                ? <AlertCircle className="h-3.5 w-3.5" />
                : null}
            {action.label}
          </button>
        ))}
        {task.deal_id && (
          <Link
            to={`/deals/${task.deal_id}`}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            Open deal <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Decline / reason modal */}
      {pending && (
        <ReasonModal
          action={pending}
          buyerFirstName={buyerFirstName}
          buyerPhone={buyerPhone}
          dealNumber={task.deal?.deal_number ?? null}
          busy={busy === pending.id}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirmedAction}
        />
      )}
    </div>
  )
}

function ReasonModal({
  action, buyerFirstName, buyerPhone, dealNumber, busy, onCancel, onConfirm,
}: {
  action: WorkflowAction
  buyerFirstName: string
  buyerPhone: string | null
  dealNumber: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string, buyerMessage: string | null) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [sendToBuyer, setSendToBuyer] = useState<boolean>(!!action.whatsappTemplate && !!buyerPhone)
  const [draftMessage, setDraftMessage] = useState('')

  // Render the template once we have a reason — keeps draft in sync.
  function renderTemplate(): string {
    const t = action.whatsappTemplate ?? ''
    return t
      .replace(/{{first_name}}/g, buyerFirstName)
      .replace(/{{reason}}/g, reason || '(reason)')
  }

  // First time the user types, populate the draft from the template.
  function handleReasonChange(v: string) {
    setReason(v)
    if (action.whatsappTemplate && (!draftMessage || draftMessage === renderTemplate() || draftMessage === '')) {
      setDraftMessage(action.whatsappTemplate
        .replace(/{{first_name}}/g, buyerFirstName)
        .replace(/{{reason}}/g, v || '(reason)'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{action.label}</h3>
          {dealNumber && <p className="text-xs text-gray-500">Deal {dealNumber}</p>}
        </div>
        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Reason {action.tone === 'danger' && <span className="text-rose-600">*</span>}</span>
            <textarea
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Brief reason for this action — visible to ops + audit log."
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
            />
          </label>

          {action.whatsappTemplate && buyerPhone && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={sendToBuyer}
                  onChange={(e) => setSendToBuyer(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Send WhatsApp message to buyer ({buyerPhone})
              </label>
              {sendToBuyer && (
                <textarea
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  rows={5}
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-claimtec-forest focus:outline-none bg-white"
                  placeholder="Message to buyer…"
                />
              )}
              {sendToBuyer && (
                <p className="text-[10px] text-gray-400">
                  Free-form text only works inside the 24h customer-care window. Outside it, this needs a pre-approved template.
                </p>
              )}
            </div>
          )}

          {action.whatsappTemplate && !buyerPhone && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No buyer phone on file — the WhatsApp message can't be sent. The action will still record the decision in audit.
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
            onClick={() => onConfirm(reason.trim(), sendToBuyer ? draftMessage.trim() : null)}
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
