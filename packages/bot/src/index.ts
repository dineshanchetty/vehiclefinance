// MUST be first — loads .env before any other module sees process.env.
import './bootstrap.js';
import express, { type Application } from 'express';
import { handleDialog360Webhook, handleStatusWebhook } from './handlers/webhook.js';
import { sendTextMessage } from './services/dialog360.js';
import { agent } from './agent/agent.js';

// ── Startup assertions: fail fast if required secrets are missing ─────────────
// The bot MUST use the service-role key (bypasses RLS). Anon key is never used
// here — using it would cause every query to be silently blocked by RLS.
(function assertRequiredEnv() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
  ] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `[startup] FATAL: Missing required environment variables: ${missing.join(', ')}.\n` +
      `The bot requires SUPABASE_SERVICE_ROLE_KEY (not the anon key) to bypass RLS.`,
    );
    process.exit(1);
  }
  console.log('[startup] Service-role key present — RLS bypass confirmed for bot.');
})();

const app: Application = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// CORS — allow the web dashboard (Vite dev on :5173, or Vercel preview/prod)
// to call the internal API endpoints (e.g. /api/ops-send-message).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin === 'http://localhost:5173' ||
    origin?.endsWith('.vercel.app') ||
    origin?.endsWith('.azurestaticapps.net')
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Trust proxy headers in production (behind load balancer / Cloudflare)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vehiclefinance-bot', timestamp: new Date().toISOString() });
});

