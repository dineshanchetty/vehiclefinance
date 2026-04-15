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

export async function getDealByBuyerPhone(phone: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('deals')
    .select('*, buyers(*), sellers(*), vehicles(*)')
    .eq('buyer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getDealBySellerPhone(phone: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('deals')
    .select('*, buyers(*), sellers(*), vehicles(*)')
    .eq('seller_phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
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
  storage_path: string;
  original_filename?: string;
  mime_type?: string;
}) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('documents')
    .insert({ ...record, status: 'uploaded', created_at: new Date().toISOString() })
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

export async function storeVehiclePhoto(record: {
  deal_id: string;
  angle: string;
  storage_path: string;
  original_filename?: string;
}) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('vehicle_photos')
    .upsert(
      { ...record, status: 'received', created_at: new Date().toISOString() },
      { onConflict: 'deal_id,angle' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getVehiclePhotos(dealId: string) {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('vehicle_photos').select('*').eq('deal_id', dealId);
  if (error) throw error;
  return data ?? [];
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

export async function createOpsTask(record: {
  deal_id?: string;
  task_type: string;
  description: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to?: string;
  metadata?: Record<string, unknown>;
}) {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('ops_tasks')
    .insert({
      ...record,
      status: 'pending',
      priority: record.priority ?? 'normal',
      created_at: new Date().toISOString(),
    })
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
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('documents')
    .select('extracted_data, confidence_scores, status')
    .eq('id', documentId)
    .single();
  if (error) throw error;
  return data;
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
