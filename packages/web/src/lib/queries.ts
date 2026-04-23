/**
 * queries.ts — all Supabase queries go through here.
 * Components must NOT call supabase.from() directly.
 *
 * Phase-3 note: column names and enum values must match
 * packages/api/supabase/migrations/20260415000000_baseline_schema.sql and
 * the generated types in packages/shared/src/types/database.ts. Do NOT
 * invent columns.
 */
import { supabase } from './supabase'
import type {
  Buyer,
  Seller,
  Vehicle,
  Document,
  ExtractionResult,
  VehiclePhoto,
  VehicleQuickEvaluation,
  Quote,
  Contract,
  AuditEvent,
  AuditLog,
  Task,
  Inspection,
  NatisFulfilment,
  DealStatus,
  DealWithRelations,
  TaskWithDeal,
  AuditFeedItem,
} from '../types/database'
import { normalizeAuditEvent, normalizeAuditLog } from '../types/database'

// ─── Deal queries ─────────────────────────────────────────────────────────────

export interface ListDealsOptions {
  status?: DealStatus
  dateFrom?: string
  dateTo?: string
  sortKey?: 'deal_number' | 'status' | 'created_at' | 'updated_at'
  sortDir?: 'asc' | 'desc'
  limit?: number
}

/**
 * List deals. The schema has buyers/sellers/vehicles pointing at deals (not
 * the other way round), so we fetch them via the reverse FK and flatten to
 * 0..1 row per deal on the client. We return `DealWithRelations` rather than
 * the bare `Deal` row so the UI can render joined data without another trip.
 */
export async function listDeals(opts: ListDealsOptions = {}): Promise<DealWithRelations[]> {
  const { status, dateFrom, dateTo, sortKey = 'updated_at', sortDir = 'desc', limit = 100 } = opts

  let q = supabase
    .from('deals')
    .select('*, buyers(*), sellers(*), vehicles(*)')
    .order(sortKey, { ascending: sortDir === 'asc' })
    .limit(limit)

  if (status) q = q.eq('status', status)
  if (dateFrom) q = q.gte('created_at', dateFrom)
  if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')

  const { data, error } = await q
  if (error) throw error

  // Supabase returns the reverse-FK tables as arrays (one-to-many from the
  // DB's perspective); flatten to a single optional row for the UI.
  return (data ?? []).map((row: unknown) => flattenDealRelations(row))
}

