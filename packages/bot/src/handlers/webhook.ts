/**
 * Dialog360 webhook handlers — agent-based Claude SDK path.
 *
 * Two exports:
 *   - handleDialog360Webhook — POST /webhook/dialog360, routes messages to the agent
 *   - handleStatusWebhook    — POST /webhook/status, logs delivery statuses
 *
 * The verification GET challenge is handled inline in src/index.ts.
 * A prior state-machine-based path (flows/, handleWebhook, processMessage) was
 * removed in favour of the agent layer.
 */

import { Request, Response } from 'express';
import { sendTextMessage } from '../services/dialog360.js';
import { agent } from '../agent/agent.js';

// ── Logging ──────────────────────────────────────────────────────────────────

const log = (level: 'info' | 'warn' | 'error', msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), handler: 'webhook', level, msg, data };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
};

// ── Payload shapes (Dialog360 / WhatsApp Cloud API) ──────────────────────────

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

// ── Rate limiting (in-process, per-phone) ────────────────────────────────────
//
// Sliding-window limiter: max RATE_LIMIT_MAX_MSGS per RATE_LIMIT_WINDOW_MS per
// phone. This is process-local; multi-instance deployments need Redis or the
// Supabase `conversation_messages` table as shared state. See UAT_HANDOFF §4b.

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MSGS = 10;
const RATE_LIMIT_REPLY =
  'You are sending messages too quickly. Please wait a moment and try again.';

const _rateLimitMap = new Map<string, number[]>();

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (_rateLimitMap.get(phone) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  _rateLimitMap.set(phone, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_MSGS;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /webhook/dialog360
 * Receives incoming WhatsApp messages and routes them to the Claude agent.
 * Responds 200 immediately and processes asynchronously (Dialog360 requires
 * <15s to the 200; the agent tool loop can take longer than that).
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
            log('info', 'unsupported message type', { phone, type: msg.type });
            continue;
        }

        if (isRateLimited(phone)) {
          log('warn', 'rate-limit exceeded', { phone });
          // Fire-and-forget — do not block the already-sent 200.
          sendTextMessage(phone, RATE_LIMIT_REPLY).catch((e) =>
            log('error', 'throttle reply failed', { phone, e }),
          );
          continue;
        }

        agent.processMessage(phone, messageText, mediaId).catch((err) => {
          log('error', 'agent.processMessage failed', { phone, err: String(err) });
        });
      }
    }
  }
}

/**
 * POST /webhook/status
 * Receives delivery status updates (sent, delivered, read, failed). Currently
 * logged only; wire to a `message_status` table in a future phase if we want
 * analytics.
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
        log('info', 'delivery status', {
          msg_id: status.id,
          to: status.recipient_id,
          status: status.status,
          errors: status.errors,
        });
      }
    }
  }
}
