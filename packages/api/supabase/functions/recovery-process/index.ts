// recovery-process — Workstream A pricing pass (A1 + A2 composition).
//
// For affordability-declined leads (workstream A_UPSELL) that haven't been
// priced yet, this:
//   1. computes the qualifying ceiling from the declined record's financials (A1)
//   2. persists qualifying_ceiling on the lead
//   3. composes the WhatsApp upsell offer + band-correct cars.co.za links (A2)
//
// It does NOT send anything. Outbound re-engagement is business-initiated and
// requires an approved WhatsApp template (gate G2) + confirmed consent (G1); the
// composed offer is returned/held for an operator to review and dispatch. This
// keeps the deployed bot untouched — the demo surface stays frozen.
//
// AUTH: x-intake-key: <DECLINE_INTAKE_KEY> (same fail-closed shared secret as
//   decline-intake). Deployed with --no-verify-jwt.
//
// POST body (all optional): { limit?: number, lead_ids?: string[], reprice?: bool }
// Response: { processed, priced, not_qualifying, offers: [...] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  computeQualifyingCeiling, composeUpsellOffer, rateConfigFromEnv,
} from "../_shared/recovery.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-intake-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } })

interface Lead {
  id: string
  absa_ref: string
  full_name: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_price: number | null
  deposit_amount: number | null
  monthly_income: number | null
  disposable_income: number | null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)

  const expected = Deno.env.get("DECLINE_INTAKE_KEY")
  if (!expected) return json({ error: "not configured" }, 503)
  if (req.headers.get("x-intake-key") !== expected) return json({ error: "unauthorized" }, 401)

  let body: { limit?: number; lead_ids?: string[]; reprice?: boolean } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 1000)

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )
  const cfg = rateConfigFromEnv((k) => Deno.env.get(k))

  // Select A_UPSELL leads to price.
  let q = supa.from("decline_leads")
    .select("id, absa_ref, full_name, vehicle_make, vehicle_model, vehicle_price, deposit_amount, monthly_income, disposable_income")
    .eq("workstream", "A_UPSELL")
    .limit(limit)
  if (body.lead_ids && body.lead_ids.length) q = q.in("id", body.lead_ids)
  else if (!body.reprice) q = q.is("qualifying_ceiling", null) // only unpriced unless repricing

  const { data: leads, error } = await q
  if (error) return json({ error: `select failed: ${error.message}` }, 500)

  const supaUrl = Deno.env.get("SUPABASE_URL")!
  const offers: unknown[] = []
  let priced = 0, notQualifying = 0

  for (const lead of (leads ?? []) as Lead[]) {
    const ceil = computeQualifyingCeiling({
      disposableIncome: lead.disposable_income,
      monthlyIncome: lead.monthly_income,
      deposit: lead.deposit_amount,
    }, cfg)

    if (!ceil.qualifies || ceil.qualifyingCeiling === null) {
      notQualifying++
      await supa.from("decline_leads").update({
        qualifying_ceiling: ceil.qualifyingCeiling, // may be a below-floor number or null
        recovery_status: "CLOSED",
      }).eq("id", lead.id)
      offers.push({ absa_ref: lead.absa_ref, qualifies: false, reason: ceil.reason })
      continue
    }

    priced++
    await supa.from("decline_leads").update({ qualifying_ceiling: ceil.qualifyingCeiling }).eq("id", lead.id)

    const offer = composeUpsellOffer({
      fullName: lead.full_name,
      originalPrice: lead.vehicle_price,
      qualifyingCeiling: ceil.qualifyingCeiling,
      make: lead.vehicle_make,
      model: lead.vehicle_model,
    })

    // Fetch band-correct cars.co.za links from the existing alternatives fn.
    let links: unknown[] = []
    try {
      const res = await fetch(`${supaUrl}/functions/v1/cars-alternatives`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(offer.searchParams),
      })
      if (res.ok) links = (await res.json()).results ?? []
    } catch { /* links are best-effort */ }

    offers.push({
      absa_ref: lead.absa_ref,
      qualifies: true,
      qualifying_ceiling: ceil.qualifyingCeiling,
      safe_instalment: Math.round(ceil.safeInstalment!),
      message: offer.message,
      links,
    })
  }

  return json({ processed: (leads ?? []).length, priced, not_qualifying: notQualifying, offers })
})
