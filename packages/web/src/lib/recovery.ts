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

// ─── Ops report — what's working, what's failing ─────────────────────────────

/** The row shape the report needs (subset of DeclineLead). */
export interface ReportRow {
  workstream: RecoveryWorkstream
  recovery_status: RecoveryStatus
  qualifying_ceiling: number | null
  traced_phone: string | null
  created_at: string
  updated_at: string
  returned_at: string | null
}

export interface RecoveryReport {
  /** Feed health — is Absa's decline feed flowing? */
  feed: {
    lastReceivedAt: string | null
    receivedToday: number
    received7d: number
    /** OTHER-reason leads sitting unrouted — needs a reason-mapping decision. */
    unrouted: number
  }
  /** Conversion — % of each funnel stage reached (A workstream). */
  aConversion: {
    routed: number
    priced: number; pricedPct: number
    engaged: number; engagedPct: number
    returned: number; returnedPct: number
    funded: number; fundedPct: number
  }
  /** Conversion — B workstream. */
  bConversion: {
    routed: number
    traced: number; tracedPct: number
    returned: number; returnedPct: number
    unreachable: number; unreachablePct: number
  }
  /** Failure / attention buckets. */
  attention: {
    optedOut: number
    unreachable: number
    /** A-leads routed but never priced — pricing pass didn't run or failed. */
    unpriced: number
    /** Engaged leads with no movement in >48h — journey stalled. */
    stale48h: number
  }
  /** Median hours from ingestion to returned-to-bank (recovered leads only). */
  medianHoursToReturn: number | null
  /** Daily intake counts, oldest→newest, for the last 14 days. */
  byDay: Array<{ day: string; count: number }>
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

/** Pure aggregation — testable without Supabase. `now` injectable for tests. */
export function computeRecoveryReport(rows: ReportRow[], now: Date = new Date()): RecoveryReport {
  const dayMs = 86_400_000
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  let lastReceivedAt: string | null = null
  let receivedToday = 0, received7d = 0, unrouted = 0
  const a = { routed: 0, priced: 0, engaged: 0, returned: 0, funded: 0 }
  const b = { routed: 0, traced: 0, returned: 0, unreachable: 0 }
  let optedOut = 0, unreachable = 0, unpriced = 0, stale48h = 0
  const returnDurations: number[] = []
  const byDayMap = new Map<string, number>()

  for (const r of rows) {
    const created = new Date(r.created_at).getTime()
    if (!lastReceivedAt || r.created_at > lastReceivedAt) lastReceivedAt = r.created_at
    if (created >= todayStart) receivedToday++
    if (created >= now.getTime() - 7 * dayMs) received7d++
    if (r.workstream === 'NONE') unrouted++

    const s = r.recovery_status
    const isReturned = s === 'RETURNED' || s === 'FUNDED'
    if (s === 'OPTED_OUT') optedOut++
    if (s === 'UNREACHABLE') unreachable++
    if ((s === 'ENGAGING' || s === 'RE_ENGAGED') &&
        now.getTime() - new Date(r.updated_at).getTime() > 48 * 3_600_000) stale48h++

    if (r.workstream === 'A_UPSELL') {
      a.routed++
      if (r.qualifying_ceiling != null) a.priced++
      else if (s === 'ROUTED') unpriced++
      if (s === 'RE_ENGAGED' || isReturned) a.engaged++
      if (isReturned) a.returned++
      if (s === 'FUNDED') a.funded++
    } else if (r.workstream === 'B_REACTIVATION') {
      b.routed++
      if (r.traced_phone != null) b.traced++
      if (isReturned) b.returned++
      if (s === 'UNREACHABLE') b.unreachable++
    }

    if (isReturned && r.returned_at) {
      returnDurations.push((new Date(r.returned_at).getTime() - created) / 3_600_000)
    }

    if (created >= now.getTime() - 14 * dayMs) {
      const day = new Date(created).toISOString().slice(0, 10)
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1)
    }
  }

  returnDurations.sort((x, y) => x - y)
  const median = returnDurations.length
    ? returnDurations[Math.floor(returnDurations.length / 2)]
    : null

  // Fill the full 14-day axis so gaps show as zero (a silent feed is a signal).
  const byDay: Array<{ day: string; count: number }> = []
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getTime() - i * dayMs).toISOString().slice(0, 10)
    byDay.push({ day, count: byDayMap.get(day) ?? 0 })
  }

  return {
    feed: { lastReceivedAt, receivedToday, received7d, unrouted },
    aConversion: {
      routed: a.routed,
      priced: a.priced, pricedPct: pct(a.priced, a.routed),
      engaged: a.engaged, engagedPct: pct(a.engaged, a.routed),
      returned: a.returned, returnedPct: pct(a.returned, a.routed),
      funded: a.funded, fundedPct: pct(a.funded, a.routed),
    },
    bConversion: {
      routed: b.routed,
      traced: b.traced, tracedPct: pct(b.traced, b.routed),
      returned: b.returned, returnedPct: pct(b.returned, b.routed),
      unreachable: b.unreachable, unreachablePct: pct(b.unreachable, b.routed),
    },
    attention: { optedOut, unreachable, unpriced, stale48h },
    medianHoursToReturn: median != null ? Math.round(median * 10) / 10 : null,
    byDay,
  }
}

export async function getRecoveryReport(): Promise<RecoveryReport> {
  const { data, error } = await supabase
    .from('decline_leads')
    .select('workstream, recovery_status, qualifying_ceiling, traced_phone, created_at, updated_at, returned_at')
    .limit(10000)
  if (error) throw error
  return computeRecoveryReport((data ?? []) as ReportRow[])
}

export interface ConversationMessage {
  id: string
  role: string
  content: string
  created_at: string
  tool_use: Record<string, unknown> | null
}

/** The WhatsApp thread for a lead, oldest→newest, for the admin timeline. */
export async function getLeadConversation(phone: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, role, content, created_at, tool_use')
    .eq('phone', phone)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw error
  return (data ?? []) as ConversationMessage[]
}

export interface NewLeadInput {
  full_name: string
  phone: string
  decline_reason: string
  id_number?: string
  email?: string
  vehicle_make?: string
  vehicle_model?: string
  vehicle_year?: string | number
  vehicle_price?: string | number
  deposit_amount?: string | number
  monthly_income?: string | number
  disposable_income?: string | number
}

/** Create + fully process a lead via the admin edge function (prices A / traces B). */
export async function createLead(input: NewLeadInput): Promise<DeclineLead> {
  const { data, error } = await supabase.functions.invoke('admin-create-lead', { body: input })
  if (error) {
    // Surface the function's own error message when present.
    const ctx = (error as unknown as { context?: { body?: string } }).context
    throw new Error(ctx?.body ? tryMsg(ctx.body) : error.message)
  }
  return (data as { lead: DeclineLead }).lead
}
function tryMsg(body: string): string {
  try { return JSON.parse(body).error ?? body } catch { return body }
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
