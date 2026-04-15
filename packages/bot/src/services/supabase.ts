/**
 * Supabase client and helper functions for the bot package.
 *
 * Uses the service-role key (bypasses RLS) since the bot runs server-side.
 *
 * Environment variables required:
 *   SUPABASE_URL         — project URL, e.g. https://xyz.supabase.co
 *   SUPABASE_SERVICE_KEY — service-role secret key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DealStatus } from '../types/index.js';

const log = (level: 'info' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), service: 'supabase', level, msg, data };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY');
  }

  _supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// Deal helpers
// ---------------------------------------------------------------------------

export interface Deal {
  id: string;
  status: DealStatus;
  buyer_phone: string;
  seller_phone: string | null;
  vehicle_id: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

/**
 * Fetch a deal by its primary key.
 *
 * @param dealId - UUID of the deal
 * @returns The deal record, or null if not found
 */
export async function getDeal(dealId: string): Promise<Deal | null> {
  log('info', 'getDeal', { dealId });
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .maybeSingle();

  if (error) {
    log('error', 'getDeal failed', { dealId, error });
    throw error;
  }

  return data as Deal | null;
}

/**
 * Update the status of a deal and record the updated_at timestamp.
 *
 * @param dealId - UUID of the deal
 * @param status - New deal status
 */
export async function updateDealStatus(dealId: string, status: DealStatus): Promise<void> {
  log('info', 'updateDealStatus', { dealId, status });
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('deals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', dealId);

  if (error) {
    log('error', 'updateDealStatus failed', { dealId, status, error });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Audit log helpers
// ---------------------------------------------------------------------------

/**
 * Append an immutable audit event for a deal.
 *
 * @param dealId    - UUID of the deal
 * @param eventType - Short descriptive identifier, e.g. "doc_uploaded", "quote_sent"
 * @param actor     - Who triggered the event: phone number, system identifier, or "bot"
 * @param details   - Arbitrary JSON payload with event context
 */
export async function createAuditEvent(
  dealId: string,
  eventType: string,
  actor: string,
  details?: Record<string, unknown>,
): Promise<void> {
  log('info', 'createAuditEvent', { dealId, eventType, actor });
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('audit_events').insert({
    deal_id: dealId,
    event_type: eventType,
    actor,
    details: details ?? {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    log('error', 'createAuditEvent failed', { dealId, eventType, error });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Upload a file buffer to Supabase Storage and return the public URL.
 *
 * @param bucket   - Storage bucket name, e.g. "deal-documents"
 * @param path     - Object path within the bucket, e.g. "deals/uuid/id_doc.pdf"
 * @param buffer   - File bytes
 * @param mimeType - MIME type, e.g. "application/pdf"
 * @returns Public URL of the uploaded file
 */
export async function uploadFile(
  bucket: string,
  path: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  log('info', 'uploadFile', { bucket, path });
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    log('error', 'uploadFile failed', { bucket, path, error });
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
