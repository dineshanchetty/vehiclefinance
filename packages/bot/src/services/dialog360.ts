import axios from 'axios';
import { uploadFileToStorage } from './supabase.js';

const API_KEY = process.env.DIALOG360_API_KEY!;
const API_URL = process.env.DIALOG360_API_URL ?? 'https://waba.360dialog.io/v1';
const CHANNEL_ID = process.env.DIALOG360_CHANNEL_ID!;

function headers() {
  return {
    'D360-API-KEY': API_KEY,
    'Content-Type': 'application/json',
  };
}

export async function sendTextMessage(phone: string, message: string): Promise<void> {
  const url = `${API_URL}/messages`;
  await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: message },
    },
    { headers: headers() },
  );
}

export interface Button {
  id: string;
  title: string;
}

export async function sendInteractiveMessage(
  phone: string,
  body: string,
  buttons: Button[],
): Promise<void> {
  const url = `${API_URL}/messages`;
  await axios.post(
    url,
    {
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
    },
    { headers: headers() },
  );
}

export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Step 1: get the media URL
  const metaUrl = `${API_URL}/media/${mediaId}`;
  const metaRes = await axios.get(metaUrl, { headers: headers() });
  const { url: mediaUrl, mime_type: mimeType } = metaRes.data;

  // Step 2: download the binary
  const mediaRes = await axios.get(mediaUrl, {
    headers: headers(),
    responseType: 'arraybuffer',
  });
  return { buffer: Buffer.from(mediaRes.data), mimeType: mimeType ?? 'application/octet-stream' };
}

export async function downloadAndStoreMedia(
  mediaId: string,
  storagePath: string,
): Promise<{ publicUrl: string; mimeType: string }> {
  const { buffer, mimeType } = await downloadMedia(mediaId);
  const publicUrl = await uploadFileToStorage('documents', storagePath, buffer, mimeType);
  return { publicUrl, mimeType };
}
