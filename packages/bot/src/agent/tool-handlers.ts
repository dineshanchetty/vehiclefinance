import {
  downloadAndStoreMedia,
  sendTextMessage,
  sendInteractiveMessage,
  sendListMessage,
  type Button,
  type ListSection,
} from '../services/dialog360.js';
import { sendSMS as bulkSmsSend } from '../services/bulksms.js';
import { sendEmail as sgSendEmail } from '../services/sendgrid.js';
import {
  getDealByBuyerPhone,
  getDealBySellerPhone,
  updateDealStatus as dbUpdateDealStatus,
  storeDocument as dbStoreDocument,
  createExtractionTask,
  getExtractionResult,
  updateDocumentExtraction,
  storeVehiclePhoto as dbStoreVehiclePhoto,
  getVehiclePhotos,
  createOpsTask,
  logAuditEvent as dbLogAuditEvent,
  storeSellerDetails as dbStoreSellerDetails,
  getLatestQuote,
  recordQuoteResponse as dbRecordQuoteResponse,
  getContract,
  getSupabaseClient,
} from '../services/supabase.js';

const MANDATORY_ANGLES = [
  'front',
  'rear',
  'driver_side',
  'passenger_side',
  'interior_front',
  'interior_rear',
  'engine_bay',
  'boot',
  'odometer',
] as const;

type ToolInput = Record<string, unknown>;
type ToolResult = { success: boolean; [key: string]: unknown };

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handle_get_deal_info(input: ToolInput): Promise<ToolResult> {
  const { phone, party_type } = input as { phone: string; party_type: 'buyer' | 'seller' };
  const deal =
    party_type === 'buyer'
      ? await getDealByBuyerPhone(phone)
      : await getDealBySellerPhone(phone);

  if (!deal) {
    return { success: false, error: 'No active deal found for this phone number' };
  }
  return { success: true, deal };
}

export async function handle_update_deal_status(input: ToolInput): Promise<ToolResult> {
  const { deal_id, status } = input as { deal_id: string; status: string };
  const VALID_STATUSES = [
    'new', 'popia_consent_pending', 'id_uploaded', 'address_uploaded',
    'statements_uploaded', 'seller_details_captured', 'under_review',
    'quote_sent', 'quote_accepted', 'quote_declined', 'contract_sent',
    'seller_onboarding', 'seller_docs_complete', 'completed', 'cancelled',
  ];
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, error: `Invalid status "${status}". Valid statuses: ${VALID_STATUSES.join(', ')}` };
  }
  const updated = await dbUpdateDealStatus(deal_id, status);
  return { success: true, deal: updated };
}

// Maps the agent's flexible naming onto the strict `document_type` enum.
// Enum: SA_ID_SMART_CARD, SA_ID_GREEN_BOOK, PROOF_OF_ADDRESS, BANK_STATEMENT,
//       PAYSLIP, VEHICLE_NATIS, VEHICLE_REGISTRATION, SETTLEMENT_LETTER,
//       VEHICLE_PHOTO, OTHER.
function normalizeDocumentType(raw: string): string {
  const k = raw.toUpperCase().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    ID: 'SA_ID_SMART_CARD',
    ID_DOCUMENT: 'SA_ID_SMART_CARD',
    SA_ID: 'SA_ID_SMART_CARD',
    SOUTH_AFRICAN_ID: 'SA_ID_SMART_CARD',
    PASSPORT: 'OTHER',
    GREEN_BOOK: 'SA_ID_GREEN_BOOK',
    POA: 'PROOF_OF_ADDRESS',
    PROOF_OF_ADDRESS: 'PROOF_OF_ADDRESS',
    UTILITY_BILL: 'PROOF_OF_ADDRESS',
    MUNICIPAL_BILL: 'PROOF_OF_ADDRESS',
    BANK_STATEMENT: 'BANK_STATEMENT',
    STATEMENT: 'BANK_STATEMENT',
    BANK_STATEMENTS: 'BANK_STATEMENT',
    PAYSLIP: 'PAYSLIP',
    PAY_SLIP: 'PAYSLIP',
    NATIS: 'VEHICLE_NATIS',
    VEHICLE_NATIS: 'VEHICLE_NATIS',
    REGISTRATION: 'VEHICLE_REGISTRATION',
    VEHICLE_REGISTRATION: 'VEHICLE_REGISTRATION',
    SETTLEMENT_LETTER: 'SETTLEMENT_LETTER',
    VEHICLE_PHOTO: 'VEHICLE_PHOTO',
    PHOTO: 'VEHICLE_PHOTO',
  };
  return map[k] ?? 'OTHER';
}

export async function handle_store_document(input: ToolInput): Promise<ToolResult> {
  const { deal_id, party_type, document_type, media_id, mime_type } = input as {
    deal_id: string;
    party_type: 'buyer' | 'seller';
    document_type: string;
    media_id: string;
    mime_type?: string;
  };
  const docTypeEnum = normalizeDocumentType(document_type);

  // Resolve extension from mime BEFORE downloading. We may not have a mime
  // hint from the agent yet — pass undefined and let downloadAndStoreMedia
  // discover the real mime from Dialog360, then fix the storage path.
  const provisionalExt = mime_type?.split('/')[1] ?? 'jpg';
  const ts = Date.now();
  const storagePath = `${deal_id}/${party_type}/${docTypeEnum}_${ts}.${provisionalExt}`;

  const { publicUrl, mimeType: actualMime } = await downloadAndStoreMedia(media_id, storagePath);

  const doc = await dbStoreDocument({
    deal_id,
    party_type,
    document_type: docTypeEnum,            // normalized to the document_type enum
    storage_path: publicUrl,
    mime_type: actualMime,                 // use the REAL mime from Dialog360, not the agent's hint
  });

  return { success: true, document_id: doc.id, storage_path: publicUrl };
}

