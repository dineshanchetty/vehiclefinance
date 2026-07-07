/**
 * recovery.ts — queries for the decline-recovery platform (Workstreams A & B).
 * Follows the same rule as queries.ts: components never call supabase.from()
 * directly; they go through these functions.
 *
 * Columns must match packages/api/supabase/migrations/20260706000000_decline_recovery_layer0.sql.
 */
import { supabase } from './supabase'

export type DeclineReason = 'AFFORDABILITY' | 'NON_CONTACTABLE' | 'OTHER'
export type RecoveryWorkstream = 'A_UPSELL' | 'B_REACTIVATION' | 'NONE'
export type RecoveryStatus =
  | 'NEW' | 'ROUTED' | 'TRACING' | 'ENGAGING' | 'RE_ENGAGED'
  | 'RETURNED' | 'FUNDED' | 'OPTED_OUT' | 'UNREACHABLE' | 'CLOSED'

export interface DeclineLead {
  id: string
  source: string
  absa_ref: string
  decline_reason: DeclineReason
  decline_reason_raw: string | null
  workstream: RecoveryWorkstream
  recovery_status: RecoveryStatus
  full_name: string | null
  id_number: string | null
  phone: string | null
  email: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: number | null
  vehicle_price: number | null
  deposit_amount: number | null
  monthly_income: number | null
  disposable_income: number | null
  qualifying_ceiling: number | null
  traced_phone: string | null
  traced_email: string | null
  traced_address: string | null
  trace_source: string | null
  trace_confidence: number | null
  consent_basis: string | null
  recovery_deal_id: string | null
  raw_payload: Record<string, unknown> | null
  routed_at: string | null
  created_at: string
  updated_at: string
}

export interface RecoveryFunnel {
  total: number
  byWorkstream: { A_UPSELL: number; B_REACTIVATION: number; NONE: number }
  byStatus: Record<string, number>
  /** Workstream-A headline funnel: routed → priced → returned → funded. */
  aFunnel: { routed: number; priced: number; returned: number; funded: number }
  /** Workstream-B headline funnel: routed → traced → engaging → returned → unreachable. */
  bFunnel: { routed: number; traced: number; engaging: number; returned: number; unreachable: number }
  /** Funded across both workstreams — the headline recovered number. */
  funded: number
}

export interface ListLeadsOptions {
  workstream?: RecoveryWorkstream
  status?: RecoveryStatus
  reason?: DeclineReason
  limit?: number
}

export async function getDeclineLead(id: string): Promise<DeclineLead | null> {
  const { data, error } = await supabase
    .from('decline_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as DeclineLead | null) ?? null
}

export async function listDeclineLeads(opts: ListLeadsOptions = {}): Promise<DeclineLead[]> {
  const { workstream, status, reason, limit = 200 } = opts
  let q = supabase
    .from('decline_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (workstream) q = q.eq('workstream', workstream)
  if (status) q = q.eq('recovery_status', status)
  if (reason) q = q.eq('decline_reason', reason)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as DeclineLead[]
}

/** Aggregate the funnel. Small data volume → one read + client-side counts. */
export async function getRecoveryFunnel(): Promise<RecoveryFunnel> {
  const { data, error } = await supabase
    .from('decline_leads')
    .select('workstream, recovery_status, qualifying_ceiling, traced_phone')
    .limit(10000)
  if (error) throw error
  const rows = (data ?? []) as Pick<DeclineLead, 'workstream' | 'recovery_status' | 'qualifying_ceiling' | 'traced_phone'>[]

  const byWorkstream = { A_UPSELL: 0, B_REACTIVATION: 0, NONE: 0 }
  const byStatus: Record<string, number> = {}
  const aFunnel = { routed: 0, priced: 0, returned: 0, funded: 0 }
  const bFunnel = { routed: 0, traced: 0, engaging: 0, returned: 0, unreachable: 0 }
  let funded = 0

  for (const r of rows) {
    byWorkstream[r.workstream] = (byWorkstream[r.workstream] ?? 0) + 1
    byStatus[r.recovery_status] = (byStatus[r.recovery_status] ?? 0) + 1
    const isReturned = r.recovery_status === 'RETURNED' || r.recovery_status === 'FUNDED'
    if (r.recovery_status === 'FUNDED') funded++

    if (r.workstream === 'A_UPSELL') {
      aFunnel.routed++
      if (r.qualifying_ceiling != null) aFunnel.priced++
      if (isReturned) aFunnel.returned++
      if (r.recovery_status === 'FUNDED') aFunnel.funded++
    } else if (r.workstream === 'B_REACTIVATION') {
      bFunnel.routed++
      if (r.traced_phone != null) bFunnel.traced++
      if (r.recovery_status === 'ENGAGING' || r.recovery_status === 'RE_ENGAGED') bFunnel.engaging++
      if (isReturned) bFunnel.returned++
      if (r.recovery_status === 'UNREACHABLE') bFunnel.unreachable++
    }
  }
  return { total: rows.length, byWorkstream, byStatus, aFunnel, bFunnel, funded }
}
