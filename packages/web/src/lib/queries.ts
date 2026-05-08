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
  Update,
  Insert,
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

// ─── Deal-parties helper (buyer + seller phones for the conversation tab) ────

export interface DealPartyInfo {
  phone: string
  name: string
}

export interface DealParties {
  buyer: DealPartyInfo | null
  seller: DealPartyInfo | null
}

/**
 * Return the buyer's and seller's phone + display name for a deal.
 * Used by <DealConversation> to render per-party threads.
 *
 * Either side may be null if no row exists or the row has no phone yet
 * (e.g. seller hasn't been notified). The UI hides the corresponding tab.
 */
export async function getDealParties(dealId: string): Promise<DealParties> {
  const [{ data: buyers, error: bErr }, { data: sellers, error: sErr }] = await Promise.all([
    supabase.from('buyers').select('phone, full_name').eq('deal_id', dealId).limit(1),
    supabase.from('sellers').select('phone, full_name').eq('deal_id', dealId).limit(1),
  ])
  if (bErr) throw bErr
  if (sErr) throw sErr

  const b = buyers?.[0]
  const s = sellers?.[0]
  return {
    buyer: b?.phone ? { phone: b.phone, name: b.full_name ?? 'Buyer' } : null,
    seller: s?.phone ? { phone: s.phone, name: s.full_name ?? 'Seller' } : null,
  }
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

/**
 * Quote writer functions. RLS policy `ops_agent_write` on the `quotes` table
 * (migrations/20260417000000_auth_rls.sql) permits ALL ops to authenticated
 * users where `public.is_ops_agent()` is true — so dealmaker / F&I writes go
 * through the standard supabase-js client with the user's JWT.
 *
 * Schema note: the `quotes` table stores `finance_amount`, `balloon_amount`,
 * `total_credit_cost`, `interest_rate`, `term_months`, `monthly_instalment`,
 * `valid_until`, `status`. The product brief mentioned `deposit_amount`,
 * `balance_to_finance`, `total_repayable` — those map to:
 *   total_repayable     → total_credit_cost
 *   balance_to_finance  → finance_amount
 *   deposit_amount      → NOT in schema (UI-only; not persisted)
 */

export interface QuoteWriteInput {
  finance_amount?: number | null
  balloon_amount?: number
  interest_rate?: number | null
  term_months?: number | null
  monthly_instalment?: number | null
  total_credit_cost?: number | null
  valid_until?: string | null
}

export async function createQuote(
  dealId: string,
  input: QuoteWriteInput,
  preparedBy?: string | null,
): Promise<Quote> {
  const payload = {
    deal_id: dealId,
    status: 'DRAFT' as const,
    balloon_amount: input.balloon_amount ?? 0,
    finance_amount: input.finance_amount ?? null,
    interest_rate: input.interest_rate ?? null,
    term_months: input.term_months ?? null,
    monthly_instalment: input.monthly_instalment ?? null,
    total_credit_cost: input.total_credit_cost ?? null,
    valid_until: input.valid_until ?? null,
    prepared_by: preparedBy ?? null,
  }
  const { data, error } = await supabase
    .from('quotes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as Quote
}

export async function updateQuote(
  quoteId: string,
  input: QuoteWriteInput,
): Promise<Quote> {
  const patch: Update<'quotes'> = { updated_at: new Date().toISOString() }
  if (input.finance_amount !== undefined) patch.finance_amount = input.finance_amount
  if (input.balloon_amount !== undefined) patch.balloon_amount = input.balloon_amount
  if (input.interest_rate !== undefined) patch.interest_rate = input.interest_rate
  if (input.term_months !== undefined) patch.term_months = input.term_months
  if (input.monthly_instalment !== undefined) patch.monthly_instalment = input.monthly_instalment
  if (input.total_credit_cost !== undefined) patch.total_credit_cost = input.total_credit_cost
  if (input.valid_until !== undefined) patch.valid_until = input.valid_until

  const { data, error } = await supabase
    .from('quotes')
    .update(patch)
    .eq('id', quoteId)
    .select()
    .single()
  if (error) throw error
  return data as Quote
}

export async function sendQuote(quoteId: string): Promise<Quote> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'SENT', sent_at: now, updated_at: now })
    .eq('id', quoteId)
    .select()
    .single()
  if (error) throw error
  return data as Quote
}