export async function handle_trigger_extraction(input: ToolInput): Promise<ToolResult> {
  const { document_id } = input as { document_id: string };

  // Create the pending task row first so get_extraction_results can poll it.
  const task = await createExtractionTask(document_id);

  // Invoke the extract-document edge function asynchronously.
  // SUPABASE_URL is available in the bot's server environment.
  const edgeFnUrl = process.env.SUPABASE_URL
    ? `${process.env.SUPABASE_URL}/functions/v1/extract-document`
    : null;

  if (edgeFnUrl) {
    // Fire-and-forget — the edge function updates the document/task rows itself.
    fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      },
      body: JSON.stringify({ document_id }),
    }).catch((err: unknown) => {
      // Log but do not surface to the bot conversation — the task status will
      // reflect failure and the operator can retry from the review UI.
      console.error('[trigger_extraction] edge function call failed:', err);
    });
  } else {
    console.warn('[trigger_extraction] SUPABASE_URL not set — edge function NOT called. Task created in pending state.');
  }

  return {
    success: true,
    task_id: task.id,
    message: 'Extraction started. Check results in 10–20 seconds using get_extraction_results.',
  };
}

export async function handle_get_extraction_results(input: ToolInput): Promise<ToolResult> {
  const { document_id } = input as { document_id: string };

  // Fetch document extraction status
  const result = await getExtractionResult(document_id);
  if (!result) {
    return { success: false, error: 'Document not found' };
  }

  if (result.status !== 'extracted') {
    // Also check extraction_tasks for a more descriptive status / error message
    const { getSupabaseClient } = await import('../services/supabase.js');
    const sb = getSupabaseClient();
    const { data: taskRow } = await sb
      .from('extraction_tasks')
      .select('status, error_message, created_at')
      .eq('document_id', document_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const taskStatus = taskRow?.status ?? result.status ?? 'pending';
    if (taskStatus === 'failed') {
      return {
        success: false,
        status: 'failed',
        error: taskRow?.error_message ?? 'Extraction failed. Please try again or contact support.',
      };
    }

    return {
      success: true,
      status: taskStatus,
      message: 'Extraction still in progress. Please try again in a moment.',
    };
  }

  return {
    success: true,
    status: 'extracted',
    fields: result.fields,                    // { field_name: { value, confidence } }
    field_count: result.field_count,
    average_confidence: result.average_confidence,
  };
}

// ─── Manual fallback / direct field capture ────────────────────────────────
// These bypass extraction entirely — used when (a) the user types data instead
// of uploading, or (b) extraction failed/low-confidence and we offered manual
// entry. Either path writes the same buyer/seller row, so the deal can complete.

const ALLOWED_BUYER_COLUMNS = new Set([
  'full_name', 'id_number', 'date_of_birth', 'gender', 'nationality',
  'email', 'physical_address', 'suburb', 'city', 'postal_code',
  'employer_name', 'employment_duration', 'monthly_income',
]);

const ALLOWED_SELLER_COLUMNS = new Set([
  'full_name', 'id_number', 'date_of_birth', 'email',
  'physical_address', 'suburb', 'city', 'postal_code',
  // POPIA: bot writes these once the seller taps "I agree".
  'consent_status', 'consent_timestamp',
  // Banking for payout — captured during seller onboarding.
  'bank_name', 'bank_account_number',
]);

async function upsertPartyRecord(
  table: 'buyers' | 'sellers',
  dealId: string,
  fields: Record<string, unknown>,
  allowed: Set<string>,
  source: string,
): Promise<ToolResult> {
  const sb = getSupabaseClient();
  // Whitelist + drop empties so the agent can't smuggle unknown columns.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.has(k)) continue;
    if (v === null || v === '' || v === undefined) continue;
    clean[k] = v;
  }
  if (Object.keys(clean).length === 0) {
    return { success: false, error: 'No allowed fields supplied.' };
  }
  clean.updated_at = new Date().toISOString();

  // Find existing row for this deal — we want a single buyer/seller per deal.
  const { data: existing } = await sb
    .from(table)
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let result;
  if (existing?.id) {
    result = await sb.from(table).update(clean).eq('id', existing.id).select().single();
  } else {
    result = await sb.from(table).insert({ deal_id: dealId, ...clean }).select().single();
  }
  if (result.error) return { success: false, error: result.error.message };

  await dbLogAuditEvent({
    deal_id: dealId,
    event_type: `${table.slice(0,-1)}_data_${source ?? 'updated'}`,
    description: `Updated ${table.slice(0,-1)} fields: ${Object.keys(clean).filter(k=>k!=='updated_at').join(', ')}`,
    metadata: { source, fields: Object.keys(clean) },
  });
  return { success: true, [`${table.slice(0,-1)}_id`]: result.data.id, fields_set: Object.keys(clean).filter(k=>k!=='updated_at') };
}

// ─── Document-vs-buyer cross-check ─────────────────────────────────────────
// Detects fraud / wrong-doc / typo cases by comparing what was just extracted
// against the buyer record captured from the Offer To Purchase.

