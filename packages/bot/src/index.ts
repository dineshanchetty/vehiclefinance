import 'dotenv/config';
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

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[bot] Vehicle Finance Bot running on port ${PORT}`);
  console.log(`[bot] Webhook endpoint: POST /webhook/dialog360`);
  console.log(`[bot] Health check: GET /health`);
});

export default app;
