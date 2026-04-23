/**
 * queries.ts — all Supabase queries go through here.
 * Components must NOT call supabase.from() directly.
 */
import { supabase } from './supabase'
import type {
  Deal,
  Document,
  ExtractionResult,
  VehiclePhoto,
  VehicleQuickEvaluation,
  Quote,
  Contract,
  AuditEvent,
  Task,
  Inspection,
  NATISFulfilment,
  DealStatus,
} from '../types/database'

// ─── Deal queries ─────────────────────────────────────────────────────────────

export interface ListDealsOptions {
  status?: DealStatus
  dateFrom?: string
  dateTo?: string
  sortKey?: 'deal_number' | 'status' | 'created_at' | 'updated_at'
  sortDir?: 'asc' | 'desc'
  limit?: number
}

export async function listDeals(opts: ListDealsOptions = {}): Promise<Deal[]> {
  const { status, dateFrom, dateTo, sortKey = 'updated_at', sortDir = 'desc', limit = 100 } = opts

  let q = supabase
    .from('deals')
    .select('*, buyer:buyers(*), seller:sellers(*), vehicle:vehicles(*)')
    .order(sortKey, { ascending: sortDir === 'asc' })
    .limit(limit)

  if (status) q = q.eq('status', status)
  if (dateFrom) q = q.gte('created_at', dateFrom)
  if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Deal[]
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await supabase
    .from('deals')
    .select('*, buyer:buyers(*), seller:sellers(*), vehicle:vehicles(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Deal | null
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
  // First get the photo set for this deal, then list photos in it
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
    .order('angle', { ascending: true })
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
    .order('version', { ascending: false })
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

// Combined audit feed (alias used by AuditLog page)
export const listAuditFeed = listAuditEvents

// ─── Task queries ──────────────────────────────────────────────────────────────

export interface ListTasksOptions {
  dealId?: string
  queue?: string
  excludeCompleted?: boolean
  limit?: number
}

export async function listTasks(opts: ListTasksOptions = {}): Promise<Task[]> {
  const { dealId, queue, excludeCompleted = false, limit = 100 } = opts

  let q = supabase
    .from('tasks')
    .select('*, deal:deals(deal_number, status, buyer:buyers(*), vehicle:vehicles(*))')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dealId) q = q.eq('deal_id', dealId)
  if (queue) q = q.eq('queue', queue)
  if (excludeCompleted) q = q.neq('status', 'COMPLETED')

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Task[]
}

// ─── Task mutation queries ─────────────────────────────────────────────────────

export async function claimTask(taskId: string, agentId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'IN_PROGRESS',
      assigned_to: agentId,
      assigned_at: new Date().toISOString(),
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

export async function escalateTask(taskId: string, reason?: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'ESCALATED',
      escalated_at: new Date().toISOString(),
      escalation_reason: reason ?? 'Manually escalated',
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

export async function getNatisFulfilment(dealId: string): Promise<NATISFulfilment | null> {
  const { data, error } = await supabase
    .from('natis_fulfilments')
    .select('*')
    .eq('deal_id', dealId)
    .maybeSingle()
  if (error) throw error
  return data as NATISFulfilment | null
}