function normaliseName(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = normaliseName(a);
  const tb = normaliseName(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  // Token-set overlap. SA names often appear as "SURNAME FIRSTNAME" on ID and
  // "Firstname Surname" elsewhere — order shouldn't matter.
  const sa = new Set(ta);
  const sb = new Set(tb);
  let common = 0;
  for (const t of sa) if (sb.has(t)) common += 1;
  return common / Math.max(sa.size, sb.size);
}

function readExtracted(extracted: Record<string, unknown>, key: string): string | null {
  const f = extracted[key];
  if (f && typeof f === 'object' && 'value' in (f as Record<string, unknown>)) {
    const v = (f as { value?: unknown }).value;
    return v == null ? null : String(v);
  }
  return f == null ? null : String(f);
}

export async function handle_verify_document_against_buyer(input: ToolInput): Promise<ToolResult> {
  const { deal_id, doc_type, extracted } = input as {
    deal_id: string;
    doc_type: string;
    extracted: Record<string, unknown>;
  };
  const sb = getSupabaseClient();

  const { data: buyer } = await sb
    .from('buyers')
    .select('full_name, id_number, physical_address, suburb, city, postal_code')
    .eq('deal_id', deal_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!buyer) {
    return {
      success: true, severity: 'warning',
      mismatches: ['no_buyer_record_yet'],
      message: 'No buyer captured yet (OTP not uploaded?). Proceeding with caution.',
    };
  }

  const mismatches: Array<{ field: string; expected: unknown; actual: unknown; reason?: string }> = [];

  if (doc_type === 'SA_ID_SMART_CARD' || doc_type === 'SA_ID_GREEN_BOOK') {
    const idActual = readExtracted(extracted, 'id_number');
    const nameActual = readExtracted(extracted, 'full_name');

    // Strict: id_number must match OTP buyer_id_number
    if (buyer.id_number && idActual && buyer.id_number !== idActual) {
      mismatches.push({
        field: 'id_number',
        expected: buyer.id_number,
        actual: idActual,
        reason: 'ID number on the SA ID document does not match the buyer ID number on the Offer To Purchase.',
      });
    }
    // Fuzzy: name should overlap meaningfully
    const sim = nameSimilarity(buyer.full_name, nameActual);
    if (buyer.full_name && nameActual && sim < 0.4) {
      mismatches.push({
        field: 'full_name',
        expected: buyer.full_name,
        actual: nameActual,
        reason: `Name on ID does not match buyer name on OTP (token overlap ${Math.round(sim * 100)}%).`,
      });
    }
  } else if (doc_type === 'PROOF_OF_ADDRESS') {
    const holderActual = readExtracted(extracted, 'account_holder_name');
    const dateActual = readExtracted(extracted, 'document_date');

    const sim = nameSimilarity(buyer.full_name, holderActual);
    if (buyer.full_name && holderActual && sim < 0.4) {
      mismatches.push({
        field: 'account_holder_name',
        expected: buyer.full_name,
        actual: holderActual,
        reason: `Account holder on the proof of address does not match buyer name on OTP (overlap ${Math.round(sim * 100)}%).`,
      });
    }

    // Document must be ≤ 90 days old
    if (dateActual) {
      const docDate = new Date(dateActual);
      if (!Number.isNaN(docDate.getTime())) {
        const ageDays = (Date.now() - docDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 90) {
          mismatches.push({
            field: 'document_date',
            expected: '≤ 90 days old',
            actual: `${Math.round(ageDays)} days old`,
            reason: `Proof of address is ${Math.round(ageDays)} days old; SA finance requires ≤ 90 days.`,
          });
        }
      }
    }
  } else if (doc_type === 'BANK_STATEMENT') {
    const holderActual = readExtracted(extracted, 'account_holder');
    const accountType = readExtracted(extracted, 'account_type')?.toLowerCase() ?? '';

    if (accountType === 'business') {
      mismatches.push({
        field: 'account_type',
        expected: 'personal',
        actual: 'business',
        reason: 'WesBank Private Deal needs a personal bank statement, not a business one.',
      });
    }
    const sim = nameSimilarity(buyer.full_name, holderActual);
    if (buyer.full_name && holderActual && sim < 0.4) {
      mismatches.push({
        field: 'account_holder',
        expected: buyer.full_name,
        actual: holderActual,
        reason: `Account holder on the bank statement does not match the buyer name on the ID/OTP (overlap ${Math.round(sim * 100)}%).`,
      });
    }
  }

  const hasStrictMismatch = mismatches.some((m) =>
    m.field === 'id_number' || m.field === 'account_type' || m.field === 'document_date'
  );
  const severity = mismatches.length === 0 ? 'ok' : hasStrictMismatch ? 'reject' : 'warning';

  // Audit any non-OK case so ops can see them later
  if (mismatches.length > 0) {
    await dbLogAuditEvent({
      deal_id,
      event_type: 'document_mismatch',
      description: `${doc_type} did not fully match buyer record`,
      metadata: { doc_type, severity, mismatches },
    });
  }

  return {
    success: true,
    severity,
    matches: mismatches.length === 0,
    mismatches,
    buyer_snapshot: {
      full_name: buyer.full_name,
      id_number: buyer.id_number,
    },
    action:
      severity === 'reject'
        ? 'Block. Show 3-button: "Re-upload" / "Fix the OTP" / "Talk to a consultant".'
        : severity === 'warning'
        ? 'Proceed but quote the discrepancy in the confirmation message.'
        : 'Proceed normally.',
  };
}

// ─── Bulk populate from OTP extraction ────────────────────────────────────
// One call writes buyer + seller + vehicle + deal price from the OTP fields.

const ALLOWED_VEHICLE_COLUMNS = new Set([
  'make', 'model', 'year', 'registration_number', 'vin', 'engine_number',
  'colour', 'asking_price', 'odometer_reading',
]);

function readField(otp: Record<string, unknown>, key: string): unknown {
  const f = otp[key] as { value?: unknown } | undefined;
  if (!f) return null;
  // Some agents pass {value, confidence}; others pass plain strings. Handle both.
  if (typeof f === 'object' && 'value' in f) return f.value ?? null;
  return f as unknown;
}

function asNumeric(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function handle_bulk_populate_from_otp(input: ToolInput): Promise<ToolResult> {
  const { deal_id, otp_fields } = input as {
    deal_id: string;
    otp_fields: Record<string, unknown>;
  };
  const sb = getSupabaseClient();

  // ── Buyer fields (whitelist via existing constant) ──
  const buyerFields: Record<string, unknown> = {
    full_name:        readField(otp_fields, 'buyer_full_name'),
    id_number:        readField(otp_fields, 'buyer_id_number'),
    physical_address: readField(otp_fields, 'buyer_address'),
    email:            readField(otp_fields, 'buyer_email'),
  };
  await upsertPartyRecord('buyers', deal_id, buyerFields, ALLOWED_BUYER_COLUMNS, 'extraction_otp');

  // ── Seller fields ──
  const sellerFields: Record<string, unknown> = {
    full_name:        readField(otp_fields, 'seller_full_name'),
    id_number:        readField(otp_fields, 'seller_id_number'),
    phone:            readField(otp_fields, 'seller_phone'),
    email:            readField(otp_fields, 'seller_email'),
    physical_address: readField(otp_fields, 'seller_address'),
    bank_name:        readField(otp_fields, 'seller_bank_name'),
    bank_account_number: readField(otp_fields, 'seller_bank_account'),
  };
  // Sellers table allows the columns above (incl. ones we just migrated). Use a
  // dedicated upsert that doesn't go through the buyer-only ALLOWED_BUYER_COLUMNS.
  const sellerClean: Record<string, unknown> = {};
  const sellerAllowed = new Set([
    'full_name','id_number','phone','email','physical_address','bank_name','bank_account_number',
  ]);
  for (const [k, v] of Object.entries(sellerFields)) {
    if (!sellerAllowed.has(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    sellerClean[k] = v;
  }
  if (Object.keys(sellerClean).length > 0) {
    sellerClean.updated_at = new Date().toISOString();
    const { data: existingSeller } = await sb
      .from('sellers').select('id').eq('deal_id', deal_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existingSeller?.id) {
      await sb.from('sellers').update(sellerClean).eq('id', existingSeller.id);
    } else {
      await sb.from('sellers').insert({ deal_id, ...sellerClean });
    }
  }

  // ── Vehicle fields ──
  const yearVal = readField(otp_fields, 'vehicle_year');
  const yearNum = yearVal ? parseInt(String(yearVal), 10) : null;
  const priceNum = asNumeric(readField(otp_fields, 'agreed_price'));
  const vehicleFields: Record<string, unknown> = {
    make:                readField(otp_fields, 'vehicle_make'),
    model:               readField(otp_fields, 'vehicle_model'),
    year:                Number.isFinite(yearNum) ? yearNum : null,
    registration_number: readField(otp_fields, 'vehicle_registration'),
    vin:                 readField(otp_fields, 'vehicle_vin'),
    engine_number:       readField(otp_fields, 'vehicle_engine'),
    colour:              readField(otp_fields, 'vehicle_colour'),
    odometer_reading:    readField(otp_fields, 'vehicle_mileage')?.toString?.() ?? null,
    asking_price:        priceNum,
  };
  const vehicleClean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vehicleFields)) {
    if (!ALLOWED_VEHICLE_COLUMNS.has(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    vehicleClean[k] = v;
  }
  if (Object.keys(vehicleClean).length > 0) {
    vehicleClean.updated_at = new Date().toISOString();
    const { data: existingVehicle } = await sb
      .from('vehicles').select('id').eq('deal_id', deal_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existingVehicle?.id) {
      await sb.from('vehicles').update(vehicleClean).eq('id', existingVehicle.id);
    } else {
      await sb.from('vehicles').insert({ deal_id, ...vehicleClean });
    }
  }

  // ── Deal: capture price into phase_state for affordability/quote later ──
  const dealUpdates: Record<string, unknown> = {};
  if (priceNum) {
    const { data: deal } = await sb
      .from('deals').select('phase_state').eq('id', deal_id).single();
    const ps = (deal?.phase_state ?? {}) as Record<string, unknown>;
    ps.agreed_price = priceNum;
    dealUpdates.phase_state = ps;
  }
  if (Object.keys(dealUpdates).length > 0) {
    await sb.from('deals').update(dealUpdates).eq('id', deal_id);
  }

  await dbLogAuditEvent({
    deal_id,
    event_type: 'otp_bulk_populated',
    description: `OTP populated buyer/seller/vehicle (price R${priceNum ?? 'n/a'})`,
    metadata: {
      buyer_fields_set: Object.keys(buyerFields).filter((k) => buyerFields[k]),
      seller_fields_set: Object.keys(sellerClean),
      vehicle_fields_set: Object.keys(vehicleClean),
      agreed_price: priceNum,
    },
  });

  return {
    success: true,
    deal_id,
    populated: {
      buyer:   Object.keys(buyerFields).filter((k) => buyerFields[k]).length,
      seller:  Object.keys(sellerClean).length,
      vehicle: Object.keys(vehicleClean).length,
    },
    agreed_price: priceNum,
  };
}

export async function handle_update_vehicle_record(input: ToolInput): Promise<ToolResult> {
  const { deal_id, fields, source } = input as {
    deal_id: string; fields: Record<string, unknown>; source?: string;
  };
  const sb = getSupabaseClient();
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_VEHICLE_COLUMNS.has(k)) continue;
    if (v === null || v === '' || v === undefined) continue;
    clean[k] = v;
  }
  if (Object.keys(clean).length === 0) return { success: false, error: 'No allowed fields supplied.' };
  clean.updated_at = new Date().toISOString();

  const { data: existing } = await sb
    .from('vehicles').select('id').eq('deal_id', deal_id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  let result;
  if (existing?.id) {
    result = await sb.from('vehicles').update(clean).eq('id', existing.id).select().single();
  } else {
    result = await sb.from('vehicles').insert({ deal_id, ...clean }).select().single();
  }
  if (result.error) return { success: false, error: result.error.message };

  await dbLogAuditEvent({
    deal_id,
    event_type: `vehicle_data_${source ?? 'updated'}`,
    description: `Vehicle fields updated: ${Object.keys(clean).filter((k)=>k!=='updated_at').join(', ')}`,
    metadata: { source, fields: Object.keys(clean) },
  });
  return { success: true, vehicle_id: result.data.id, fields_set: Object.keys(clean).filter((k)=>k!=='updated_at') };
}

export async function handle_update_buyer_record(input: ToolInput): Promise<ToolResult> {
  const { deal_id, fields, source } = input as {
    deal_id: string; fields: Record<string, unknown>; source?: string;
  };
  return upsertPartyRecord('buyers', deal_id, fields, ALLOWED_BUYER_COLUMNS, source ?? 'extraction');
}

export async function handle_update_seller_record(input: ToolInput): Promise<ToolResult> {
  const { deal_id, fields, source } = input as {
    deal_id: string; fields: Record<string, unknown>; source?: string;
  };
  return upsertPartyRecord('sellers', deal_id, fields, ALLOWED_SELLER_COLUMNS, source ?? 'extraction');
}

export async function handle_confirm_buyer_data(input: ToolInput): Promise<ToolResult> {
  const { deal_id, document_id, confirmed_fields } = input as {
    deal_id: string;
    document_id: string;
    confirmed_fields: Record<string, string>;
  };
  await updateDocumentExtraction(document_id, confirmed_fields, {});
  await dbLogAuditEvent({
    deal_id,
    event_type: 'buyer_data_confirmed',
    description: `Buyer confirmed fields: ${Object.keys(confirmed_fields).join(', ')}`,
    metadata: { document_id, confirmed_fields },
  });
  return { success: true, message: 'Buyer data confirmed and stored.' };
}

export async function handle_confirm_seller_data(input: ToolInput): Promise<ToolResult> {
  const { deal_id, document_id, confirmed_fields } = input as {
    deal_id: string;
    document_id: string;
    confirmed_fields: Record<string, string>;
  };
  await updateDocumentExtraction(document_id, confirmed_fields, {});
  await dbLogAuditEvent({
    deal_id,
    event_type: 'seller_data_confirmed',
    description: `Seller confirmed fields: ${Object.keys(confirmed_fields).join(', ')}`,
    metadata: { document_id, confirmed_fields },
  });
  return { success: true, message: 'Seller data confirmed and stored.' };
}

export async function handle_store_vehicle_photo(input: ToolInput): Promise<ToolResult> {
  const { deal_id, angle: angleHint, media_id, mime_type } = input as {
    deal_id: string;
    angle?: string;            // now optional — agent can pass 'auto'
    media_id: string;
    mime_type?: string;
  };

  // Auto-classify if no explicit angle was supplied OR the hint is 'auto'.
  let angle = angleHint && angleHint !== 'auto' ? angleHint : null;

  // Pull the bytes once. If we need to classify, reuse them; otherwise just
  // store directly.
  const { downloadMedia } = await import('../services/dialog360.js');
  const { buffer, mimeType: actualMime } = await downloadMedia(media_id);
  const effectiveMime = mime_type ?? actualMime ?? 'image/jpeg';

  if (!angle) {
    angle = await classifyVehiclePhotoAngle(buffer, effectiveMime);
  }

  // Store the bytes via the storage helper. We re-download via
  // downloadAndStoreMedia for the side-effect of writing to Supabase Storage
  // (it has the proper public-URL plumbing). Cheap second call.
  const ext = effectiveMime.split('/')[1] ?? 'jpg';
  const storagePath = `vehicle-photos/${deal_id}/${angle}_${Date.now()}.${ext}`;
  const { publicUrl } = await downloadAndStoreMedia(media_id, storagePath);

  const photo = await dbStoreVehiclePhoto({
    deal_id,
    angle,
    storage_path: publicUrl,
  });

  // Compute remaining angles so the agent can give a clean progress update
  // back to the seller in one go.
  const all = await getVehiclePhotos(deal_id);
  const receivedAngles = all.map((p: { angle: string }) => p.angle);
  const missingAngles = MANDATORY_ANGLES.filter((a) => !receivedAngles.includes(a));

  return {
    success: true,
    photo_id: photo.id,
    classified_angle: angle,
    auto_classified: !angleHint || angleHint === 'auto',
    replaced: (photo as { replaced?: boolean }).replaced === true,
    storage_path: publicUrl,
    received: receivedAngles.length,
    total_required: MANDATORY_ANGLES.length,
    missing_angles: missingAngles,
    complete: missingAngles.length === 0,
  };
}

/**
 * Use Claude Vision to classify a vehicle photo into one of the 9 mandatory
 * angles. Returns the best match. If Claude is unsure, returns 'other' which
 * the agent can present back to the user for confirmation.
 */
async function classifyVehiclePhotoAngle(buffer: Buffer, mime: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = buffer.toString('base64');

  const prompt =
    `You are classifying a single photo of a SOUTH AFRICAN car (right-hand drive). Return ONE of these ids and nothing else:\n\n` +
    `**Exterior (whole-car shots — at least one whole side of the car visible):**\n` +
    `- front:           Headlights + grille + bumper visible. Camera in front of the car.\n` +
    `- rear:            Taillights + number plate visible from behind. Camera behind the car. (NOT interior_rear.)\n` +
    `- driver_side:     RIGHT side profile of the car (driver door visible, RHD market).\n` +
    `- passenger_side:  LEFT side profile of the car (passenger door visible, RHD market).\n\n` +
    `**Interior (camera INSIDE the cabin):**\n` +
    `- interior_front:  Front seats + door card or steering wheel from the seat side. Steering wheel visible but NOT the dashboard cluster as the main subject.\n` +
    `- interior_rear:   Rear bench / back seats / rear door cards from inside.\n` +
    `- odometer:        Close-up of the **instrument cluster** — speedometer, tachometer, kilometre / mileage reading is the primary subject. Typically dominated by round dials and a digital number.\n\n` +
    `**Compartments (something is OPEN):**\n` +
    `- engine_bay:      Bonnet/hood open, engine visible.\n` +
    `- boot:            Boot/trunk open, cargo area visible. (Not "boot from outside while closed" — that's "rear".)\n\n` +
    `### Tie-breakers\n` +
    `- If steering wheel is visible AND the speedo/tacho fills most of the frame → **odometer**.\n` +
    `- If steering wheel is visible AND you also see the door / windscreen / centre console → **interior_front**.\n` +
    `- If the photo shows the back of the car from outside (number plate, taillights, closed boot) → **rear**, NEVER interior_rear or boot.\n` +
    `- If the car is at an angle (front-3/4, rear-3/4) pick the dominant side: more headlights/grille → front; more taillights → rear; more side panels → driver_side / passenger_side.\n\n` +
    `Output EXACTLY ONE of: front, rear, driver_side, passenger_side, interior_front, interior_rear, engine_bay, boot, odometer\n` +
    `If genuinely ambiguous and none is clearly dominant, output: other`;

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 32,
      messages: [{
        role: 'user',
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: mime as 'image/jpeg', data: base64 } },
          { type: 'text' as const, text: prompt },
        ],
      }],
    });
    const text = (resp.content.find((b) => b.type === 'text') as { text?: string } | undefined)?.text?.trim().toLowerCase() ?? '';
    const match = MANDATORY_ANGLES.find((a) => text.startsWith(a) || text === a);
    return match ?? 'other';
  } catch (err) {
    console.warn('[classifyVehiclePhotoAngle] vision call failed:', err);
    return 'other';
  }
}

