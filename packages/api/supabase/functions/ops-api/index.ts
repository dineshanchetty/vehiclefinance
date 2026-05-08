// ops-api — single edge function that routes the dashboard's ops endpoints.
// Mirrors the Express routes in packages/bot/src/index.ts:
//
//   POST /ops-send-message     → send WhatsApp + persist conversation_messages
//   POST /notify-seller        → handle_notify_seller tool + audit
//   POST /send-quote           → trigger agent presentation flow for buyer
//   POST /send-contract        → trigger agent contract flow (buyer + seller)
//   POST /send-notification    → plain WhatsApp send-text passthrough
//
// Path is taken from the URL pathname's last segment so the same function
// handles all routes (Supabase functions are 1:1 with deploy slugs).
//
// CORS is permissive for the web dashboard (localhost:5173 + *.vercel.app).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { agent } from "../_shared/agent.ts"
import { sendTextMessage } from "../_shared/dialog360.ts"
import { handle_notify_seller } from "../_shared/tool-handlers.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin === "http://localhost:5173" || origin?.endsWith(".vercel.app") ? origin : ""
  return {
    "Access-Control-Allow-Origin": allow ?? "",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  }
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  })
}

async function opsSendMessage(req: Request, origin: string | null): Promise<Response> {
  const body = await req.json().catch(() => null) as
    | { phone?: string; message?: string; ops_user_id?: string; deal_id?: string } | null
  if (!body?.phone || !body?.message) {
    return json({ error: "phone and message are required" }, 400, origin)
  }
  try {
    await sendTextMessage(body.phone, body.message)
    const sb = getSupabaseClient()
    const { data, error } = await sb.from("conversation_messages").insert({
      phone: body.phone,
      deal_id: body.deal_id ?? null,
      role: "assistant",
      content: body.message,
      tool_use: { sent_by_ops: true, ops_user_id: body.ops_user_id ?? null, deal_id: body.deal_id ?? null },
    }).select("id").single()
    if (error) throw error
    const { error: auditErr } = await sb.from("audit_events").insert({
      deal_id: body.deal_id ?? null,
      event_type: "ops_message_sent",
      actor_type: "ops",
      actor: body.ops_user_id ?? "unknown",
      details: { phone: body.phone, length: body.message.length },
    })
    if (auditErr) console.warn("[ops-api] ops-send-message audit insert failed:", auditErr.message)
    return json({ success: true, message_id: data.id }, 200, origin)
  } catch (err) {
    console.error("[ops-api] ops-send-message error:", err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500, origin)
  }
}

async function notifySeller(req: Request, origin: string | null): Promise<Response> {
  const body = await req.json().catch(() => null) as
    | { deal_id?: string; ops_user_id?: string } | null
  if (!body?.deal_id) return json({ error: "deal_id is required" }, 400, origin)
  try {
    const result = await handle_notify_seller({ deal_id: body.deal_id })
    if (!result.success) {
      return json({ success: false, error: result.error ?? "notify_seller failed" }, 400, origin)
    }
    try {
      const sb = getSupabaseClient()
      await sb.from("audit_events").insert({
        deal_id: body.deal_id,
        event_type: "ops_seller_notify_triggered",
        actor_type: "ops",
        actor: body.ops_user_id ?? "unknown",
        details: { source: "web-dashboard" },
      })
    } catch (auditErr) {
      console.warn("[ops-api] notify-seller audit insert failed:", auditErr)
    }
    return json({ success: true, message: result.message }, 200, origin)
  } catch (err) {
    console.error("[ops-api] notify-seller error:", err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500, origin)
  }
}

async function sendQuote(req: Request, origin: string | null): Promise<Response> {
  const body = await req.json().catch(() => null) as
    | { deal_id?: string; buyer_phone?: string } | null
  if (!body?.deal_id || !body?.buyer_phone) {
    return json({ error: "deal_id and buyer_phone are required" }, 400, origin)
  }
  try {
    const trigger = `[SYSTEM] Finance quote is now available for deal ${body.deal_id}. Present it to the buyer.`
    await agent.processMessage(body.buyer_phone, trigger)
    return json({ success: true }, 200, origin)
  } catch (err) {
    console.error("[ops-api] send-quote error:", err)
    return json({ error: "Failed to send quote" }, 500, origin)
  }
}

async function sendContract(req: Request, origin: string | null): Promise<Response> {
  const body = await req.json().catch(() => null) as
    | { deal_id?: string; buyer_phone?: string; seller_phone?: string } | null
  if (!body?.deal_id || !body?.buyer_phone) {
    return json({ error: "deal_id and buyer_phone are required" }, 400, origin)
  }
  try {
    const buyerTrigger = `[SYSTEM] The finance contract for deal ${body.deal_id} is now ready. Send the buyer their signing link.`
    await agent.processMessage(body.buyer_phone, buyerTrigger)
    if (body.seller_phone) {
      const sellerTrigger = `[SYSTEM] The finance contract for deal ${body.deal_id} is now ready. Send the seller their signing link.`
      await agent.processMessage(body.seller_phone, sellerTrigger)
    }
    return json({ success: true }, 200, origin)
  } catch (err) {
    console.error("[ops-api] send-contract error:", err)
    return json({ error: "Failed to send contract" }, 500, origin)
  }
}

async function sendNotification(req: Request, origin: string | null): Promise<Response> {
  const body = await req.json().catch(() => null) as
    | { phone?: string; message?: string } | null
  if (!body?.phone || !body?.message) {
    return json({ error: "phone and message are required" }, 400, origin)
  }
  try {
    await sendTextMessage(body.phone, body.message)
    return json({ success: true }, 200, origin)
  } catch (err) {
    console.error("[ops-api] send-notification error:", err)
    return json({ error: "Failed to send notification" }, 500, origin)
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin)
  }
  // Pathname looks like /ops-api/<route>. Take the trailing segment.
  const url = new URL(req.url)
  const segments = url.pathname.split("/").filter(Boolean)
  const route = segments[segments.length - 1] ?? ""
  switch (route) {
    case "ops-send-message":  return opsSendMessage(req, origin)
    case "notify-seller":     return notifySeller(req, origin)
    case "send-quote":        return sendQuote(req, origin)
    case "send-contract":     return sendContract(req, origin)
    case "send-notification": return sendNotification(req, origin)
    default:
      return json({ error: `Unknown route: ${route}`, available: [
        "ops-send-message", "notify-seller", "send-quote", "send-contract", "send-notification",
      ] }, 404, origin)
  }
})