export async function getDeal(id: string): Promise<DealWithRelations | null> {
  const { data, error } = await supabase
    .from('deals')
    .select('*, buyers(*), sellers(*), vehicles(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data ? flattenDealRelations(data) : null
}

interface RawDealRow {
  buyers?: Buyer[] | null
  sellers?: Seller[] | null
  vehicles?: Vehicle[] | null
  [k: string]: unknown
}

function flattenDealRelations(row: unknown): DealWithRelations {
  const r = row as RawDealRow
  const { buyers, sellers, vehicles, ...deal } = r
  return {
    ...(deal as unknown as DealWithRelations),
    buyer: buyers?.[0] ?? null,
    seller: sellers?.[0] ?? null,
    vehicle: vehicles?.[0] ?? null,
  }
}

export async function updateDealStatus(id: string, status: DealStatus): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ─── Document queries ─────────────────────────────────────────────────────────

export async function listDocuments(dealId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Document[]
}

// ─── Extraction result queries ─────────────────────────────────────────────────

export async function listExtractionResults(documentId: string): Promise<ExtractionResult[]> {
  const { data, error } = await supabase
    .from('extraction_results')
    .select('*')
    .eq('document_id', documentId)
    .order('field_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ExtractionResult[]
}

// ─── Photo queries ─────────────────────────────────────────────────────────────

export async function listPhotos(dealId: string): Promise<VehiclePhoto[]> {
  // First get the photo set for this deal, then list photos in it.
  const { data: sets, error: setErr } = await supabase
    .from('vehicle_photo_sets')
    .select('id')
    .eq('deal_id', dealId)
    .limit(1)
  if (setErr) throw setErr
  if (!sets || sets.length === 0) return []

  const setId = sets[0].id
  const { data, error } = await supabase
    .from('vehicle_photos')
    .select('*')
    .eq('photo_set_id', setId)
    .order('angle_type', { ascending: true })
  if (error) throw error
  return (data ?? []) as VehiclePhoto[]
}

// ─── Evaluation queries ────────────────────────────────────────────────────────

export async function getVehicleEvaluation(dealId: string): Promise<VehicleQuickEvaluation | null> {
  const { data, error } = await supabase
    .from('vehicle_quick_evaluations')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as VehicleQuickEvaluation | null
}

// ─── Quote queries ─────────────────────────────────────────────────────────────

export async function listQuotes(dealId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Quote[]
}

// ─── Contract queries ──────────────────────────────────────────────────────────

export async function listContracts(dealId: string): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Contract[]
}

// ─── Audit event queries ───────────────────────────────────────────────────────

export interface ListAuditEventsOptions {
  dealId?: string
  eventType?: string
  actorType?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}

export async function listAuditEvents(opts: ListAuditEventsOptions = {}): Promise<AuditEvent[]> {
  const { dealId, eventType, actorType, dateFrom, dateTo, limit = 200 } = opts

  let q = supabase
    .from('audit_events')
    .select('*, deal:deals(deal_number)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dealId) q = q.eq('deal_id', dealId)
  if (eventType) q = q.eq('event_type', eventType)
  if (actorType) q = q.eq('actor_type', actorType)
  if (dateFrom) q = q.gte('created_at', dateFrom)
  if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AuditEvent[]
}

/**
 * Merged audit feed — combines rows from `audit_events` (deterministic system
 * events) and `audit_logs` (conversational/ops log) into a single timeline
 * ordered by created_at desc. `limit` is applied to EACH source, then the
 * combined list is trimmed.
 */
export async function listAuditFeed(opts: ListAuditEventsOptions = {}): Promise<AuditFeedItem[]> {
  const { dealId, eventType, actorType, dateFrom, dateTo, limit = 200 } = opts

  // ── audit_events
  let eventsQ = supabase
    .from('audit_events')
    .select('*, deal:deals(deal_number)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dealId) eventsQ = eventsQ.eq('deal_id', dealId)
  if (eventType) eventsQ = eventsQ.eq('event_type', eventType)
  if (actorType) eventsQ = eventsQ.eq('actor_type', actorType)
  if (dateFrom) eventsQ = eventsQ.gte('created_at', dateFrom)
  if (dateTo) eventsQ = eventsQ.lte('created_at', dateTo + 'T23:59:59')

  // ── audit_logs (no actor_type column in this table; skip that filter)
  let logsQ = supabase
    .from('audit_logs')
    .select('*, deal:deals(deal_number)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dealId) logsQ = logsQ.eq('deal_id', dealId)
  if (eventType) logsQ = logsQ.eq('event_type', eventType)
  if (dateFrom) logsQ = logsQ.gte('created_at', dateFrom)
  if (dateTo) logsQ = logsQ.lte('created_at', dateTo + 'T23:59:59')

  const [eventsRes, logsRes] = await Promise.all([eventsQ, logsQ])

  if (eventsRes.error) throw eventsRes.error
  if (logsRes.error) throw logsRes.error

  const events = (eventsRes.data ?? []).map((r) =>
    normalizeAuditEvent(r as AuditEvent & { deal?: { deal_number: string | null } | null }),
  )
  const logs = (logsRes.data ?? []).map((r) =>
    normalizeAuditLog(r as AuditLog & { deal?: { deal_number: string | null } | null }),
  )

  // If actorType filter is set, drop audit_logs rows (they don't have that
  // dimension). Otherwise include both sources.
  const merged = actorType ? events : [...events, ...logs]
  merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return merged.slice(0, limit)
}

// ─── Task queries ──────────────────────────────────────────────────────────────

export interface ListTasksOptions {
  dealId?: string
  queue?: string
  excludeCompleted?: boolean
  limit?: number
}

export async function listTasks(opts: ListTasksOptions = {}): Promise<TaskWithDeal[]> {
  const { dealId, queue, excludeCompleted = false, limit = 100 } = opts

  let q = supabase
    .from('tasks')
    .select('*, deal:deals(deal_number, status, buyers(*), vehicles(*))')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dealId) q = q.eq('deal_id', dealId)
  if (queue) q = q.eq('queue', queue)
  if (excludeCompleted) q = q.neq('status', 'COMPLETED')

  const { data, error } = await q
  if (error) throw error

  // Flatten the nested deal.buyers / deal.vehicles arrays to singletons.
  return (data ?? []).map((row: unknown) => {
    const r = row as Task & {
      deal?: {
        deal_number: string | null
        status: DealStatus
        buyers?: Buyer[] | null
        vehicles?: Vehicle[] | null
      } | null
    }
    if (!r.deal) return { ...r, deal: null }
    const { buyers, vehicles, ...deal } = r.deal
    return {
      ...r,
      deal: {
        ...deal,
        buyer: buyers?.[0] ?? null,
        vehicle: vehicles?.[0] ?? null,
      },
    }
  })
}

// ─── Task mutation queries ─────────────────────────────────────────────────────

/**
 * Claim a task — assigns it to the given agent UUID and flips status to
 * IN_PROGRESS. `agentId` must be a real user UUID (from supabase.auth or
 * from the Phase-2 `useProfile()` hook). The schema column `assigned_to` is
 * `uuid`, so literal strings like 'me' cause Postgres to return 400.
 */
export async function claimTask(taskId: string, agentId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'IN_PROGRESS',
      assigned_to: agentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function completeTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

/**
 * Escalate a task — the `tasks` table has no dedicated escalation columns,
 * so we store the reason in `notes` (plus flip `status` to ESCALATED).
 */
export async function escalateTask(taskId: string, reason?: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'ESCALATED',
      notes: reason ?? 'Manually escalated',
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

// ─── Inspection + NATIS queries ────────────────────────────────────────────────

export async function getInspection(dealId: string): Promise<Inspection | null> {
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle()
  if (error) throw error
  return data as Inspection | null
}

export async function getNatisFulfilment(dealId: string): Promise<NatisFulfilment | null> {
  const { data, error } = await supabase
    .from('natis_fulfilments')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle()
  if (error) throw error
  return data as NatisFulfilment | null
}