export async function handle_get_photo_progress(input: ToolInput): Promise<ToolResult> {
  const { deal_id } = input as { deal_id: string };
  const photos = await getVehiclePhotos(deal_id);
  const receivedAngles = photos.map((p: { angle: string }) => p.angle);
  const missingAngles = MANDATORY_ANGLES.filter((a) => !receivedAngles.includes(a));

  return {
    success: true,
    total_required: MANDATORY_ANGLES.length,
    received: receivedAngles.length,
    received_angles: receivedAngles,
    missing_angles: missingAngles,
    complete: missingAngles.length === 0,
  };
}

export async function handle_trigger_photo_evaluation(input: ToolInput): Promise<ToolResult> {
  const { deal_id } = input as { deal_id: string };
  // Placeholder: in production this publishes to a vision evaluation queue
  await createOpsTask({
    deal_id,
    task_type: 'photo_evaluation',
    description: `Trigger photo quality evaluation for deal ${deal_id}`,
    priority: 'normal',
    metadata: { deal_id },
  });
  return { success: true, message: 'Photo evaluation triggered. Results will be available shortly.' };
}

export async function handle_get_photo_evaluation(input: ToolInput): Promise<ToolResult> {
  const { deal_id } = input as { deal_id: string };
  const { getSupabaseClient } = await import('../services/supabase.js');
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('photo_evaluations')
    .select('*')
    .eq('deal_id', deal_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    return { success: true, status: 'pending', message: 'Evaluation not yet complete.' };
  }
  return { success: true, evaluation: data };
}

