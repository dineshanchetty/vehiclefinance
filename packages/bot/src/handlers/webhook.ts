/**
 * Main Dialog360 webhook handler.
 *
 * Responsibilities:
 *  1. Parse and validate the incoming Dialog360 webhook payload
 *  2. Identify buyer vs. seller by phone number lookup
 *  3. Download and store any media attachments in Supabase Storage
 *  4. Create document records in the database
 *  5. Route the message through the appropriate conversation flow
 *  6. Persist updated conversation state
 *  7. Dispatch bot responses via Dialog360
 *  8. Trigger extraction pipeline (placeholder)
 */

import {
  sendTextMessage,
  sendInteractiveMessage,
  sendDocumentMessage,
  sendImageMessage,
  downloadMedia,
} from '../services/dialog360.js';
import { getState, setState } from '../services/conversation-state.js';
import {
  uploadFile,
  createAuditEvent,
  getSupabaseClient,
} from '../services/supabase.js';
import { handleBuyerMessage, newBuyerState } from '../flows/buyer-flow.js';
import { handleSellerMessage, newSellerState } from '../flows/seller-flow.js';
import type {
  BotResponse,
  ConversationState,
  D360Message,
  D360WebhookPayload,
  DocumentType,
  FlowResult,
  PartyType,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (level: 'info' | 'warn' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), handler: 'webhook', level, msg, data };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
};

// ---------------------------------------------------------------------------
// Media handling
// ---------------------------------------------------------------------------

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'image/webp': 'webp',
};

/**
 * Download a media attachment, store it in Supabase Storage, and create a
 * document record.  Returns the public URL of the stored file.
 *
 * @param mediaId   - Dialog360 media ID
 * @param mimeType  - MIME type from the message
 * @param dealId    - Associated deal UUID (may be null for pre-deal uploads)
 * @param docType   - Classification of the document
 * @param phone     - Uploader's phone number (for audit trail)
 */
async function storeMediaAttachment(
  mediaId: string,
  mimeType: string,
  dealId: string | null,
  docType: DocumentType,
  phone: string,
): Promise<string> {
  const buffer = await downloadMedia(mediaId);
  const ext = MIME_TO_EXT[mimeType] ?? 'bin';
  const timestamp = Date.now();
  const storagePath = dealId
    ? `deals/${dealId}/${docType}/${timestamp}.${ext}`
    : `staging/${phone}/${docType}/${timestamp}.${ext}`;

  const publicUrl = await uploadFile('deal-documents', storagePath, buffer, mimeType);

  // Create document record in DB
  const supabase = getSupabaseClient();
  const { error: insertErr } = await supabase.from('documents').insert({
    deal_id: dealId,
    uploader_phone: phone,
    document_type: docType,
    storage_path: storagePath,
    public_url: publicUrl,
    mime_type: mimeType,
    created_at: new Date().toISOString(),
  });

  if (insertErr) {
    log('warn', 'Failed to insert document record', { error: insertErr, dealId, docType });
  }

  if (dealId) {
    await createAuditEvent(dealId, 'doc_uploaded', phone, { docType, storagePath });
  }

  return publicUrl;
}

// ---------------------------------------------------------------------------
// Extraction trigger (placeholder)
// ---------------------------------------------------------------------------

/**
 * Placeholder — trigger the async document extraction pipeline.
 * Replace with an actual HTTP call to the extraction service, Supabase Edge
 * Function, or message queue publish when the extraction service is built.
 */
async function triggerExtraction(
  dealId: string,
  docType: DocumentType,
  storagePath: string,
): Promise<void> {
  log('info', 'triggerExtraction (placeholder)', { dealId, docType, storagePath });
  // TODO: invoke extraction service
  // e.g. await fetch(`${process.env.EXTRACTION_SERVICE_URL}/extract`, { method: 'POST', body: JSON.stringify({ dealId, docType, storagePath }) })
}

// ---------------------------------------------------------------------------
// Party type resolution
// ---------------------------------------------------------------------------

/**
 * Determine whether an incoming phone number belongs to a buyer or seller
 * by looking up active deals.  Returns the party type and deal ID if found.
 */
async function resolveParty(
  phone: string,
): Promise<{ partyType: PartyType; dealId: string | null }> {
  const supabase = getSupabaseClient();

  // Check if phone is a buyer on any active deal
  const { data: buyerDeals } = await supabase
    .from('deals')
    .select('id')
    .eq('buyer_phone', phone)
    .not('status', 'in', '("cancelled","disbursed")')
    .order('created_at', { ascending: false })
    .limit(1);

  if (buyerDeals && buyerDeals.length > 0) {
    return { partyType: 'buyer', dealId: buyerDeals[0].id as string };
  }

  // Check if phone is a seller on any active deal
  const { data: sellerDeals } = await supabase
    .from('deals')
    .select('id')
    .eq('seller_phone', phone)
    .not('status', 'in', '("cancelled","disbursed")')
    .order('created_at', { ascending: false })
    .limit(1);

  if (sellerDeals && sellerDeals.length > 0) {
    return { partyType: 'seller', dealId: sellerDeals[0].id as string };
  }

  // Unknown number — treat as new buyer
  return { partyType: 'buyer', dealId: null };
}

// ---------------------------------------------------------------------------
// Determine document type from flow step
// ---------------------------------------------------------------------------

function getDocumentType(state: ConversationState): DocumentType {
  switch (state.current_step) {
    case 'ID_UPLOAD':
      return 'id_document';
    case 'POA_UPLOAD':
      return 'proof_of_address';
    case 'BANK_STATEMENT_UPLOAD':
      return 'bank_statement';
    case 'VEHICLE_DOC_UPLOAD':
      return 'vehicle_registration';
    case 'VEHICLE_PHOTOS':
      return 'vehicle_photo';
    default:
      return 'id_document';
  }
}

