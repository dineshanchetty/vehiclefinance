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

/**
 * Send a plain text WhatsApp message.
 *
 * @param phone  - E.164 phone number without leading '+', e.g. "27821234567"
 * @param message - Message body (max 4096 chars)
 */
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
  buttons: Array<{ id: string; title: string }>,
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
 * Download a media file by its Dialog360 media ID.
 *
 * Flow: GET /media/{mediaId} → retrieve download URL → GET URL → Buffer
 *
 * @param mediaId - The `id` field from an inbound media message
 * @returns Raw file bytes as a Buffer
 */
export async function downloadMedia(mediaId: string): Promise<Buffer> {
  log('info', 'downloadMedia', { mediaId });
  try {
    // Step 1: resolve the download URL
    const metaRes = await client().get<{ url: string; mime_type: string; file_size: number }>(
      `/media/${mediaId}`,
    );
    const downloadUrl = metaRes.data.url;

    // Step 2: download the binary
    const fileRes = await client().get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
    });

    return Buffer.from(fileRes.data);
  } catch (err) {
    log('error', 'downloadMedia failed', { mediaId, err });
    throw err;
  }
}
