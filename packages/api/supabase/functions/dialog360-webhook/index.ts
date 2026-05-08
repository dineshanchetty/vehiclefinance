// Dialog360 inbound WhatsApp webhook — Deno edge function port of
// packages/bot/src/handlers/webhook.ts + the GET verification handler from
// packages/bot/src/index.ts.
//
// Behaviour:
//   - GET  → verify hub.challenge against DIALOG360_WEBHOOK_VERIFY_TOKEN.
//   - POST → ack 200 immediately, then process messages → agent loop.
//
// Deploy with:  supabase functions deploy dialog360-webhook --no-verify-jwt
// (Dialog360 cannot send Supabase JWTs.)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { agent } from "../_shared/agent.ts"
import { sendTextMessage, sendTypingIndicator } from "../_shared/dialog360.ts"

interface D360Message {
  from: string; id: string; timestamp: string;
  type: "text" | "image" | "document" | "video" | "audio" | "location" | "interactive" | "button"
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string; caption?: string }
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string }
  video?: { id: string; mime_type: string }
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
  button?: { payload?: string; text: string }
}

interface D360MessageEntry {
  messaging_product: string
  metadata?: { display_phone_number: string; phone_number_id: string }
  contacts?: Array<{ profile: { name: string }; wa_id: string }>
  messages?: D360Message[]
  statuses?: unknown[]
}

interface AgentWebhookPayload {
  object: string
  entry?: Array<{ id: string; changes: Array<{ value: D360MessageEntry; field: string }> }>
}

const log = (level: "info" | "warn" | "error", msg: string, data?: unknown) => {
  const entry = { ts: new Date().toISOString(), handler: "dialog360-webhook", level, msg, data }
  if (level === "error") console.error(JSON.stringify(entry))
  else if (level === "warn") console.warn(JSON.stringify(entry))
  else console.log(JSON.stringify(entry))
}

async function processPayload(payload: AgentWebhookPayload): Promise<void> {
  if (!payload?.entry) return
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value
      if (!value.messages?.length) continue
      for (const msg of value.messages) {
        const phone = msg.from
        let messageText = ""
        let mediaId: string | undefined
        switch (msg.type) {
          case "text":
            messageText = msg.text?.body ?? ""
            break
          case "image":
            mediaId = msg.image?.id
            messageText = msg.image?.caption ?? ""
            break
          case "document":
            mediaId = msg.document?.id
            messageText = msg.document?.caption ?? msg.document?.filename ?? ""
            break
          case "video":
            mediaId = msg.video?.id
            break
          case "interactive":
            if (msg.interactive?.button_reply) messageText = msg.interactive.button_reply.title
            else if (msg.interactive?.list_reply) messageText = msg.interactive.list_reply.title
            break
          case "button":
            messageText = msg.button?.payload ?? msg.button?.text ?? ""
            break
          default:
            log("info", "unsupported message type", { phone, type: msg.type })
            continue
        }
        // Read receipt + typing indicator (fire-and-forget)
        sendTypingIndicator(msg.id)
        if (mediaId) {
          sendTextMessage(
            phone,
            "📎 Got it — I'm processing your file now. This should take about 10–15 seconds…",
          ).catch((e) => log("error", "media ack failed", { phone, e: String(e) }))
        }
        try {
          await agent.processMessage(phone, messageText, mediaId)
        } catch (err) {
          log("error", "agent.processMessage failed", { phone, err: String(err) })
        }
      }
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url)
    const verifyToken = Deno.env.get("DIALOG360_WEBHOOK_VERIFY_TOKEN")
    const mode = url.searchParams.get("hub.mode")
    const token = url.searchParams.get("hub.verify_token")
    const challenge = url.searchParams.get("hub.challenge")
    if (mode === "subscribe" && token === verifyToken && challenge) {
      log("info", "webhook verified")
      return new Response(challenge, { status: 200 })
    }
    return new Response("forbidden", { status: 403 })
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

  let payload: AgentWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 })
  }

  // In edge functions we cannot reply 200 *before* doing the work the way
  // Express does (no res.sendStatus + continue). Instead, kick off processing
  // and return immediately. The platform does keep the function alive for a
  // short tail after the response is flushed, but to be safe we use
  // EdgeRuntime.waitUntil when present so the agent loop completes.
  const work = processPayload(payload).catch((err) => {
    log("error", "processPayload failed", { err: String(err) })
  })
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime
  if (er && typeof er.waitUntil === "function") er.waitUntil(work)

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200, headers: { "Content-Type": "application/json" },
  })
})