export async function handle_send_whatsapp_message(input: ToolInput): Promise<ToolResult> {
  const { phone, message } = input as { phone: string; message: string };
  await sendTextMessage(phone, message);
  return { success: true, message: `WhatsApp message sent to ${phone}` };
}

// ─── Phase / state machine ─────────────────────────────────────────────────

const VALID_PHASES = [
  'POPIA_CONSENT', 'PRICE_GATE', 'ID_DOC', 'PROOF_OF_ADDRESS',
  'BANK_STATEMENTS', 'AFFORDABILITY', 'CREDIT_DECISION',
  'SELLER_DETAILS', 'INSPECTION_REVIEW', 'QUOTE', 'CONTRACT',
  'HANDOVER', 'PAYOUT', 'DONE',
] as const;

export async function handle_get_deal_phase(input: ToolInput): Promise<ToolResult> {
  const { phone } = input as { phone: string };
  const sb = getSupabaseClient();

  // 1. Look up an existing deal via buyers table (reverse FK).
  let dealId: string | null = null;
  const { data: buyerRow } = await sb
    .from('buyers')
    .select('deal_id')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (buyerRow?.deal_id) dealId = buyerRow.deal_id;

  // 2. Otherwise via sellers table.
  if (!dealId) {
    const { data: sellerRow } = await sb
      .from('sellers')
      .select('deal_id')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sellerRow?.deal_id) dealId = sellerRow.deal_id;
  }

  // 3. If found, return its phase state.
  if (dealId) {
    const { data: deal, error: dealErr } = await sb
      .from('deals')
      .select('id, current_phase, phase_state, completed_milestones')
      .eq('id', dealId)
      .single();
    if (dealErr || !deal) {
      return { success: false, error: `Deal ${dealId} lookup failed: ${dealErr?.message}` };
    }
    return {
      success: true,
      deal_id: deal.id,
      phase: deal.current_phase,
      state: deal.phase_state ?? {},
      completed_milestones: deal.completed_milestones ?? [],
      is_new: false,
    };
  }

  // 4. No deal — auto-create a fresh one for this new buyer (deal + buyer row).
  const { data: newDeal, error: dealInsErr } = await sb
    .from('deals')
    .insert({
      status: 'APPLICATION_INITIATED',
      current_phase: 'POPIA_CONSENT',
      phase_state: {},
      completed_milestones: [],
    })
    .select('id, current_phase, phase_state, completed_milestones')
    .single();
  if (dealInsErr || !newDeal) {
    return { success: false, error: `Could not auto-create deal: ${dealInsErr?.message}` };
  }

  const { error: buyerInsErr } = await sb.from('buyers').insert({
    deal_id: newDeal.id,
    phone,
  });
  if (buyerInsErr) {
    return { success: false, error: `Deal created but buyer row failed: ${buyerInsErr.message}` };
  }

  await dbLogAuditEvent({
    deal_id: newDeal.id,
    event_type: 'deal_created',
    description: `New buyer deal auto-created from WhatsApp ${phone}`,
    metadata: { phone },
  });

  return {
    success: true,
    deal_id: newDeal.id,
    phase: newDeal.current_phase,
    state: newDeal.phase_state ?? {},
    completed_milestones: newDeal.completed_milestones ?? [],
    is_new: true,
  };
}