export async function setQuoteStatus(
  quoteId: string,
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVISED',
  opts: { decline_reason?: string | null } = {},
): Promise<Quote> {
  const now = new Date().toISOString()
  const patch: Update<'quotes'> = { status, updated_at: now }
  if (status === 'ACCEPTED') patch.accepted_at = now
  if (status === 'DECLINED') {
    patch.declined_at = now
    if (opts.decline_reason !== undefined) patch.decline_reason = opts.decline_reason
  }
  if (status === 'SENT') patch.sent_at = now
  const { data, error } = await supabase
    .from('quotes')
    .update(patch)
    .eq('id', quoteId)
    .select()
    .single()
  if (error) throw error
  return data as Quote
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

// Writers — Contracts CRUD for ops dealmakers.
//
// Storage: files live in the `deal-documents` bucket under
// `contracts/<deal_id>/<contract_type>/<timestamp>_<filename>`. We store the
// public URL on contracts.file_url to keep the existing read path
// (DealDetail "View Contract" link) working without signed-URL plumbing.

const CONTRACTS_BUCKET = 'deal-documents'

export interface UploadContractInput {
  dealId: string
  contractType: 'BUYER_FINANCE_AGREEMENT' | 'SELLER_AGREEMENT'
  file: File
}

export async function uploadContract(input: UploadContractInput): Promise<Contract> {
  const { dealId, contractType, file } = input

  if (file.size > 20 * 1024 * 1024) {
    throw new Error('File too large — max 20 MB')
  }
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Only PDF files are accepted')
  }

  const ts = Date.now()
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
  const path = `contracts/${dealId}/${contractType.toLowerCase()}/${ts}_${safeName}`

  const { error: upErr } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw upErr

  const { data: pub } = supabase.storage.from(CONTRACTS_BUCKET).getPublicUrl(path)
  const fileUrl = pub?.publicUrl ?? path

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      deal_id: dealId,
      contract_type: contractType,
      file_url: fileUrl,
      generated_at: new Date().toISOString(),
      signature_status: 'PENDING',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Contract
}