// ---------------------------------------------------------------------------
// Response dispatcher
// ---------------------------------------------------------------------------

async function dispatchResponses(phone: string, responses: BotResponse[]): Promise<void> {
  for (const response of responses) {
    if (response.type === 'text') {
      await sendTextMessage(phone, response.text);
    } else if (response.type === 'interactive') {
      await sendInteractiveMessage(phone, response.body, response.buttons);
    } else if (response.type === 'image') {
      await sendImageMessage(phone, response.url, response.caption);
    } else if (response.type === 'document') {
      await sendDocumentMessage(phone, response.url, response.filename, response.caption);
    }
  }
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

/**
 * Process a single inbound message from the Dialog360 webhook.
 *
 * @param message - Parsed D360Message from the webhook payload
 * @param phone   - Sender's E.164 phone number (no '+')
 */
async function processMessage(message: D360Message, phone: string): Promise<void> {
  log('info', 'processMessage', { phone, type: message.type });

  // 1. Load or initialise conversation state
  let state = await getState(phone);
  let { partyType, dealId } = state
    ? { partyType: state.party_type, dealId: state.deal_id }
    : await resolveParty(phone);

  if (!state) {
    state =
      partyType === 'seller'
        ? newSellerState(phone)
        : newBuyerState(phone);
    if (dealId) state.deal_id = dealId;
  }

  // 2. Handle media uploads before routing to flow
  if (['image', 'document'].includes(message.type) && state.current_step !== 'DONE') {
    const mediaContent = message.image ?? message.document;
    if (mediaContent?.id) {
      const docType = getDocumentType(state);
      const mimeType = mediaContent.mime_type ?? 'application/octet-stream';
      try {
        const publicUrl = await storeMediaAttachment(
          mediaContent.id,
          mimeType,
          dealId,
          docType,
          phone,
        );
        log('info', 'media stored', { phone, docType, publicUrl });

        // Trigger extraction for document types that need it
        if (
          docType !== 'vehicle_photo' &&
          dealId
        ) {
          const storagePath = dealId
            ? `deals/${dealId}/${docType}/${Date.now()}.${mimeType.split('/')[1] ?? 'bin'}`
            : publicUrl;
          await triggerExtraction(dealId, docType, storagePath);
        }
      } catch (mediaErr) {
        log('error', 'media handling failed', { phone, error: mediaErr });
        // Don't block flow on media errors — continue routing
      }
    }
  }

  // 3. Route to appropriate flow
  let result: FlowResult;
  try {
    if (partyType === 'seller') {
      result = await handleSellerMessage(message, state);
    } else {
      result = await handleBuyerMessage(message, state);
    }
  } catch (flowErr) {
    log('error', 'flow handler threw', { phone, error: flowErr });
    await sendTextMessage(
      phone,
      "I'm sorry, something went wrong. Please try again in a moment.",
    );
    return;
  }

  // 4. Handle deal updates
  if (result.dealUpdate && dealId) {
    const supabase = getSupabaseClient();
    const { error: updateErr } = await supabase
      .from('deals')
      .update({ ...result.dealUpdate, updated_at: new Date().toISOString() })
      .eq('id', dealId);
    if (updateErr) log('warn', 'deal update failed', { dealId, error: updateErr });
  }

  // 5. If seller_phone returned from buyer flow, create deal and invite seller
  const sellerPhoneFromFlow = (result.dealUpdate as Record<string, unknown> | undefined)
    ?.seller_phone as string | undefined;
  if (sellerPhoneFromFlow && !dealId) {
    const supabase = getSupabaseClient();
    const { data: newDeal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        buyer_phone: phone,
        seller_phone: sellerPhoneFromFlow,
        status: 'buyer_docs_pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!dealErr && newDeal) {
      dealId = (newDeal as { id: string }).id;
      log('info', 'deal created', { dealId, buyerPhone: phone, sellerPhone: sellerPhoneFromFlow });
    }
  }

  // 6. Persist updated conversation state
  const contextPatch = result.dealUpdate
    ? (result.dealUpdate as Record<string, unknown>)
    : {};

  await setState(phone, result.nextStep, partyType, dealId, contextPatch);

  // 7. Dispatch responses
  await dispatchResponses(phone, result.responses);
}

/**
 * Handle the full Dialog360 webhook payload.
 *
 * This is the entry point called by the HTTP server (e.g. Express or Hono
 * route handler). It extracts all messages from all entries and processes
 * them sequentially (Dialog360 typically sends one message per webhook call).
 *
 * @param payload - Raw parsed JSON from the POST body
 */
export async function handleWebhook(payload: D360WebhookPayload): Promise<void> {
  log('info', 'handleWebhook', { entries: payload.entry?.length });

  if (!payload.entry) return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const messages = change.value.messages ?? [];
      for (const message of messages) {
        const phone = message.from;
        try {
          await processMessage(message, phone);
        } catch (err) {
          log('error', 'processMessage failed', { phone, error: err });
          // Don't re-throw — we don't want Dialog360 to retry healthy webhooks
        }
      }
    }
  }
}

/**
 * Handle the Dialog360 webhook verification challenge (GET request).
 *
 * @param mode      - hub.mode query param (must be 'subscribe')
 * @param token     - hub.verify_token query param
 * @param challenge - hub.challenge query param to echo back
 * @returns The challenge string if valid, null if invalid
 */
export function verifyWebhook(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
): string | null {
  const verifyToken = process.env.DIALOG360_WEBHOOK_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    return challenge ?? '';
  }
  return null;
}