export async function handle_advance_deal_phase(input: ToolInput): Promise<ToolResult> {
  const { deal_id, to_phase, milestone, capture } = input as {
    deal_id: string;
    to_phase: string;
    milestone: string;
    capture?: Record<string, unknown>;
  };
  if (!VALID_PHASES.includes(to_phase as typeof VALID_PHASES[number])) {
    return { success: false, error: `Unknown phase: ${to_phase}` };
  }

  const sb = getSupabaseClient();
  // Read existing state so we can merge captures + append milestones.
  const { data: existing, error: readErr } = await sb
    .from('deals')
    .select('phase_state, completed_milestones, current_phase')
    .eq('id', deal_id)
    .single();
  if (readErr || !existing) {
    return { success: false, error: `Deal ${deal_id} not found` };
  }

  const nextState = { ...(existing.phase_state ?? {}), ...(capture ?? {}) };
  const nextMilestones = Array.from(
    new Set([...(existing.completed_milestones ?? []), milestone]),
  );

  const { error: updErr } = await sb
    .from('deals')
    .update({
      current_phase: to_phase,
      phase_state: nextState,
      completed_milestones: nextMilestones,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deal_id);
  if (updErr) return { success: false, error: updErr.message };

  await dbLogAuditEvent({
    deal_id,
    event_type: 'phase_advanced',
    description: `Phase: ${existing.current_phase} → ${to_phase} (milestone: ${milestone})`,
    metadata: { from: existing.current_phase, to: to_phase, milestone, capture: capture ?? null },
  });

  return {
    success: true,
    deal_id,
    phase: to_phase,
    completed_milestones: nextMilestones,
    state: nextState,
  };
}

export async function handle_send_buttons(input: ToolInput): Promise<ToolResult> {
  const { phone, body, buttons, header, footer } = input as {
    phone: string;
    body: string;
    buttons: Button[];
    header?: string;
    footer?: string;
  };
  await sendInteractiveMessage(phone, body, buttons, header, footer);
  return { success: true, message: `Sent ${buttons.length}-button message to ${phone}` };
}

export async function handle_send_list(input: ToolInput): Promise<ToolResult> {
  const { phone, body, button_text, sections, header, footer } = input as {
    phone: string;
    body: string;
    button_text: string;
    sections: ListSection[];
    header?: string;
    footer?: string;
  };
  await sendListMessage(phone, body, button_text, sections, header, footer);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return { success: true, message: `Sent list (${total} rows) to ${phone}` };
}

export async function handle_notify_seller(input: ToolInput): Promise<ToolResult> {
  const { deal_id } = input as { deal_id: string };
  // Look up the deal + seller
  const { getDealById } = await import('../services/supabase.js');
  const deal = await getDealById(deal_id);
  if (!deal) return { success: false, error: `Deal ${deal_id} not found` };

  // Pull seller phone — schema has sellers.deal_id FK back to deals
  const { getSupabaseClient } = await import('../services/supabase.js');
  const sb = getSupabaseClient();
  const { data: sellerRow } = await sb
    .from('sellers')
    .select('phone, full_name')
    .eq('deal_id', deal_id)
    .single();

  if (!sellerRow?.phone) {
    return {
      success: false,
      error: 'Seller phone not on deal — buyer must provide seller details first.',
    };
  }

  // getDealById returns nested relations as ARRAYS:
  //   { buyers: [...], sellers: [...], vehicles: [...] }
  // (Supabase always returns arrays for one-to-many even with a single row.)
  // Previous code read flat properties (deal.buyer_full_name etc) which don't
  // exist — that sent the template with literal "a buyer" / "your vehicle".
  type DealRel = {
    buyers?: Array<{ full_name?: string | null }> | null
    vehicles?: Array<{ year?: number | string | null; make?: string | null; model?: string | null }> | null
    phase_state?: { agreed_price?: number } | null
    agreed_price?: number
  }
  const d = deal as DealRel
  const buyer0   = d.buyers?.[0]
  const vehicle0 = d.vehicles?.[0]
  const buyerName = buyer0?.full_name ?? 'a buyer'
  const sellerFirstName = sellerRow.full_name?.split(' ')[0] ?? 'there'
  const vehicleSummary =
    [vehicle0?.year, vehicle0?.make, vehicle0?.model]
      .filter(Boolean).join(' ').trim() || 'your vehicle'
  const agreedPrice = d.phase_state?.agreed_price ?? d.agreed_price;
  const priceStr = agreedPrice != null
    ? `R ${Number(agreedPrice).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
    : 'the agreed amount';

  // Outside the 24h customer-care window, Meta requires a pre-approved
  // Message Template to start the conversation. We use the seller_intro_v1
  // template (see ops docs for the approval text). If MINDEE_WHATSAPP_TEMPLATE_NAME
  // is unset (dev / pre-approval), fall back to a plain text message — this
  // ONLY works if the seller has messaged us in the last 24h.
  const templateName = process.env.WHATSAPP_TEMPLATE_SELLER_INTRO;
  const templateLang = process.env.WHATSAPP_TEMPLATE_SELLER_INTRO_LANG ?? 'en';

  if (templateName) {
    const { sendTemplate } = await import('../services/dialog360.js');
    await sendTemplate(sellerRow.phone, templateName, templateLang, [
      sellerFirstName, // {{1}}
      buyerName,       // {{2}}
      vehicleSummary,  // {{3}}
      priceStr,        // {{4}}
    ]);
  } else {
    const intro =
      `Hi ${sellerFirstName}! 👋 ` +
      `${buyerName} has applied to buy ${vehicleSummary} for ${priceStr} through WesBank Private Deal. ` +
      `I'm here to help you complete your side — done entirely over WhatsApp, ~10–15 minutes. ` +
      `Reply *START* whenever you're ready.`;
    await sendTextMessage(sellerRow.phone, intro);
  }

  await dbLogAuditEvent({
    deal_id,
    event_type: 'seller_invited',
    description: `Seller ${sellerRow.phone} invited via WhatsApp${templateName ? ` (template: ${templateName})` : ' (text fallback)'}`,
    metadata: {
      template_name: templateName ?? null,
      seller_first_name: sellerFirstName,
      buyer_name: buyerName,
      vehicle_summary: vehicleSummary,
      agreed_price: agreedPrice ?? null,
    },
  });
  return {
    success: true,
    message: `Seller ${sellerRow.phone} notified${templateName ? ` via template '${templateName}'` : ' (text)'}.`,
  };
}

