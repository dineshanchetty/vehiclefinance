// recovery-trace — Workstream B pass (B1 routing consumed + B2 tracing).
//
// Takes non-contactable declines (workstream B_REACTIVATION) and enriches their
// contact details from the configured trace provider. On a hit, the traced
// details are persisted and the lead advances to ENGAGING (ready for the gated
// outbound step). On a miss, it advances to UNREACHABLE.
//
// It does NOT send any message — outbound re-contact is business-initiated and
// requires an approved template (G2) + consent (G1). This keeps the deployed bot
// untouched. Tracing lookups themselves also sit behind consent (G1) + data-
// source access (G5); until a real provider is configured, TRACE_PROVIDER=stub
// runs an offline deterministic stub so the pipeline is testable.
//
// AUTH: x-intake-key: <DECLINE_INTAKE_KEY>. Deployed --no-verify-jwt.
// POST body (optional): { limit?: number, lead_ids?: string[], retrace?: bool }
// Response: { processed, traced, unreachable, results:[...] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getTraceProvider, bestCandidate } from "../_shared/tracing.ts"

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
  id_number: string | null
  phone: string | null
  email: string | null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)

  const expected = Deno.env.get("DECLINE_INTAKE_KEY")
  if (!expected) return json({ error: "not configured" }, 503)
  if (req.headers.get("x-intake-key") !== expected) return json({ error: "unauthorized" }, 401)

  let body: { limit?: number; lead_ids?: string[]; retrace?: boolean } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 1000)

  let provider
  try { provider = getTraceProvider((k) => Deno.env.get(k)) }
  catch (e) { return json({ error: (e as Error).message }, 503) }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )

  let q = supa.from("decline_leads")
    .select("id, absa_ref, full_name, id_number, phone, email")
    .eq("workstream", "B_REACTIVATION")
    .neq("recovery_status", "OPTED_OUT")   // never re-trace an opted-out lead
    .limit(limit)
  if (body.lead_ids && body.lead_ids.length) q = q.in("id", body.lead_ids)
  else if (!body.retrace) q = q.is("traced_phone", null).in("recovery_status", ["NEW", "ROUTED"])

  const { data: leads, error } = await q
  if (error) return json({ error: `select failed: ${error.message}` }, 500)

  const results: unknown[] = []
  let traced = 0, unreachable = 0

  for (const lead of (leads ?? []) as Lead[]) {
    const candidates = await provider.trace({
      fullName: lead.full_name,
      idNumber: lead.id_number,
      knownPhone: lead.phone,
      knownEmail: lead.email,
    })
    const best = bestCandidate(candidates)

    if (best) {
      traced++
      await supa.from("decline_leads").update({
        traced_phone: best.phone ?? null,
        traced_email: best.email ?? null,
        traced_address: best.address ?? null,
        trace_source: best.source,
        trace_confidence: best.confidence,
        recovery_status: "ENGAGING", // traced → ready for the gated outbound step
      }).eq("id", lead.id)
      results.push({ absa_ref: lead.absa_ref, traced: true, source: best.source, confidence: best.confidence })
    } else {
      unreachable++
      await supa.from("decline_leads").update({ recovery_status: "UNREACHABLE" }).eq("id", lead.id)
      results.push({ absa_ref: lead.absa_ref, traced: false })
    }
  }

  return json({ processed: (leads ?? []).length, traced, unreachable, provider: provider.name, results })
})
