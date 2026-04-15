import { Request, Response } from 'express';
import { agent } from '../agent/agent.js';

/**
 * Dialog360 webhook payload types (WhatsApp Cloud API format)
 */
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
    document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
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

interface D360WebhookPayload {
  object: string;
  entry?: Array<{ id: string; changes: Array<{ value: D360MessageEntry; field: string }> }>;
}

/**
 * POST /webhook/dialog360
 * Receives incoming WhatsApp messages from Dialog360.
 * Responds 200 immediately and processes asynchronously.
 */
export async function handleDialog360Webhook(req: Request, res: Response): Promise<void> {
  // Acknowledge receipt immediately — Dialog360 retries if no 200 within ~5s
  res.sendStatus(200);

  const payload = req.body as D360WebhookPayload;
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

        // Process asynchronously to avoid blocking
        agent
          .processMessage(phone, messageText, mediaId)
          .catch((err) => {
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

  const payload = req.body as D360WebhookPayload;
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
