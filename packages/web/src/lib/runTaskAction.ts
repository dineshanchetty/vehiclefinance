/**
 * runTaskAction — applies the side effects of a workflow action:
 *   1. Update task status (+ optional notes)
 *   2. Append audit_events row
 *   3. Optionally update the deal's current_phase / completed_milestones / status
 *   4. Optionally send a decline / info message to the buyer via the bot's
 *      ops-send-message endpoint (which writes to conversation_messages and
 *      forwards via Dialog360).
 */
import { supabase } from './supabase'
import type { WorkflowAction } from './taskWorkflows'

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? 'http://localhost:3001'

export interface RunActionInput {
  task: { id: string; deal_id: string; task_type: string | null; queue: string | null }
  action: WorkflowAction
  reason?: string | null
  /** Final WhatsApp body (already templated by the modal). */
  buyerMessage?: string | null
  /** Buyer phone (pulled from the deal) — needed to send the WhatsApp message. */
  buyerPhone?: string | null
  /** Current ops user id, for audit attribution. */
  actor?: string | null
}

export async function runTaskAction(input: RunActionInput): Promise<void> {
  const { task, action, reason, buyerMessage, buyerPhone, actor } = input

  // 1. Update task
  const taskPatch: Record<string, unknown> = {}
  if (action.taskStatus) taskPatch.status = action.taskStatus
  if (action.taskStatus === 'COMPLETED') taskPatch.completed_at = new Date().toISOString()
  if (reason) taskPatch.notes = `${task.task_type}: ${action.label} — ${reason}`
  if (Object.keys(taskPatch).length > 0) {
    const { error } = await supabase.from('tasks').update(taskPatch as never).eq('id', task.id)
    if (error) throw new Error(`Task update failed: ${error.message}`)
  }

  // 2. Audit event (best-effort — don't block other side effects on this)
  if (action.auditEventType) {
    await supabase
      .from('audit_events')
      .insert({
        deal_id: task.deal_id,
        event_type: action.auditEventType,
        actor: actor ?? null,
        actor_type: 'ops_user',
        details: {
          task_id: task.id,
          task_type: task.task_type,
          queue: task.queue,
          action_id: action.id,
          reason: reason ?? null,
        },
      } as never)
      .then(({ error }) => {
        if (error) console.warn('[runTaskAction] audit insert failed:', error.message)
      })
  }

  // 3. Deal updates
  const dealPatch: Record<string, unknown> = {}
  if (action.advancePhase) dealPatch.current_phase = action.advancePhase.current_phase
  if (action.setDealStatus) dealPatch.status = action.setDealStatus
  if (Object.keys(dealPatch).length > 0) {
    dealPatch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('deals').update(dealPatch as never).eq('id', task.deal_id)
    if (error) console.warn('[runTaskAction] deal update failed:', error.message)
  }
  if (action.advancePhase?.milestone) {
    // Read existing milestones, append, write back. Single round-trip.
    const { data, error: readErr } = await supabase
      .from('deals')
      .select('completed_milestones')
      .eq('id', task.deal_id)
      .single()
    if (!readErr && data) {
      const existing = ((data as { completed_milestones?: string[] | null }).completed_milestones ?? [])
      if (!existing.includes(action.advancePhase.milestone)) {
        const next = [...existing, action.advancePhase.milestone]
        await supabase.from('deals').update({ completed_milestones: next } as never).eq('id', task.deal_id)
      }
    }
  }

  // 4. Buyer-facing WhatsApp message
  if (buyerMessage && buyerPhone) {
    const res = await fetch(`${BOT_API_URL}/api/ops-send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: buyerPhone,
        message: buyerMessage,
        deal_id: task.deal_id,
        ops_user_id: actor ?? null,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Buyer message dispatch failed (${res.status}): ${text.slice(0, 200)}`)
    }
  }
}
