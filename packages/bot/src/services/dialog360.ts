/**
 * Dialog360 WhatsApp Business API service.
 *
 * Docs: https://docs.d360.com/
 * All requests authenticate via the `D360-API-KEY` header.
 *
 * Environment variables required:
 *   DIALOG360_API_KEY  — secret API key
 *   DIALOG360_API_URL  — base URL, e.g. https://waba.360dialog.io/v1
 */

import axios, { AxiosInstance } from 'axios';
import { uploadFileToStorage } from './supabase.js';

const log = (level: 'info' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), service: 'dialog360', level, msg, data };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

function createClient(): AxiosInstance {
  const apiKey = process.env.DIALOG360_API_KEY;
  const baseURL = process.env.DIALOG360_API_URL;

  if (!apiKey || !baseURL) {
    throw new Error('Missing required env vars: DIALOG360_API_KEY, DIALOG360_API_URL');
  }

  return axios.create({
    baseURL,
    headers: {
      'D360-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });
}

// Lazily initialised so tests can mock env vars before module evaluation.
let _client: AxiosInstance | null = null;
function client(): AxiosInstance {
  if (!_client) _client = createClient();
  return _client;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface Button {
  id: string;
  title: string;
}

/**
 * Mark an incoming message as read AND show the "typing…" indicator to the
 * user. The indicator stays on for up to 25 seconds or until you send the
 * next outbound message — perfect for covering agent latency.
 *
 * Cloud API endpoint: POST /messages with status=read + typing_indicator.
 * Requires the wa_message_id of an INBOUND message (not one we sent).
 *
 * Fire-and-forget — never block the agent loop on this. Errors are logged
 * but don't propagate.
 *
 * @param messageId  The `id` of the inbound message (msg.id from the webhook)
 */
export async function sendTypingIndicator(messageId: string): Promise<void> {
  try {
    await client().post('/messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    });
  } catch (err) {
    log('error', 'sendTypingIndicator failed', { messageId, err });
  }
}

/**
 * Send a plain text WhatsApp message.
 *
 * @param phone  - E.164 phone number without leading '+', e.g. "27821234567"
 * @param message - Message body (max 4096 chars)
 */
/**
 * Send a pre-approved WhatsApp Message Template.
 *
 * Required when initiating a conversation with a user who has not messaged
 * us in the last 24 hours (e.g. cold-contacting a seller). Meta requires the
 * template to be reviewed + approved in WhatsApp Manager / Dialog360 before
 * it can be sent.
 *
 * The template body uses positional variables ({{1}}, {{2}}, …) that are
 * filled by the `bodyParams` array, in order.
 *
 * @example
 *   sendTemplate("27834567890", "seller_intro_v1", "en", [
 *     "Thabo", "Dineshan", "VW Golf 7 GTI", "R 285,000",
 *   ])
 */
export async function sendTemplate(
  phone: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[],
): Promise<void> {
  log('info', 'sendTemplate', { phone, templateName });
  try {
    await client().post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams.length > 0 ? [{
          type: 'body',
          parameters: bodyParams.map((text) => ({ type: 'text', text })),
        }] : [],
      },
    });
  } catch (err) {
    log('error', 'sendTemplate failed', { phone, templateName, err });
    throw err;
  }
}

export async function sendTextMessage(phone: string, message: string): Promise<void> {
  log('info', 'sendTextMessage', { phone });
  try {
    await client().post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { body: message, preview_url: false },
    });
  } catch (err) {
    log('error', 'sendTextMessage failed', { phone, err });
    throw err;
  }
}

/**
 * Send an interactive reply-buttons message (up to 3 buttons).
 *
 * @param phone   - E.164 phone number
 * @param body    - Main message text shown above buttons
 * @param buttons - Array of up to 3 `{ id, title }` objects
 * @param header  - Optional header text
 * @param footer  - Optional footer text
 */
export async function sendInteractiveMessage(
  phone: string,
  body: string,
  buttons: Button[],
  header?: string,
  footer?: string,
): Promise<void> {
  if (buttons.length > 3) {
    throw new Error('Dialog360 interactive messages support a maximum of 3 buttons');
  }

  log('info', 'sendInteractiveMessage', { phone, buttonCount: buttons.length });

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  };

  const interactive = payload.interactive as Record<string, unknown>;
  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  try {
    await client().post('/messages', payload);
  } catch (err) {
    log('error', 'sendInteractiveMessage failed', { phone, err });
    throw err;
  }
}

// ─── Lists (interactive menus, up to 10 rows across multiple sections) ──────

export interface ListRow {
  id: string;
  title: string;       // ≤24 chars
  description?: string; // ≤72 chars
}
export interface ListSection {
  title?: string;      // ≤24 chars
  rows: ListRow[];     // 1–10 rows total across all sections
}