export async function handle_send_sms(input: ToolInput): Promise<ToolResult> {
  const { phone, message } = input as { phone: string; message: string };
  await bulkSmsSend(phone, message);
  return { success: true, message: `SMS sent to ${phone}` };
}

export async function handle_send_email(input: ToolInput): Promise<ToolResult> {
  const { to, subject, html_body } = input as { to: string; subject: string; html_body: string };
  await sgSendEmail(to, subject, html_body);
  return { success: true, message: `Email sent to ${to}` };
}

export async function handle_create_task(input: ToolInput): Promise<ToolResult> {
  const { deal_id, task_type, description, priority } = input as {
    deal_id?: string;
    task_type: string;
    description: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
  const task = await createOpsTask({ deal_id, task_type, description, priority });
  return { success: true, task_id: task.id, message: 'Task created and assigned to the ops team.' };
}

export async function handle_log_audit_event(input: ToolInput): Promise<ToolResult> {
  const { deal_id, phone, event_type, description, metadata } = input as {
    deal_id?: string;
    phone?: string;
    event_type: string;
    description: string;
    metadata?: Record<string, unknown>;
  };
  await dbLogAuditEvent({ deal_id, phone, event_type, description, metadata });
  return { success: true };
}

export async function handle_get_conversation_history(input: ToolInput): Promise<ToolResult> {
  const { phone, limit = 20 } = input as { phone: string; limit?: number };
  const { getSupabaseClient } = await import('../services/supabase.js');
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('conversation_messages')
    .select('role, content, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { success: true, messages: (data ?? []).reverse() };
}

export async function handle_store_seller_details(input: ToolInput): Promise<ToolResult> {
  const {
    deal_id,
    seller_name,
    seller_phone,
    vehicle_make,
    vehicle_model,
    vehicle_year,
    vehicle_price,
  } = input as {
    deal_id: string;
    seller_name: string;
    seller_phone: string;
    vehicle_make?: string;
    vehicle_model?: string;
    vehicle_year?: number;
    vehicle_price?: number;
  };

  await dbStoreSellerDetails(deal_id, {
    name: seller_name,
    phone: seller_phone,
    vehicle_make,
    vehicle_model,
    vehicle_year,
    vehicle_price,
  });

  // Send onboarding message to seller
  const onboardingMsg =
    `Hi ${seller_name}! 👋 A buyer has applied for vehicle finance to purchase your vehicle. ` +
    `I'm your vehicle finance assistant and I'll guide you through the process right here on WhatsApp. ` +
    `It only takes about 10 minutes. Shall we get started?`;

  await sendTextMessage(seller_phone, onboardingMsg);

  return {
    success: true,
    message: `Seller details stored. Onboarding message sent to ${seller_phone}.`,
  };
}

export async function handle_present_quote(input: ToolInput): Promise<ToolResult> {
  const { deal_id, buyer_phone } = input as { deal_id: string; buyer_phone: string };
  const quote = await getLatestQuote(deal_id);
  if (!quote) {
    return { success: false, error: 'No quote found for this deal' };
  }

  const quoteMessage =
    `🎉 Great news! Your finance quote is ready:\n\n` +
    `• Monthly instalment: R${Number(quote.monthly_instalment).toLocaleString('en-ZA')}\n` +
    `• Term: ${quote.term_months} months\n` +
    `• Interest rate: ${quote.interest_rate}% per annum\n` +
    `• Total repayable: R${Number(quote.total_repayable).toLocaleString('en-ZA')}\n\n` +
    `Reply *ACCEPT* to accept this offer or *DECLINE* to decline.`;

  await sendTextMessage(buyer_phone, quoteMessage);
  await dbUpdateDealStatus(deal_id, 'quote_sent');

  return { success: true, quote_id: quote.id, message: 'Quote sent to buyer.' };
}

export async function handle_record_quote_response(input: ToolInput): Promise<ToolResult> {
  const { deal_id, response } = input as {
    deal_id: string;
    response: 'accepted' | 'declined';
  };
  const quote = await getLatestQuote(deal_id);
  if (!quote) {
    return { success: false, error: 'No quote found for this deal' };
  }
  await dbRecordQuoteResponse(quote.id, response);
  await dbUpdateDealStatus(deal_id, response === 'accepted' ? 'quote_accepted' : 'quote_declined');
  await dbLogAuditEvent({
    deal_id,
    event_type: `quote_${response}`,
    description: `Buyer ${response} the finance quote`,
    metadata: { quote_id: quote.id },
  });
  return { success: true, message: `Quote ${response} recorded.` };
}

export async function handle_send_contract_link(input: ToolInput): Promise<ToolResult> {
  const { deal_id, phone, party_type } = input as {
    deal_id: string;
    phone: string;
    party_type: 'buyer' | 'seller';
  };
  const contract = await getContract(deal_id);
  if (!contract) {
    return { success: false, error: 'No contract found for this deal' };
  }

  const signingUrl =
    party_type === 'buyer' ? contract.buyer_signing_url : contract.seller_signing_url;

  if (!signingUrl) {
    return { success: false, error: `No ${party_type} signing URL available yet` };
  }

  const contractMsg =
    `📄 Your contract is ready to sign!\n\n` +
    `Please click the link below to review and sign your vehicle finance contract:\n` +
    `${signingUrl}\n\n` +
    `The link is valid for 48 hours. Let me know if you have any questions.`;

  await sendTextMessage(phone, contractMsg);
  await dbUpdateDealStatus(deal_id, 'contract_sent');

  return { success: true, message: `Contract signing link sent to ${phone}` };
}

// ── Dispatch map ──────────────────────────────────────────────────────────────

export const TOOL_HANDLERS: Record<string, (input: ToolInput) => Promise<ToolResult>> = {
  get_deal_info: handle_get_deal_info,
  update_deal_status: handle_update_deal_status,
  store_document: handle_store_document,
  trigger_extraction: handle_trigger_extraction,
  get_extraction_results: handle_get_extraction_results,
  bulk_populate_from_otp: handle_bulk_populate_from_otp,
  verify_document_against_buyer: handle_verify_document_against_buyer,
  update_vehicle_record: handle_update_vehicle_record,
  update_buyer_record: handle_update_buyer_record,
  update_seller_record: handle_update_seller_record,
  confirm_buyer_data: handle_confirm_buyer_data,
  confirm_seller_data: handle_confirm_seller_data,
  store_vehicle_photo: handle_store_vehicle_photo,
  get_photo_progress: handle_get_photo_progress,
  trigger_photo_evaluation: handle_trigger_photo_evaluation,
  get_photo_evaluation: handle_get_photo_evaluation,
  get_deal_phase: handle_get_deal_phase,
  advance_deal_phase: handle_advance_deal_phase,
  send_whatsapp_message: handle_send_whatsapp_message,
  send_buttons: handle_send_buttons,
  send_list: handle_send_list,
  notify_seller: handle_notify_seller,
  send_sms: handle_send_sms,
  send_email: handle_send_email,
  create_task: handle_create_task,
  log_audit_event: handle_log_audit_event,
  get_conversation_history: handle_get_conversation_history,
  store_seller_details: handle_store_seller_details,
  present_quote: handle_present_quote,
  record_quote_response: handle_record_quote_response,
  send_contract_link: handle_send_contract_link,
};
