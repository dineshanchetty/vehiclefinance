import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateDealRequest {
  buyer_phone: string
  buyer_name?: string
  vehicle_make?: string
  vehicle_model?: string
  vehicle_year?: number
  vehicle_price?: number
  source?: string
}

// ---------------------------------------------------------------------------
// Deal reference generator
// ---------------------------------------------------------------------------

async function generateDealRef(
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<string> {
  const year = new Date().getFullYear()
  // Count deals created this year to get next sequence number
  const { count } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${year}-01-01T00:00:00Z`)

  const seq = ((count ?? 0) + 1).toString().padStart(5, "0")
  return `DL-${year}-${seq}`
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let body: CreateDealRequest
  try {
    body = await req.json()
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 })
  }

  const { buyer_phone, buyer_name, vehicle_make, vehicle_model, vehicle_year, vehicle_price, source } = body

  if (!buyer_phone) {
    return new Response("Bad Request: buyer_phone is required", { status: 400 })
  }

  const supabase = getSupabaseClient()

  try {
    // Check if buyer already has an active deal
    const { data: existingBuyer } = await supabase
      .from("buyers")
      .select("id, deal_id")
      .eq("phone", buyer_phone)
      .maybeSingle()

    if (existingBuyer?.deal_id) {
      const { data: existingDeal } = await supabase
        .from("deals")
        .select("id, deal_ref, status")
        .eq("id", existingBuyer.deal_id)
        .single()

      if (existingDeal && !["COMPLETED", "CANCELLED", "DECLINED"].includes(existingDeal.status)) {
        return new Response(
          JSON.stringify({
            deal_id: existingDeal.id,
            deal_ref: existingDeal.deal_ref,
            status: existingDeal.status,
            existing: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }
    }

    const dealRef = await generateDealRef(supabase)

    // Create deal
    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .insert({
        deal_ref: dealRef,
        status: "INITIATED",
        source: source ?? "WHATSAPP",
        vehicle_make: vehicle_make ?? null,
        vehicle_model: vehicle_model ?? null,
        vehicle_year: vehicle_year ?? null,
        vehicle_price: vehicle_price ?? null,
      })
      .select("id")
      .single()

    if (dealError || !deal) {
      throw new Error(`Failed to create deal: ${dealError?.message}`)
    }

    const dealId = deal.id

    // Create or update buyer record
    let buyerId: string
    if (existingBuyer) {
      const { error: updateError } = await supabase
        .from("buyers")
        .update({
          deal_id: dealId,
          ...(buyer_name ? { full_name: buyer_name } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingBuyer.id)
      if (updateError) throw new Error(`Failed to update buyer: ${updateError.message}`)
      buyerId = existingBuyer.id
    } else {
      const { data: buyer, error: buyerError } = await supabase
        .from("buyers")
        .insert({
          deal_id: dealId,
          phone: buyer_phone,
          full_name: buyer_name ?? null,
        })
        .select("id")
        .single()
      if (buyerError || !buyer) throw new Error(`Failed to create buyer: ${buyerError?.message}`)
      buyerId = buyer.id
    }

    // Create initial conversation state
    await supabase.from("conversation_states").insert({
      phone: buyer_phone,
      deal_id: dealId,
      party_type: "buyer",
      current_step: "WELCOME",
      metadata: {},
    }).catch(() => {
      // Table may not exist yet — non-fatal
    })

    // Audit log
    await supabase.from("audit_logs").insert({
      deal_id: dealId,
      event_type: "DEAL_CREATED",
      actor: `system:create-deal`,
      metadata: {
        deal_ref: dealRef,
        buyer_id: buyerId,
        buyer_phone,
        source: source ?? "WHATSAPP",
      },
    })

    return new Response(
      JSON.stringify({
        deal_id: dealId,
        deal_ref: dealRef,
        buyer_id: buyerId,
        status: "INITIATED",
        existing: false,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("create-deal error:", err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