/**
 * Send an interactive list message — opens a tappable menu in WhatsApp.
 * Use when there are more than 3 choices, or when a structured menu is clearer
 * than free-text. Reply comes back as msg.interactive.list_reply.title (handled
 * by webhook.ts).
 */
export async function sendListMessage(
  phone: string,
  body: string,
  buttonText: string,           // label on the menu trigger button, ≤20 chars
  sections: ListSection[],
  header?: string,
  footer?: string,
): Promise<void> {
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);
  if (totalRows > 10) throw new Error('WhatsApp list messages support max 10 rows total');
  if (totalRows < 1)  throw new Error('WhatsApp list messages require at least 1 row');

  log('info', 'sendListMessage', { phone, sections: sections.length, totalRows });

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonText,
        sections: sections.map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            ...(r.description ? { description: r.description } : {}),
          })),
        })),
      },
    },
  };
  const interactive = payload.interactive as Record<string, unknown>;
  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  try {
    await client().post('/messages', payload);
  } catch (err) {
    log('error', 'sendListMessage failed', { phone, err });
    throw err;
  }
}

/**
 * Send an image message with an optional caption.
 *
 * @param phone    - E.164 phone number
 * @param imageUrl - Publicly accessible HTTPS URL of the image
 * @param caption  - Optional caption text (max 1024 chars)
 */
export async function sendImageMessage(
  phone: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  log('info', 'sendImageMessage', { phone });
  try {
    await client().post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    });
  } catch (err) {
    log('error', 'sendImageMessage failed', { phone, err });
    throw err;
  }
}

/**
 * Send a document message with filename and optional caption.
 *
 * @param phone    - E.164 phone number
 * @param docUrl   - Publicly accessible HTTPS URL of the document
 * @param filename - Filename shown to the recipient
 * @param caption  - Optional caption text
 */
export async function sendDocumentMessage(
  phone: string,
  docUrl: string,
  filename: string,
  caption?: string,
): Promise<void> {
  log('info', 'sendDocumentMessage', { phone, filename });
  try {
    await client().post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'document',
      document: {
        link: docUrl,
        filename,
        ...(caption ? { caption } : {}),
      },
    });
  } catch (err) {
    log('error', 'sendDocumentMessage failed', { phone, filename, err });
    throw err;
  }
}

/**
 * Download a media file by its Dialog360 media ID (Cloud API v2).
 *
 * Flow:
 *   1. GET /{mediaId}  with D360-API-KEY → JSON { url, mime_type, … }
 *      The url is on lookaside.fbsbx.com (Meta's CDN) but is NOT directly
 *      callable with the D360 key.
 *   2. Replace the host with waba-v2.360dialog.io to route through 360dialog's
 *      auth-injecting proxy, then GET that URL with D360-API-KEY → bytes.
 *   3. URL is valid for 5 minutes; resolve + download in one go.
 *
 * @param mediaId - The `id` field from an inbound media message
 * @returns Raw file bytes as a Buffer and the MIME type
 */
export async function downloadMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  log('info', 'downloadMedia', { mediaId });
  try {
    // Step 1: resolve the download URL (Cloud API v2: no /media prefix).
    const metaRes = await client().get<{ url: string; mime_type: string; file_size: number }>(
      `/${mediaId}`,
    );
    const { url: lookasideUrl, mime_type: mimeType } = metaRes.data;

    // Step 2: rewrite the host to the 360dialog proxy so D360-API-KEY auth works.
    const baseHost = process.env.DIALOG360_API_URL ?? 'https://waba-v2.360dialog.io';
    const proxiedUrl = lookasideUrl.replace(
      /^https:\/\/lookaside\.fbsbx\.com/,
      baseHost.replace(/\/$/, ''),
    );

    // Step 3: download the binary via the proxy.
    const fileRes = await client().get<ArrayBuffer>(proxiedUrl, {
      responseType: 'arraybuffer',
    });

    return { buffer: Buffer.from(fileRes.data), mimeType: mimeType ?? 'application/octet-stream' };
  } catch (err) {
    log('error', 'downloadMedia failed', { mediaId, err });
    throw err;
  }
}

/**
 * Download a media file and upload it to Supabase Storage.
 *
 * @param mediaId     - Dialog360 media ID
 * @param storagePath - Destination path within the storage bucket
 * @returns Public URL and MIME type of the stored file
 */
export async function downloadAndStoreMedia(
  mediaId: string,
  storagePath: string,
): Promise<{ publicUrl: string; mimeType: string }> {
  const { buffer, mimeType } = await downloadMedia(mediaId);
  const publicUrl = await uploadFileToStorage('documents', storagePath, buffer, mimeType);
  return { publicUrl, mimeType };
}
