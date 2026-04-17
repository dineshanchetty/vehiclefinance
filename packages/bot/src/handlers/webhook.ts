/**
 * Dialog360 webhook handlers.
 *
 * This file exports two handler families:
 *
 * Flow-based (state-machine approach):
 *   - handleWebhook        — processes messages through buyer/seller conversation flows
 *   - verifyWebhook        — handles GET verification challenge from Dialog360
 *
 * Agent-based (Claude SDK approach):
 *   - handleDialog360Webhook — routes messages to the Claude agent
 *   - handleStatusWebhook    — handles delivery status updates
 */

import { Request, Response } from 'express';
import {
  sendTextMessage,
  sendInteractiveMessage,
  sendDocumentMessage,
  sendImageMessage,
  downloadMedia,
} from '../services/dialog360.js';
import { STRINGS } from '../flows/strings.js';
import { getState, setState } from '../services/conversation-state.js';
import {
  uploadFile,
  createAuditEvent,
  getSupabaseClient,
} from '../services/supabase.js';
import { handleBuyerMessage, newBuyerState } from '../flows/buyer-flow.js';
import { handleSellerMessage, newSellerState } from '../flows/seller-flow.js';
import { agent } from '../agent/agent.js';
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
// Media handling (flow-based)
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
 */
async function storeMediaAttachment(
  mediaId: string,
  mimeType: string,
  dealId: string | null,
  docType: DocumentType,
  phone: string,
): Promise<string> {
  const { buffer } = await downloadMedia(mediaId);
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

async function triggerExtraction(
  dealId: string,
  docType: DocumentType,
  storagePath: string,
): Promise<void> {
  log('info', 'triggerExtraction (placeholder)', { dealId, docType, storagePath });
  // TODO: invoke extraction service
}

// ---------------------------------------------------------------------------
// Party type resolution (flow-based)
// ---------------------------------------------------------------------------

async function resolveParty(
  phone: string,
): Promise<{ partyType: PartyType; dealId: string | null }> {
  const supabase = getSupabaseClient();

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

  return { partyType: 'buyer', dealId: null };
}

// ---------------------------------------------------------------------------
// Document type from flow step
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
// Response dispatcher (flow-based)
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
// Flow-based webhook handler
// ---------------------------------------------------------------------------

async function processMessage(message: D360Message, phone: string): Promise<void> {
  log('info', 'processMessage', { phone, type: message.type });

  let state = await getState(phone);
  let { partyType, dealId } = state
    ? { partyType: state.party_type, dealId: state.deal_id }
    : await resolveParty(phone);

  if (!state) {
    state = partyType === 'seller' ? newSellerState(phone) : newBuyerState(phone);
    if (dealId) state.deal_id = dealId;
  }

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

        if (docType !== 'vehicle_photo' && dealId) {
          const storagePath = `deals/${dealId}/${docType}/${Date.now()}.${mimeType.split('/')[1] ?? 'bin'}`;
          await triggerExtraction(dealId, docType, storagePath);
        }
      } catch (mediaErr) {
        log('error', 'media handling failed', { phone, error: mediaErr });
      }
    }
  }

  let result: FlowResult;
  try {
    if (partyType === 'seller') {
      result = await handleSellerMessage(message, state);
    } else {
      result = await handleBuyerMessage(message, state);
    }
  } catch (flowErr) {
    log('error', 'flow handler threw', { phone, error: flowErr });
    await sendTextMessage(phone, "I'm sorry, something went wrong. Please try again in a moment.");
    return;
  }

  if (result.dealUpdate && dealId) {
    const supabase = getSupabaseClient();
    const { error: updateErr } = await supabase
      .from('deals')
      .update({ ...result.dealUpdate, updated_at: new Date().toISOString() })
      .eq('id', dealId);
    if (updateErr) log('warn', 'deal update failed', { dealId, error: updateErr });
  }

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

  const contextPatch = result.dealUpdate ? (result.dealUpdate as Record<string, unknown>) : {};
  await setState(phone, result.nextStep, partyType, dealId, contextPatch);
  await dispatchResponses(phone, result.responses);
}

