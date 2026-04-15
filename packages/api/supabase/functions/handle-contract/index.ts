import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"
import { sendWhatsAppMessage, textMessage } from "../_shared/dialog360.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SendContractRequest {
  deal_id: string
  contract_id: string
  buyer_phone: string
  signing_url: string
  expiry_hours?: number
}

interface SignatureWebhookPayload {
  // Standard fields from e-signature providers (DocuSign/HelloSign/SignNow style)
  event: string
  status?: "SIGNED" | "DECLINED" | "EXPIRED" | "VIEWED"
  envelope_id?: string
  document_id?: string
  signer_email?: string
  completed_at?: string
  metadata?: Record<string, string>
  // Some providers use different field names
  signature_request_id?: string
  signed_at?: string
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
// Route: POST /send
// ---------------------------------------------------------------------------

async function handleSend(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: SendContractRequest
): Promise<Response> {
  const { deal_id, contract_id, buyer_phone, signing_url, expiry_hours = 24 } = body

  if (!deal_id || !contract_id || !buyer_phone || !signing_url) {
    return new Response(
      "Bad Request: deal_id, contract_id, buyer_phone, and signing_url are required",
      { status: 400 }
    )
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  // Update contract status to SENT
  const { error: contractError } = await supabase
    .from("contracts")
    .update({
      status: "SENT",
      signing_url,
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiry_hours * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", contract_id)
    .eq("deal_id", deal_id)

  if (contractError) {
    return new Response(JSON.stringify({ error: contractError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Update deal status
  await supabase
    .from("deals")
    .update({ status: "CONTRACT_SENT", updated_at: new Date().toISOString() })
    .eq("id", deal_id)

  const { data: deal } = await supabase
    .from("deals")
    .select("deal_ref")
    .eq("id", deal_id)
    .single()

  // Send WhatsApp notification with signing link
  await notifyAsync(supabaseUrl, serviceKey, {
    deal_id,
    recipient_phone: buyer_phone,
    channel: "WHATSAPP",
    template: "CONTRACT_READY",
    data: {
      deal_ref: deal?.deal_ref ?? deal_id,
      signing_url,
      expiry_hours: String(expiry_hours),
    },
  })

  // Audit log
  await supabase.from("audit_logs").insert({
    deal_id,
    event_type: "CONTRACT_SENT",
    actor: "portal:handle-contract",
    metadata: { contract_id, buyer_phone, expiry_hours },
  })

  return new Response(
    JSON.stringify({ success: true, deal_id, contract_id, status: "SENT" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

// ---------------------------------------------------------------------------
// Route: POST /webhook  (receives e-signature provider callbacks)
// ---------------------------------------------------------------------------

async function handleWebhook(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: SignatureWebhookPayload
): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  // Normalise provider-specific fields
  const externalId = body.envelope_id ?? body.signature_request_id
  const eventStatus = body.status?.toUpperCase()
  const completedAt = body.completed_at ?? body.signed_at

  if (!externalId) {
    return new Response("Bad Request: missing envelope_id / signature_request_id", { status: 400 })
  }

  // Look up contract by external signing reference
  const { data: contract, error: findError } = await supabase
    .from("contracts")
    .select("id, deal_id, status")
    .eq("external_signing_id", externalId)
    .maybeSingle()

  if (findError) {
    return new Response(JSON.stringify({ error: findError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!contract) {
    // Unknown contract — might be a test ping, acknowledge safely
    console.warn(`Received signature webhook for unknown external_signing_id: ${externalId}`)
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { id: contractId, deal_id } = contract

  if (eventStatus === "SIGNED" || body.event === "signature_request_signed") {
    // Update contract to SIGNED
    await supabase
      .from("contracts")
      .update({
        status: "SIGNED",
        signed_at: completedAt ?? new Date().toISOString(),
        signer_email: body.signer_email ?? null,
      })
      .eq("id", contractId)

    // Update deal status
    await supabase
      .from("deals")
      .update({ status: "CONTRACT_SIGNED", updated_at: new Date().toISOString() })
      .eq("id", deal_id)

    // Create NATIS transfer task
    await supabase.from("tasks").insert({
      queue_name: "Q_NATIS_TRANSFER",
      deal_id,
      title: "Initiate NATIS transfer — contract signed",
      description: `Contract ${contractId} signed. Process vehicle registration transfer.`,
      priority: "NORMAL",
      status: "OPEN",
      metadata: { contract_id: contractId },
    })

    // Notify buyer
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
      await notifyAsync(supabaseUrl, serviceKey, {
        deal_id,
        recipient_phone: buyer.phone,
        channel: "WHATSAPP",
        template: "CONTRACT_SIGNED",
        data: {
          deal_ref: deal?.deal_ref ?? deal_id,
          approval_hours: "24",
        },
      })
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      deal_id,
      event_type: "CONTRACT_SIGNED",
      actor: "system:handle-contract",
      metadata: {
        contract_id: contractId,
        external_signing_id: externalId,
        signer_email: body.signer_email,
        signed_at: completedAt,
      },
    })
  } else if (eventStatus === "DECLINED") {
    await supabase
      .from("contracts")
      .update({ status: "DECLINED" })
      .eq("id", contractId)

    await supabase
      .from("deals")
      .update({ status: "CONTRACT_DECLINED", updated_at: new Date().toISOString() })
      .eq("id", deal_id)

    await supabase.from("audit_logs").insert({
      deal_id,
      event_type: "CONTRACT_DECLINED",
      actor: "system:handle-contract",
      metadata: { contract_id: contractId, external_signing_id: externalId },
    })
  } else if (eventStatus === "EXPIRED") {
    await supabase
      .from("contracts")
      .update({ status: "EXPIRED" })
      .eq("id", contractId)

    await supabase.from("audit_logs").insert({
      deal_id,
      event_type: "CONTRACT_EXPIRED",
      actor: "system:handle-contract",
      metadata: { contract_id: contractId, external_signing_id: externalId },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
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
    case "send":
      return handleSend(supabase, body as SendContractRequest)
    case "webhook":
      return handleWebhook(supabase, body as SignatureWebhookPayload)
    default:
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}. Use /send or /webhook` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
  }
})
