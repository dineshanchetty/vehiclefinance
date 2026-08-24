// admin-create-lead — manually add a decline lead from the operator dashboard.
//
// Deployed WITH jwt verification, so only an authenticated dashboard user can
// reach it (the frontend supabase client sends the user's token automatically).
// Inside, it uses the service role to insert + route + fully process the lead so
// the operator immediately sees a priced upsell or a traced reactivation — the
// same processing the automated pipeline does, in one call.
//
// POST body:
//   { full_name, phone, id_number?, email?, decline_reason,
//     vehicle_make?, vehicle_model?, vehicle_year?, vehicle_price?,
//     deposit_amount?, monthly_income?, disposable_income? }
// Response: { lead } (the created + processed row)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { computeQualifyingCeiling, rateConfigFromEnv } from "../_shared/recovery.ts"
import { getTraceProvider, bestCandidate } from "../_shared/tracing.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } })

function mapReason(raw: string): "AFFORDABILITY" | "NON_CONTACTABLE" | "OTHER" {
  const r = (raw ?? "").toLowerCase()
  if (/afford|instal|dti|income|nca/.test(r)) return "AFFORDABILITY"
  if (/contact|reach|unreach|number|trace/.test(r)) return "NON_CONTACTABLE"
  return "OTHER"
}
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  // jwt verification is enforced at the edge (verify_jwt=true) — reaching here
  // means the caller is an authenticated dashboard user.

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: "invalid JSON" }, 400) }

  const full_name = (b.full_name ?? "").toString().trim()
  const phone = (b.phone ?? "").toString().replace(/[^\d]/g, "")
  const declineRaw = (b.decline_reason ?? "").toString().trim()
  if (!full_name) return json({ error: "full_name is required" }, 400)
  if (!phone) return json({ error: "phone is required" }, 400)
  if (!declineRaw) return json({ error: "decline_reason is required" }, 400)

  const reason = mapReason(declineRaw)
  const workstream = reason === "AFFORDABILITY" ? "A_UPSELL" : reason === "NON_CONTACTABLE" ? "B_REACTIVATION" : "NONE"

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )

  // A · price the qualifying ceiling now.
  let qualifying_ceiling: number | null = null
  if (workstream === "A_UPSELL") {
    const res = computeQualifyingCeiling(
      { disposableIncome: num(b.disposable_income), monthlyIncome: num(b.monthly_income), deposit: num(b.deposit_amount) },
      rateConfigFromEnv((k) => Deno.env.get(k)),
    )
    qualifying_ceiling = res.qualifyingCeiling
  }

  // B · trace fresh contact now.
  let traced_phone: string | null = null, trace_source: string | null = null, trace_confidence: number | null = null
  let status = "ROUTED"
  if (workstream === "B_REACTIVATION") {
    try {
      const provider = getTraceProvider((k) => Deno.env.get(k))
      const best = bestCandidate(await provider.trace({ fullName: full_name, idNumber: (b.id_number ?? null) as string | null, knownPhone: phone }))
      if (best) { traced_phone = best.phone ?? null; trace_source = best.source; trace_confidence = best.confidence; status = "ENGAGING" }
      else status = "UNREACHABLE"
    } catch { /* leave ROUTED */ }
  }

  const absa_ref = (b.absa_ref ?? `MANUAL-${Date.now()}`).toString()
  const now = new Date().toISOString()
  const { data, error } = await supa.from("decline_leads").insert({
    source: "manual", absa_ref, decline_reason: reason, decline_reason_raw: declineRaw,
    workstream, recovery_status: status, routed_at: now,
    full_name, phone, id_number: b.id_number ?? null, email: b.email ?? null,
    vehicle_make: b.vehicle_make ?? null, vehicle_model: b.vehicle_model ?? null,
    vehicle_year: num(b.vehicle_year), vehicle_price: num(b.vehicle_price),
    deposit_amount: num(b.deposit_amount), monthly_income: num(b.monthly_income),
    disposable_income: num(b.disposable_income), qualifying_ceiling,
    traced_phone, trace_source, trace_confidence,
    consent_basis: (b.consent_basis ?? "manual_entry") as string,
    raw_payload: b,
  }).select().single()

  if (error) return json({ error: error.message }, 500)
  return json({ lead: data }, 201)
})
