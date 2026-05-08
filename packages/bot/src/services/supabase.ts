/**
 * Supabase client and helper functions for the bot package.
 *
 * Uses the service-role key (bypasses RLS) since the bot runs server-side.
 *
 * Environment variables required:
 *   SUPABASE_URL              — project URL, e.g. https://xyz.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service-role secret key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
    }
    _client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// ── Deal helpers ─────────────────────────────────────────────────────────────

// `deals` has no buyer_phone / seller_phone columns — phones live on the
// `buyers` / `sellers` tables which FK back to deal_id. Two-step lookup:
// find party row by phone, then load the deal by id. Earlier code used the
// non-existent flat column and silently returned null, which made
// resolvePartyType always default to 'buyer' even for a known seller.

async function getDealByPartyPhone(table: 'buyers' | 'sellers', phone: string) {
  const sb = getSupabaseClient();
  // Match exact and the +/no-+ variant so a row stored as "+27..." still
  // matches an inbound webhook phone "27..." (and vice versa).
  const variants = phone.startsWith('+') ? [phone, phone.slice(1)] : [phone, `+${phone}`];
  const { data: partyRows, error: partyErr } = await sb
    .from(table)
    .select('deal_id')
    .in('phone', variants)
    .order('created_at', { ascending: false })
    .limit(1);
  if (partyErr) throw partyErr;
  const dealId = partyRows?.[0]?.deal_id;
  if (!dealId) return null;
  const { data: deal, error: dealErr } = await sb
    .from('deals')
    .select('*, buyers(*), sellers(*), vehicles(*)')
    .eq('id', dealId)
    .single();
  if (dealErr && dealErr.code !== 'PGRST116') throw dealErr;
  return deal;
}

export async function getDealByBuyerPhone(phone: string) {
  return getDealByPartyPhone('buyers', phone);
}

export async function getDealBySellerPhone(phone: string) {
  return getDealByPartyPhone('sellers', phone);
}

export async function getDealById(dealId: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('deals')
    .select('*, buyers(*), sellers(*), vehicles(*)')
    .eq('id', dealId)
    .single();
  if (error) throw error;
  return data;
}

/** Alias for getDealById — used by the flow-based webhook handler. */
export async function getDeal(dealId: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('deals').select('*').eq('id', dealId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateDealStatus(dealId: string, status: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('deals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Document helpers ──────────────────────────────────────────────────────────

export async function storeDocument(record: {
  deal_id: string;
  party_type: 'buyer' | 'seller';
  document_type: string;
  storage_path: string;            // public URL of the uploaded file
  original_filename?: string;
  mime_type?: string;
}) {
  // Schema column names differ from our incoming shape:
  //   party_type     → party
  //   document_type  → doc_type
  //   original_filename → file_name
  //   storage_path is the public URL — also store the bucket path in storage_path,
  //   and in file_url for clients that prefer that field.
  const sb = getSupabaseClient();
  const row = {
    deal_id: record.deal_id,
    party: record.party_type.toUpperCase(),  // enum is BUYER / SELLER
    doc_type: record.document_type,
    storage_path: record.storage_path,
    file_url: record.storage_path,
    file_name: record.original_filename ?? null,
    mime_type: record.mime_type ?? null,
    status: 'uploaded',
    upload_timestamp: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from('documents')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getDocumentById(documentId: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('documents').select('*').eq('id', documentId).single();
  if (error) throw error;
  return data;
}

export async function updateDocumentExtraction(
  documentId: string,
  extractedData: Record<string, unknown>,
  confidence: Record<string, number>,
) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('documents')
    .update({
      extracted_data: extractedData,
      confidence_scores: confidence,
      status: 'extracted',
      extracted_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Vehicle photo helpers ─────────────────────────────────────────────────────

// Maps our lowercase angle ids (used by the agent + classifier) to the
// upper-case `photo_angle` enum that the DB expects.
const ANGLE_TO_ENUM: Record<string, string> = {
  front:           'FRONT_VIEW',
  rear:            'REAR_VIEW',
  driver_side:     'RIGHT_SIDE',         // SA right-hand drive — driver = right
  passenger_side:  'LEFT_SIDE',
  interior_front:  'INTERIOR_DASHBOARD',
  interior_rear:   'BOOT_INTERIOR',      // closest match (no INTERIOR_REAR enum)
  engine_bay:      'ENGINE_BAY',
  boot:            'BOOT_INTERIOR',
  odometer:        'ODOMETER',
  other:           'DAMAGE_CLOSEUP',     // catch-all for unclassifiable
}

/** Get-or-create the photo_set for this deal so we can attach photos to it. */
async function getOrCreatePhotoSet(dealId: string): Promise<{ id: string } | null> {
  const sb = getSupabaseClient()
  const { data: existing } = await sb
    .from('vehicle_photo_sets')
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing
  // Need vehicle_id to create a photo set; pull from deals → vehicles relation.
  const { data: vehicleRow } = await sb
    .from('vehicles')
    .select('id')
    .eq('deal_id', dealId)
    .limit(1)
    .maybeSingle()
  const vehicleId = vehicleRow?.id
  if (!vehicleId) {
    // Without a vehicle we still proceed but without a photo_set FK; insert
    // will fail loudly below in storeVehiclePhoto and the caller surfaces it.
    return null
  }
  // Race-tolerant insert: when a seller fires a batch through WhatsApp,
  // multiple webhooks land in parallel; one wins the insert and the others
  // hit a unique constraint. Re-read the row instead of erroring.
  const { data: created, error } = await sb
    .from('vehicle_photo_sets')
    .insert({
      deal_id: dealId,
      vehicle_id: vehicleId,
      status: 'IN_PROGRESS',
      mandatory_required: 9,
    } as never)
    .select('id')
    .maybeSingle()
  if (created?.id) return created
  if (error) {
    const { data: raceWinner } = await sb
      .from('vehicle_photo_sets')
      .select('id')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (raceWinner?.id) return raceWinner
    throw error
  }
  return null
}

/**
 * Store a vehicle photo, replacing any existing photo for the same angle on
 * the same photo_set. Keeps the set to AT MOST ONE photo per angle so the
 * gallery doesn't inflate with duplicates from batch webhooks.
 */
export async function storeVehiclePhoto(record: {
  deal_id: string;
  angle: string;
  storage_path: string;
  original_filename?: string;
}) {
  const sb = getSupabaseClient();
  const photoSet = await getOrCreatePhotoSet(record.deal_id)
  if (!photoSet) {
    throw new Error('Cannot store vehicle photo — no vehicle_photo_set + no vehicle on deal to create one. Capture vehicle from OTP first.')
  }
  const angleType = ANGLE_TO_ENUM[record.angle] ?? 'DAMAGE_CLOSEUP'

  // Replace any existing photo for the same angle (DB + storage).
  const { data: existing } = await sb.from('vehicle_photos')
    .select('id, file_url')
    .eq('photo_set_id', photoSet.id)
    .eq('angle_type', angleType)
    .maybeSingle()

  let replacedId: string | undefined
  if (existing?.id) {
    replacedId = existing.id
    const url = (existing as { file_url?: string }).file_url ?? ''
    const prefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/`
    if (url.startsWith(prefix)) {
      const objectPath = url.slice(prefix.length)
      await sb.storage.from('documents').remove([objectPath]).catch((e) => {
        console.warn('[storeVehiclePhoto] storage cleanup failed:', e)
      })
    }
    await sb.from('vehicle_photos').delete().eq('id', existing.id)
  }

  const { data, error } = await sb
    .from('vehicle_photos')
    .insert({
      photo_set_id: photoSet.id,
      angle_type: angleType,
      file_url: record.storage_path,
      file_name: record.original_filename ?? null,
      upload_timestamp: new Date().toISOString(),
    } as never)
    .select()
    .single();
  if (error) throw error;
  return { ...(data as Record<string, unknown>), replaced: !!replacedId, replaced_id: replacedId } as { id: string; replaced: boolean; replaced_id?: string };
}

export async function getVehiclePhotos(dealId: string) {
  const sb = getSupabaseClient();
  // Photos hang off vehicle_photo_sets which has deal_id. Join through.
  const { data: sets } = await sb
    .from('vehicle_photo_sets')
    .select('id')
    .eq('deal_id', dealId)
  const setIds = (sets ?? []).map((s: { id: string }) => s.id)
  if (setIds.length === 0) return [] as Array<{ id: string; angle: string; storage_path: string }>
  const { data, error } = await sb
    .from('vehicle_photos')
    .select('id, angle_type, file_url, photo_set_id')
    .in('photo_set_id', setIds)
  if (error) throw error
  // Map enum back to lowercase ids the agent/handlers use.
  const ENUM_TO_ANGLE: Record<string, string> = {}
  for (const [k, v] of Object.entries(ANGLE_TO_ENUM)) ENUM_TO_ANGLE[v] = k
  return (data ?? []).map((p: { id: string; angle_type: string | null; file_url: string | null }) => ({
    id: p.id,
    angle: ENUM_TO_ANGLE[p.angle_type ?? ''] ?? 'other',
    storage_path: p.file_url ?? '',
  }))
}

// ── Audit log ────────────────────────────────────────────────────────────────

export async function logAuditEvent(record: {
  deal_id?: string;
  phone?: string;
  event_type: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  const sb = getSupabaseClient();
  const { error } = await sb.from('audit_logs').insert({
    ...record,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Append an immutable audit event for a deal.
 * Alias used by the flow-based webhook handler.
 */
export async function createAuditEvent(
  dealId: string,
  eventType: string,
  actor: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('audit_events').insert({
    deal_id: dealId,
    event_type: eventType,
    actor,
    details: details ?? {},
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ── Ops tasks ────────────────────────────────────────────────────────────────

/**
 * Create an ops task for human review. Writes to the `tasks` table (the one
 * the web dashboard's Queues sidebar + Deal → Tasks tab read from), NOT
 * `ops_tasks` which is a legacy unused table. Maps the bot's lower-case
 * priority to the task_priority enum (LOW/NORMAL/HIGH/URGENT) and routes
 * to a sensible queue based on task_type.
 */
export async function createOpsTask(record: {
  deal_id?: string;
  task_type: string;
  description: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to?: string;
  metadata?: Record<string, unknown>;
}) {
  const sb = getSupabaseClient();
  const priority = (record.priority ?? 'normal').toUpperCase() as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

  const t = (record.task_type ?? '').toLowerCase()
  let queue = 'Q_HUMAN_ESCALATION'
  if (t.includes('doc') || t.includes('review_id') || t.includes('review_poa') || t.includes('statement')) queue = 'Q_BUYER_DOC_REVIEW'
  else if (t.includes('photo')) queue = 'Q_SELLER_PHOTO_REVIEW'
  else if (t.includes('fni') || t.includes('affordab')) queue = 'Q_FNI_REVIEW'
  else if (t.includes('quote')) queue = 'Q_FNI_QUOTE_PREP'
  else if (t.includes('contract')) queue = 'Q_SELLER_CONTRACT'
  else if (t.includes('inspect')) queue = 'Q_HARTCON_INSPECTION'
  else if (t.includes('natis')) queue = 'Q_NATIS_FULFILMENT'
  else if (t.includes('seller')) queue = 'Q_SELLER_FOLLOWUP'

  const { data, error } = await sb
    .from('tasks')
    .insert({
      deal_id: record.deal_id,
      task_type: record.task_type,
      queue,
      priority,
      status: 'PENDING',
      notes: record.description,
      assigned_to: record.assigned_to ?? null,
      created_at: new Date().toISOString(),
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Extraction tasks ─────────────────────────────────────────────────────────

export async function createExtractionTask(documentId: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('extraction_tasks')
    .insert({
      document_id: documentId,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getExtractionResult(documentId: string) {
  // The schema has TWO tables: `documents` (status, file_url, …) and
  // `extraction_results` (per-field rows: field_name, extracted_value,
  // confidence, verification_status). This helper joins them so the agent
  // can read both the document state and the extracted fields in one call.
  const sb = getSupabaseClient();

  const { data: doc, error: docErr } = await sb
    .from('documents')
    .select('id, status, doc_type, extracted_at, error_message')
    .eq('id', documentId)
    .maybeSingle();
  if (docErr) throw docErr;
  if (!doc) return null;

  const { data: rows, error: resErr } = await sb
    .from('extraction_results')
    .select('field_name, extracted_value, confidence, verification_status, created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });
  if (resErr) throw resErr;

  // Take latest row per field_name (results are ordered desc).
  const seen = new Set<string>();
  const latest: Record<string, { value: unknown; confidence: number | null }> = {};
  let confidenceSum = 0;
  let confidenceCount = 0;
  for (const r of rows ?? []) {
    if (seen.has(r.field_name)) continue;
    seen.add(r.field_name);
    latest[r.field_name] = { value: r.extracted_value, confidence: r.confidence };
    if (typeof r.confidence === 'number') {
      confidenceSum += r.confidence;
      confidenceCount += 1;
    }
  }
  const averageConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : null;

  return {
    document_id: documentId,
    status: doc.status,                  // 'uploaded' | 'extracting' | 'extracted' | 'failed'
    doc_type: doc.doc_type,
    extracted_at: doc.extracted_at,
    error_message: doc.error_message,
    fields: latest,
    field_count: Object.keys(latest).length,
    average_confidence: averageConfidence,
  };
}

// ── Seller details ───────────────────────────────────────────────────────────

export async function storeSellerDetails(
  dealId: string,
  details: {
    name: string;
    phone: string;
    vehicle_make?: string;
    vehicle_model?: string;
    vehicle_year?: number;
    vehicle_price?: number;
  },
) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('deals')
    .update({
      seller_name: details.name,
      seller_phone: details.phone,
      vehicle_make: details.vehicle_make,
      vehicle_model: details.vehicle_model,
      vehicle_year: details.vehicle_year,
      vehicle_price: details.vehicle_price,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Quote helpers ────────────────────────────────────────────────────────────

export async function getLatestQuote(dealId: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('quotes')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function recordQuoteResponse(quoteId: string, response: 'accepted' | 'declined') {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('quotes')
    .update({
      buyer_response: response,
      responded_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Contract helpers ─────────────────────────────────────────────────────────

export async function getContract(dealId: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('contracts')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

export async function uploadFileToStorage(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const sb = getSupabaseClient();
  const { error } = await sb.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Alias for uploadFileToStorage — used by the flow-based webhook handler. */
export async function uploadFile(
  bucket: string,
  path: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  return uploadFileToStorage(bucket, path, buffer, mimeType);
}