/**
 * Handle the full Dialog360 webhook payload (flow-based).
 * Entry point called by the HTTP server for the state-machine approach.
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
        }
      }
    }
  }
}

/**
 * Handle the Dialog360 webhook verification challenge (GET request).
 */
export function verifyWebhook(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
): string | null {
  const verifyToken = process.env.DIALOG360_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    return challenge ?? '';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Agent-based webhook handlers (Claude SDK approach)
// ---------------------------------------------------------------------------

interface D360MessageEntry {
  messaging_product: string;
  metadata?: { display_phone_number: string; phone_number_id: string };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'document' | 'video' | 'audio' | 'location' | 'interactive';
    text?: { body: string };
    image?: { id: string; mime_type: string; sha256: string; caption?: string };
    document?: {
      id: string;
      mime_type: string;
      sha256: string;
      filename?: string;
      caption?: string;
    };
    video?: { id: string; mime_type: string };
    interactive?: {
      type: string;
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string; description?: string };
    };
  }>;
  statuses?: Array<{
    id: string;
    recipient_id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    errors?: Array<{ code: number; title: string }>;
  }>;
}

interface AgentWebhookPayload {
  object: string;
  entry?: Array<{ id: string; changes: Array<{ value: D360MessageEntry; field: string }> }>;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-process, per-phone)
// ---------------------------------------------------------------------------

/** Sliding-window rate limiter: max 10 messages per 60-second window per phone. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MSGS = 10;

// Maps phone → array of message timestamps in the current window
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime cache, intentionally opaque
const _rateLimitMap = new Map<string, number[]>();

/**
 * Return true if the given phone has exceeded the rate limit.
 * Mutates the internal sliding-window map as a side effect.
 */
function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (_rateLimitMap.get(phone) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  _rateLimitMap.set(phone, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_MSGS;
}

/**
 * POST /webhook/dialog360 (agent-based)
 * Receives incoming WhatsApp messages and routes them to the Claude agent.
 * Responds 200 immediately and processes asynchronously.
 * Phones sending > 10 messages/minute receive a throttle reply and are skipped.
 */
export async function handleDialog360Webhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200);

  const payload = req.body as AgentWebhookPayload;
  if (!payload?.entry) return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      if (!value.messages?.length) continue;

      for (const msg of value.messages) {
        const phone = msg.from;
        let messageText = '';
        let mediaId: string | undefined;

        switch (msg.type) {
          case 'text':
            messageText = msg.text?.body ?? '';
            break;
          case 'image':
            mediaId = msg.image?.id;
            messageText = msg.image?.caption ?? '';
            break;
          case 'document':
            mediaId = msg.document?.id;
            messageText = msg.document?.caption ?? msg.document?.filename ?? '';
            break;
          case 'video':
            mediaId = msg.video?.id;
            break;
          case 'interactive':
            if (msg.interactive?.button_reply) {
              messageText = msg.interactive.button_reply.title;
            } else if (msg.interactive?.list_reply) {
              messageText = msg.interactive.list_reply.title;
            }
            break;
          default:
            console.log(`[webhook] Unsupported message type: ${msg.type} from ${phone}`);
            continue;
        }

        if (isRateLimited(phone)) {
          log('warn', 'rate-limit exceeded', { phone });
          // Fire-and-forget throttle reply — do not block the 200 response
          sendTextMessage(phone, STRINGS.RATE_LIMIT_EXCEEDED)
            .catch((e) => log('error', 'throttle reply failed', { phone, e }));
          continue;
        }

        agent.processMessage(phone, messageText, mediaId).catch((err) => {
          console.error(`[webhook] Failed to process message from ${phone}:`, err);
        });
      }
    }
  }
}

/**
 * POST /webhook/status
 * Receives delivery status updates (sent, delivered, read, failed).
 */
export async function handleStatusWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200);

  const payload = req.body as AgentWebhookPayload;
  if (!payload?.entry) return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      if (!value.statuses?.length) continue;

      for (const status of value.statuses) {
        console.log(
          `[status] Message ${status.id} to ${status.recipient_id}: ${status.status}`,
          status.errors ? `Errors: ${JSON.stringify(status.errors)}` : '',
        );
        // TODO: persist delivery status to database for analytics
      }
    }
  }
}