// ── WhatsApp webhook endpoints ────────────────────────────────────────────────
// GET is used by Dialog360 to verify the webhook endpoint
app.get('/webhook/dialog360', (req, res) => {
  const verifyToken = process.env.DIALOG360_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[webhook] Dialog360 webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook/dialog360', handleDialog360Webhook);
app.post('/webhook/status', handleStatusWebhook);

// ── Internal API endpoints ────────────────────────────────────────────────────

/**
 * POST /api/send-quote
 * Called internally (e.g. by a Supabase function or ops dashboard) when a
 * finance quote is ready for the buyer.
 * Body: { deal_id: string, buyer_phone: string }
 */
app.post('/api/send-quote', async (req, res) => {
  const { deal_id, buyer_phone } = req.body as { deal_id?: string; buyer_phone?: string };

  if (!deal_id || !buyer_phone) {
    res.status(400).json({ error: 'deal_id and buyer_phone are required' });
    return;
  }

  try {
    // Inject a synthetic message to trigger the quote presentation flow
    const triggerMessage = `[SYSTEM] Finance quote is now available for deal ${deal_id}. Present it to the buyer.`;
    await agent.processMessage(buyer_phone, triggerMessage);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] send-quote error:', err);
    res.status(500).json({ error: 'Failed to send quote' });
  }
});

/**
 * POST /api/send-contract
 * Called internally when the e-signature contract is ready.
 * Body: { deal_id: string, buyer_phone: string, seller_phone?: string }
 */
app.post('/api/send-contract', async (req, res) => {
  const { deal_id, buyer_phone, seller_phone } = req.body as {
    deal_id?: string;
    buyer_phone?: string;
    seller_phone?: string;
  };

  if (!deal_id || !buyer_phone) {
    res.status(400).json({ error: 'deal_id and buyer_phone are required' });
    return;
  }

  try {
    const buyerTrigger = `[SYSTEM] The finance contract for deal ${deal_id} is now ready. Send the buyer their signing link.`;
    await agent.processMessage(buyer_phone, buyerTrigger);

    if (seller_phone) {
      const sellerTrigger = `[SYSTEM] The finance contract for deal ${deal_id} is now ready. Send the seller their signing link.`;
      await agent.processMessage(seller_phone, sellerTrigger);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[api] send-contract error:', err);
    res.status(500).json({ error: 'Failed to send contract' });
  }
});

/**
 * POST /api/send-notification
 * Internal trigger for status update notifications.
 * Body: { phone: string, message: string }
 */
app.post('/api/send-notification', async (req, res) => {
  const { phone, message } = req.body as { phone?: string; message?: string };

  if (!phone || !message) {
    res.status(400).json({ error: 'phone and message are required' });
    return;
  }

  try {
    await sendTextMessage(phone, message);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] send-notification error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

/**
 * POST /api/ops-send-message
 * Lets an ops agent send a WhatsApp message directly to a customer from the
 * deal-detail conversation panel. Persists the outgoing turn to
 * `conversation_messages` so the dashboard's realtime view reflects it, and
 * appends an audit event.
 *
 * Body: { phone, message, ops_user_id?, deal_id? }
 *
 * NOTE: the `conversation_messages` table has no `metadata` column today;
 * we encode the ops marker in `tool_use` jsonb (the closest existing
 * jsonb column) so we can identify ops-sent messages without a migration.
 */
app.post('/api/ops-send-message', async (req, res) => {
  const { phone, message, ops_user_id, deal_id } = req.body as {
    phone?: string;
    message?: string;
    ops_user_id?: string;
    deal_id?: string;
  };

  if (!phone || !message) {
    res.status(400).json({ error: 'phone and message are required' });
    return;
  }

  try {
    await sendTextMessage(phone, message);

    const { getSupabaseClient } = await import('./services/supabase.js');
    const sb = getSupabaseClient();

    const { data, error } = await sb
      .from('conversation_messages')
      .insert({
        phone,
        deal_id: deal_id ?? null,
        role: 'assistant',
        content: message,
        tool_use: { sent_by_ops: true, ops_user_id: ops_user_id ?? null, deal_id: deal_id ?? null },
      })
      .select('id')
      .single();
    if (error) throw error;

    const { error: auditErr } = await sb.from('audit_events').insert({
      deal_id: deal_id ?? null,
      event_type: 'ops_message_sent',
      actor_type: 'ops',
      actor: ops_user_id ?? 'unknown',
      details: { phone, length: message.length },
    });
    if (auditErr) console.warn('[api] ops-send-message audit insert failed:', auditErr.message);

    res.json({ success: true, message_id: data.id });
  } catch (err) {
    console.error('[api] ops-send-message error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/notify-seller
 * Triggered from the ops dashboard's Seller tab. Re-uses the existing
 * `notify_seller` tool handler so the WhatsApp intro copy + audit-event
 * are identical to the bot-driven path.
 *
 * Body: { deal_id, ops_user_id? }
 * Returns: { success, message } or { success: false, error }
 */
app.post('/api/notify-seller', async (req, res) => {
  const { deal_id, ops_user_id } = req.body as {
    deal_id?: string;
    ops_user_id?: string;
  };

  if (!deal_id) {
    res.status(400).json({ error: 'deal_id is required' });
    return;
  }

  try {
    const { handle_notify_seller } = await import('./agent/tool-handlers.js');
    const result = await handle_notify_seller({ deal_id });

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error ?? 'notify_seller failed' });
      return;
    }

    // Mark this as ops-initiated in the audit trail.
    try {
      const { getSupabaseClient } = await import('./services/supabase.js');
      const sb = getSupabaseClient();
      await sb.from('audit_events').insert({
        deal_id,
        event_type: 'ops_seller_notify_triggered',
        actor_type: 'ops',
        actor: ops_user_id ?? 'unknown',
        details: { source: 'web-dashboard' },
      });
    } catch (auditErr) {
      console.warn('[api] notify-seller audit insert failed:', auditErr);
    }

    res.json({ success: true, message: result.message });
  } catch (err) {
    console.error('[api] notify-seller error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
// NOTE: An in-process escalation scheduler previously ran here, driven by a
// `conversation_state` table that the old rule-based flows wrote to. That path
// was removed; the agent stores conversation turns in `conversation_messages`
// instead. A replacement stuck-conversation detector — driven by
// `conversation_messages.created_at` and ideally run as pg_cron, not
// setInterval — is tracked in UAT_HANDOFF §4b.

app.listen(PORT, () => {
  console.log(`[bot] Vehicle Finance Bot running on port ${PORT}`);
  console.log(`[bot] Webhook endpoint: POST /webhook/dialog360`);
  console.log(`[bot] Health check: GET /health`);
});

export default app;
