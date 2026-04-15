import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AcceptQuoteRequest {
  deal_id: string
  quote_id: string
}

interface DeclineQuoteRequest {
  deal_id: string
  quote_id: string
  reason?: string
}

interface SendQuoteRequest {
  deal_id: string
  quote_id: string
  buyer_phone: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function notifyAsync(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>
): Promise<void> {
  await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  }).catch(console.error)
}

// ---------------------------------------------------------------------------
// Route: POST /accept
// ---------------------------------------------------------------------------

async function handleAccept(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: AcceptQuoteRequest
): Promise<Response> {
  const { deal_id, quote_id } = body
  if (!deal_id || !quote_id) {
    return new Response("Bad Request: deal_id and quote_id required", { status: 400 })
  }

  // Update quote status
  const { error: quoteError } = await supabase
    .from("quotes")
    .update({ status: "ACCEPTED", accepted_at: new Date().toISOString() })
    .eq("id", quote_id)
    .eq("deal_id", deal_id)

  if (quoteError) {
    return new Response(JSON.stringify({ error: quoteError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Update deal status
  await supabase
    .from("deals")
    .update({ status: "QUOTE_ACCEPTED", updated_at: new Date().toISOString() })
    .eq("id", deal_id)

  // Create contract preparation task
  await supabase.from("tasks").insert({
    queue_name: "Q_CONTRACT_PREP",
    deal_id,
    title: "Prepare contract — quote accepted",
    description: `Quote ${quote_id} accepted. Prepare finance agreement for signing.`,
    priority: "HIGH",
    status: "OPEN",
    metadata: { quote_id },
  })

  // Notify buyer via WhatsApp
  const { data: buyer } = await supabase
    .from("buyers")
    .select("phone")
    .eq("deal_id", deal_id)
    .single()

  const { data: deal } = await supabase
    .from("deals")
    .select("deal_ref")
    .eq("id", deal_id)
    .single()

  if (buyer?.phone) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    await notifyAsync(supabaseUrl, serviceKey, {
      deal_id,
      recipient_phone: buyer.phone,
      channel: "WHATSAPP",
      template: "QUOTE_ACCEPTED",
      data: { deal_ref: deal?.deal_ref ?? deal_id, name: "" },
    })
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    deal_id,
    event_type: "QUOTE_ACCEPTED",
    actor: "system:handle-quote",
    metadata: { quote_id },
  })

  return new Response(JSON.stringify({ success: true, deal_id, quote_id, status: "ACCEPTED" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

// ---------------------------------------------------------------------------
// Route: POST /decline
// ---------------------------------------------------------------------------

async function handleDecline(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: DeclineQuoteRequest
): Promise<Response> {
  const { deal_id, quote_id, reason } = body
  if (!deal_id || !quote_id) {
    return new Response("Bad Request: deal_id and quote_id required", { status: 400 })
  }

  // Update quote status
  const { error: quoteError } = await supabase
    .from("quotes")
    .update({
      status: "DECLINED",
      declined_at: new Date().toISOString(),
      decline_reason: reason ?? null,
    })
    .eq("id", quote_id)
    .eq("deal_id", deal_id)

  if (quoteError) {
    return new Response(JSON.stringify({ error: quoteError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Update deal status
  await supabase
    .from("deals")
    .update({ status: "QUOTE_DECLINED", updated_at: new Date().toISOString() })
    .eq("id", deal_id)

  // Create FNI notification task
  await supabase.from("tasks").insert({
    queue_name: "Q_FNI_QUOTE",
    deal_id,
    title: "Quote declined — FNI follow-up required",
    description: `Quote ${quote_id} declined. Reason: ${reason ?? "Not provided"}`,
    priority: "NORMAL",
    status: "OPEN",
    metadata: { quote_id, decline_reason: reason },
  })

  // Audit log
  await supabase.from("audit_logs").insert({
    deal_id,
    event_type: "QUOTE_DECLINED",
    actor: "system:handle-quote",
    metadata: { quote_id, reason },
  })

  return new Response(JSON.stringify({ success: true, deal_id, quote_id, status: "DECLINED" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

// ---------------------------------------------------------------------------
// Route: POST /send
// ---------------------------------------------------------------------------

async function handleSend(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: SendQuoteRequest
): Promise<Response> {
  const { deal_id, quote_id, buyer_phone } = body
  if (!deal_id || !quote_id || !buyer_phone) {
    return new Response("Bad Request: deal_id, quote_id and buyer_phone required", { status: 400 })
  }

  // Load quote details
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quote_id)
    .eq("deal_id", deal_id)
    .single()

  if (quoteError || !quote) {
    return new Response(JSON.stringify({ error: "Quote not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { data: deal } = await supabase
    .from("deals")
    .select("deal_ref")
    .eq("id", deal_id)
    .single()

  const { data: buyer } = await supabase
    .from("buyers")
    .select("full_name")
    .eq("deal_id", deal_id)
    .single()

  // Update quote to SENT
  await supabase
    .from("quotes")
    .update({ status: "SENT", sent_at: new Date().toISOString() })
    .eq("id", quote_id)

  // Update deal status
  await supabase
    .from("deals")
    .update({ status: "QUOTE_SENT", updated_at: new Date().toISOString() })
    .eq("id", deal_id)

  // Send via notification function
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  await notifyAsync(supabaseUrl, serviceKey, {
    deal_id,
    recipient_phone: buyer_phone,
    channel: "WHATSAPP",
    template: "QUOTE_READY",
    data: {
      deal_ref: deal?.deal_ref ?? deal_id,
      name: buyer?.full_name ?? "",
      monthly_installment: String(quote.monthly_installment ?? ""),
      term_months: String(quote.term_months ?? ""),
      interest_rate: String(quote.interest_rate ?? ""),
    },
  })

  // Audit log
  await supabase.from("audit_logs").insert({
    deal_id,
    event_type: "QUOTE_SENT",
    actor: "portal:handle-quote",
    metadata: { quote_id, buyer_phone },
  })

  return new Response(JSON.stringify({ success: true, deal_id, quote_id, status: "SENT" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const url = new URL(req.url)
  const action = url.pathname.split("/").pop()

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 })
  }

  const supabase = getSupabaseClient()

  switch (action) {
    case "accept":
      return handleAccept(supabase, body as AcceptQuoteRequest)
    case "decline":
      return handleDecline(supabase, body as DeclineQuoteRequest)
    case "send":
      return handleSend(supabase, body as SendQuoteRequest)
    default:
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}. Use /accept, /decline, or /send` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
  }
})