export async function markContractSigned(
  contractId: string,
  signedByName: string,
): Promise<Contract> {
  const { data, error } = await supabase
    .from('contracts')
    .update({
      signature_status: 'SIGNED',
      signed_at: new Date().toISOString(),
      signatory_name: signedByName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select('*')
    .single()
  if (error) throw error
  return data as Contract
}

export async function deleteContract(contractId: string): Promise<void> {
  // Refuse to delete a SIGNED contract — audit-trail safety.
  const { data: existing, error: readErr } = await supabase
    .from('contracts')
    .select('id, signature_status, file_url')
    .eq('id', contractId)
    .single()
  if (readErr) throw readErr
  if (existing.signature_status === 'SIGNED') {
    throw new Error('Cannot delete a signed contract')
  }

  // Best-effort storage cleanup. Tolerate failures (orphaned object) so the
  // DB row still goes away and the user isn't blocked.
  if (existing.file_url) {
    const marker = `/${CONTRACTS_BUCKET}/`
    const idx = existing.file_url.indexOf(marker)
    if (idx >= 0) {
      const path = existing.file_url.slice(idx + marker.length)
      await supabase.storage.from(CONTRACTS_BUCKET).remove([path]).catch(() => undefined)
    }
  }

  const { error } = await supabase.from('contracts').delete().eq('id', contractId)
  if (error) throw error
}

// ─── Seller writers ────────────────────────────────────────────────────────────
//
// SCHEMA NOTE: the `sellers` table today has only:
//   id, deal_id, full_name, id_number, phone, email,
//   consent_status, consent_timestamp, created_at, updated_at
//
// Address + bank details (bank_name, account_number, branch_code,
// physical_address) referenced in the seller-onboarding spec are NOT
// columns on `sellers`. Until a migration adds them, the SellerTab edit
// form persists only the existing columns. The address / bank inputs in
// the UI are surfaced as disabled placeholders flagged "schema gap".

export interface SellerWriteInput {
  full_name?: string | null
  id_number?: string | null
  phone?: string
  email?: string | null
}

export async function updateSeller(
  dealId: string,
  fields: SellerWriteInput,
): Promise<Seller> {
  // sellers.deal_id is unique-per-deal in practice (one seller row per deal),
  // so we resolve the row id first, then update by primary key. If no row
  // exists yet (empty-state), insert one.
  const { data: existing, error: readErr } = await supabase
    .from('sellers')
    .select('id')
    .eq('deal_id', dealId)
    .maybeSingle()
  if (readErr) throw readErr

  const patch: Update<'sellers'> = { updated_at: new Date().toISOString() }
  if (fields.full_name !== undefined) patch.full_name = fields.full_name
  if (fields.id_number !== undefined) patch.id_number = fields.id_number
  if (fields.phone !== undefined) patch.phone = fields.phone
  if (fields.email !== undefined) patch.email = fields.email

  if (existing?.id) {
    const { data, error } = await supabase
      .from('sellers')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw error
    return data as Seller
  }

  // Insert a new row. `phone` is NOT NULL on `sellers` — caller must supply it.
  if (!fields.phone) {
    throw new Error('Phone is required to create a seller record')
  }
  const { data, error } = await supabase
    .from('sellers')
    .insert({
      deal_id: dealId,
      phone: fields.phone,
      full_name: fields.full_name ?? null,
      id_number: fields.id_number ?? null,
      email: fields.email ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Seller
}

// Document upload (ops fallback) for the SELLER party. Mirrors the contract
// upload pattern: writes the file to the `deal-documents` bucket and inserts
// a `documents` row with party='SELLER' and the supplied doc_type.

const DEAL_DOCS_BUCKET = 'deal-documents'

export type SellerDocType =
  | 'SA_ID_SMART_CARD'
  | 'SA_ID_GREEN_BOOK'
  | 'PROOF_OF_ADDRESS'
  | 'BANK_STATEMENT'
  | 'SETTLEMENT_LETTER'
  | 'VEHICLE_NATIS'
  | 'VEHICLE_REGISTRATION'
  | 'OTHER'

export interface UploadSellerDocumentInput {
  dealId: string
  docType: SellerDocType
  file: File
}

export async function uploadSellerDocument(
  input: UploadSellerDocumentInput,
): Promise<Document> {
  const { dealId, docType, file } = input
  if (file.size > 20 * 1024 * 1024) throw new Error('File too large — max 20 MB')

  const ts = Date.now()
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
  const path = `documents/${dealId}/seller/${docType.toLowerCase()}_${ts}_${safeName}`

  const { error: upErr } = await supabase.storage
    .from(DEAL_DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (upErr) throw upErr

  const { data: pub } = supabase.storage.from(DEAL_DOCS_BUCKET).getPublicUrl(path)
  const fileUrl = pub?.publicUrl ?? path

  // NOTE: `storage_path` was added in migration 20260417020000 but is missing
  // from the auto-generated `documents` Insert type — cast to satisfy the
  // generated-type strictness (regenerate types after `pnpm gen:types`).
  const insertRow = {
    deal_id: dealId,
    party: 'SELLER' as const,
    doc_type: docType,
    file_url: fileUrl,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || null,
    storage_path: path,
    status: 'UPLOADED',
  } satisfies Omit<Insert<'documents'>, 'storage_path'> & { storage_path: string }
  const { data, error } = await supabase
    .from('documents')
    .insert(insertRow as Insert<'documents'>)
    .select('*')
    .single()
  if (error) throw error
  return data as Document
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

// ─── Ops notes (logged as audit_events with event_type='ops_note') ───────────

export interface OpsNote {
  id: string
  deal_id: string | null
  actor: string | null
  actor_type: string | null
  created_at: string
  details: { body?: string; [k: string]: unknown } | null
}

export async function listOpsNotes(dealId: string): Promise<OpsNote[]> {
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, deal_id, actor, actor_type, created_at, details')
    .eq('deal_id', dealId)
    .eq('event_type', 'ops_note')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as OpsNote[]
}

export async function createOpsNote(dealId: string, body: string, actor?: string | null): Promise<void> {
  const { error } = await supabase.from('audit_events').insert({
    deal_id: dealId,
    event_type: 'ops_note',
    actor: actor ?? null,
    actor_type: 'ops_user',
    details: { body },
  } as never)
  if (error) throw error
}

// ─── Task creation ───────────────────────────────────────────────────────────

export interface TaskWriteInput {
  task_type: string
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  queue?: string | null
  notes?: string | null
  due_at?: string | null
  assigned_to?: string | null
}

export async function createTask(dealId: string, input: TaskWriteInput): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    deal_id: dealId,
    task_type: input.task_type,
    priority: input.priority ?? 'NORMAL',
    queue: input.queue ?? null,
    notes: input.notes ?? null,
    due_at: input.due_at ?? null,
    assigned_to: input.assigned_to ?? null,
    status: 'PENDING',
  } as never)
  if (error) throw error
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
  // Multiple inspections per deal are tolerated; surface the newest.
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as Inspection | null
}

// ─── Inspection writers ────────────────────────────────────────────────────────
// The `inspections` table is defined in 20260415000000_baseline_schema.sql.
// Available columns: inspector_name, scheduled_date, completed_date, report_url,
// damage_summary, overall_condition (condition_band enum), status (text),
// notes. There are NO dedicated roadworthy_passed / technical_passed boolean
// columns — pass/fail is encoded via `status` ('SCHEDULED' | 'COMPLETE' |
// 'FAILED') and `overall_condition`.

export interface CreateInspectionInput {
  deal_id: string
  vehicle_id: string
  scheduled_date?: string | null
  inspector_name?: string | null
  notes?: string | null
}

export async function createInspection(input: CreateInspectionInput): Promise<Inspection> {
  const { data, error } = await supabase
    .from('inspections')
    .insert({
      deal_id: input.deal_id,
      vehicle_id: input.vehicle_id,
      scheduled_date: input.scheduled_date ?? null,
      inspector_name: input.inspector_name ?? null,
      notes: input.notes ?? null,
      status: 'SCHEDULED',
    })
    .select()
    .single()
  if (error) throw error
  return data as Inspection
}

export interface RecordInspectionResultsInput {
  completed_date?: string | null
  passed: boolean
  overall_condition?: string | null
  damage_summary?: string | null
  notes?: string | null
  report_url?: string | null
}

export async function recordInspectionResults(
  inspectionId: string,
  input: RecordInspectionResultsInput,
): Promise<Inspection> {
  const patch = {
    completed_date: input.completed_date ?? new Date().toISOString().slice(0, 10),
    status: input.passed ? 'COMPLETE' : 'FAILED',
    updated_at: new Date().toISOString(),
    ...(input.overall_condition !== undefined ? { overall_condition: input.overall_condition as Inspection['overall_condition'] } : {}),
    ...(input.damage_summary !== undefined ? { damage_summary: input.damage_summary } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.report_url !== undefined ? { report_url: input.report_url } : {}),
  }

  const { data, error } = await supabase
    .from('inspections')
    .update(patch)
    .eq('id', inspectionId)
    .select()
    .single()
  if (error) throw error
  return data as Inspection
}

export async function updateInspectionNotes(
  inspectionId: string,
  notes: string,
): Promise<Inspection> {
  const { data, error } = await supabase
    .from('inspections')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', inspectionId)
    .select()
    .single()
  if (error) throw error
  return data as Inspection
}

/**
 * Upload an inspection report PDF and patch the inspection row's report_url.
 *
 * NOTE: The `inspection-reports` bucket is NOT provisioned by any current
 * migration — it must be created via the Supabase dashboard or a future
 * migration before this works. If the bucket is missing the upload throws
 * and the caller should surface a friendly error to ops.
 */
export async function uploadInspectionReport(
  inspectionId: string,
  dealId: string,
  file: File,
): Promise<Inspection> {
  const path = `${dealId}/${inspectionId}-${Date.now()}-${file.name}`
  const { error: upErr } = await supabase.storage
    .from('inspection-reports')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw upErr

  const { data: pub } = supabase.storage.from('inspection-reports').getPublicUrl(path)
  const reportUrl = pub.publicUrl

  const { data, error } = await supabase
    .from('inspections')
    .update({ report_url: reportUrl, updated_at: new Date().toISOString() })
    .eq('id', inspectionId)
    .select()
    .single()
  if (error) throw error
  return data as Inspection
}

/** Create a remediation task triggered by an inspection failure. */
export async function createRemediationTask(dealId: string, reason: string): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    deal_id: dealId,
    task_type: 'INSPECTION_REMEDIATION',
    queue: 'OPS',
    priority: 'HIGH',
    status: 'PENDING',
    notes: reason,
  })
  if (error) throw error
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

// ─── NATIS mutation queries ────────────────────────────────────────────────────
//
// The `natis_fulfilments` table only has a single freeform column
// (`tracking_notes`) for narrative context — there are no per-stage notes,
// no transfer reference, and no cancellation reason columns. The writers
// below therefore append a timestamped, stage-prefixed line to
// `tracking_notes` whenever the caller supplies extra detail (collector
// notes, transfer reference, courier tracking number, cancellation reason).
// Status fields use string literals because the column type is plain `text`
// (no Postgres enum), so the canonical values are owned here in the UI.

const NATIS_TS_FMT = (): string => new Date().toISOString().slice(0, 16).replace('T', ' ')

function appendNatisNote(existing: string | null | undefined, stage: string, text?: string | null): string | null {
  if (!text || !text.trim()) return existing ?? null
  const line = `[${NATIS_TS_FMT()}] ${stage}: ${text.trim()}`
  return existing && existing.trim() ? `${existing}\n${line}` : line
}

export async function createNatisFulfilment(dealId: string): Promise<NatisFulfilment> {
  const { data, error } = await supabase
    .from('natis_fulfilments')
    .insert({
      deal_id: dealId,
      collection_status: 'PENDING',
      transfer_status: 'PENDING',
    })
    .select()
    .single()
  if (error) throw error
  return data as NatisFulfilment
}

export interface UpdateNatisCollectionInput {
  collection_date: string // YYYY-MM-DD
  collector_name: string
  notes?: string
}

export async function updateNatisCollection(
  dealId: string,
  input: UpdateNatisCollectionInput,
  existingNotes?: string | null,
): Promise<NatisFulfilment> {
  const { data, error } = await supabase
    .from('natis_fulfilments')
    .update({
      collection_status: 'COLLECTED',
      collection_date: input.collection_date,
      collector_name: input.collector_name,
      tracking_notes: appendNatisNote(existingNotes, 'Collection', input.notes),
      transfer_status: 'IN_PROGRESS',
      updated_at: new Date().toISOString(),
    })
    .eq('deal_id', dealId)
    .select()
    .single()
  if (error) throw error
  return data as NatisFulfilment
}

export interface UpdateNatisTransferInput {
  transfer_date: string
  reference_number?: string
  notes?: string
}

export async function updateNatisTransfer(
  dealId: string,
  input: UpdateNatisTransferInput,
  existingNotes?: string | null,
): Promise<NatisFulfilment> {
  const detail = [
    input.reference_number ? `ref ${input.reference_number}` : null,
    input.notes,
  ].filter(Boolean).join(' — ')
  const { data, error } = await supabase
    .from('natis_fulfilments')
    .update({
      transfer_status: 'TRANSFERRED',
      transfer_date: input.transfer_date,
      tracking_notes: appendNatisNote(existingNotes, 'Transfer', detail || undefined),
      updated_at: new Date().toISOString(),
    })
    .eq('deal_id', dealId)
    .select()
    .single()
  if (error) throw error
  return data as NatisFulfilment
}

export interface UpdateNatisDeliveryInput {
  docs_sent_to_customer_date: string
  courier_tracking?: string
  notes?: string
}

export async function updateNatisDelivery(
  dealId: string,
  input: UpdateNatisDeliveryInput,
  existingNotes?: string | null,
): Promise<NatisFulfilment> {
  const detail = [
    input.courier_tracking ? `courier ${input.courier_tracking}` : null,
    input.notes,
  ].filter(Boolean).join(' — ')
  const { data, error } = await supabase
    .from('natis_fulfilments')
    .update({
      transfer_status: 'DELIVERED',
      docs_sent_to_customer_date: input.docs_sent_to_customer_date,
      tracking_notes: appendNatisNote(existingNotes, 'Delivery', detail || undefined),
      updated_at: new Date().toISOString(),
    })
    .eq('deal_id', dealId)
    .select()
    .single()
  if (error) throw error
  return data as NatisFulfilment
}

export async function cancelNatisFulfilment(
  dealId: string,
  reason: string,
  existingNotes?: string | null,
): Promise<NatisFulfilment> {
  const { data, error } = await supabase
    .from('natis_fulfilments')
    .update({
      collection_status: 'CANCELLED',
      transfer_status: 'CANCELLED',
      tracking_notes: appendNatisNote(existingNotes, 'Cancelled', reason),
      updated_at: new Date().toISOString(),
    })
    .eq('deal_id', dealId)
    .select()
    .single()
  if (error) throw error
  return data as NatisFulfilment
}

// ─── Affordability queries ─────────────────────────────────────────────────────

/**
 * One row per BANK_STATEMENT document for this deal, with extracted fields
 * pivoted from the row-per-field `extraction_results` shape into a
 * `field_name -> { value, confidence }` map for easy UI consumption.
 */
export interface BankStatementExtraction {
  document_id: string
  file_name: string | null
  upload_timestamp: string | null
  fields: Record<string, { value: string | null; confidence: number | null }>
}

export async function getBankStatementExtractions(
  dealId: string,
): Promise<BankStatementExtraction[]> {
  const { data: docs, error: docErr } = await supabase
    .from('documents')
    .select('id, file_name, upload_timestamp, doc_type')
    .eq('deal_id', dealId)
    .eq('doc_type', 'BANK_STATEMENT')
    .order('upload_timestamp', { ascending: true })
  if (docErr) throw docErr
  if (!docs || docs.length === 0) return []

  const docIds = docs.map((d) => d.id)
  const { data: results, error: resErr } = await supabase
    .from('extraction_results')
    .select('document_id, field_name, extracted_value, confidence')
    .in('document_id', docIds)
  if (resErr) throw resErr

  return docs.map((d) => {
    const fields: BankStatementExtraction['fields'] = {}
    for (const r of results ?? []) {
      if (r.document_id !== d.id) continue
      fields[r.field_name] = { value: r.extracted_value, confidence: r.confidence }
    }
    return {
      document_id: d.id,
      file_name: d.file_name,
      upload_timestamp: d.upload_timestamp,
      fields,
    }
  })
}

/**
 * Persist ops-entered override income/expenses figures into
 * `deals.phase_state.affordability_override`. The `phase_state` jsonb column
 * isn't in the auto-generated Update type yet, so we read-modify-write via
 * an unknown cast at the supabase boundary.
 */
export interface AffordabilityOverride {
  monthly_income?: number | null
  monthly_expenses?: number | null
  notes?: string | null
  saved_at?: string
  saved_by?: string | null
}

export async function saveAffordabilityOverride(
  dealId: string,
  override: AffordabilityOverride,
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from('deals')
    .select('phase_state')
    .eq('id', dealId)
    .single()
  if (readErr) throw readErr

  const existing = ((row as unknown as { phase_state?: Record<string, unknown> | null })
    .phase_state ?? {}) as Record<string, unknown>

  const merged = {
    ...existing,
    affordability_override: {
      ...((existing.affordability_override as Record<string, unknown> | undefined) ?? {}),
      ...override,
      saved_at: new Date().toISOString(),
    },
  }

  const { error } = await supabase
    .from('deals')
    .update({
      ...({ phase_state: merged } as unknown as Record<string, never>),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
  if (error) throw error
}

/**
 * Mark affordability assessed and move the deal into the credit-decision
 * phase. Sets status -> FNI_REVIEW_PENDING, current_phase -> CREDIT_DECISION,
 * and appends 'affordability_assessed' to completed_milestones (idempotent).
 */
export async function submitForCredit(dealId: string): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from('deals')
    .select('completed_milestones')
    .eq('id', dealId)
    .single()
  if (readErr) throw readErr

  const existing =
    ((row as unknown as { completed_milestones?: string[] | null }).completed_milestones ??
      []) as string[]
  const milestones = existing.includes('affordability_assessed')
    ? existing
    : [...existing, 'affordability_assessed']

  const update: Record<string, unknown> = {
    status: 'FNI_REVIEW_PENDING' as DealStatus,
    current_phase: 'CREDIT_DECISION',
    completed_milestones: milestones,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('deals')
    .update(update as unknown as Record<string, never>)
    .eq('id', dealId)
  if (error) throw error
}
