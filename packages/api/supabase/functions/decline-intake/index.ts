// decline-intake — Layer 0 of the recovery platform.
//
// Absa originates + declines in its own systems and sends the declined records
// here. We validate, de-dupe on the Absa reference, map the decline reason, and
// route each record into the right recovery workstream:
//
//   AFFORDABILITY   → Workstream A (upsell)
//   NON_CONTACTABLE → Workstream B (reactivation + tracing)
//   OTHER           → held, unrouted
//
// AUTH: a shared secret. Absa sends `x-intake-key: <DECLINE_INTAKE_KEY>`.
//   The function is deployed with --no-verify-jwt (server-to-server), so this
//   header is the access control. If DECLINE_INTAKE_KEY is unset the function
//   refuses all traffic (fail-closed) — it never runs open, because it accepts PII.
//
// ── Interim feed contract (Absa maps its export to this) ──────────────────────
// POST body — a single record, or { "records": [ … ] }, or a bare array.
//   {
//     "absa_ref":       "APP-2026-0012345",         // REQUIRED — unique per applicant/decision
//     "decline_reason": "affordability",            // REQUIRED — free text, mapped below
//     "applicant": {
//       "full_name": "…", "id_number": "…",
//       "phone": "…", "email": "…", "address": "…"
//     },
//     "vehicle":    { "make":"…","model":"…","year":2019,"price":285000,"deposit":25000 },
//     "financials": { "monthly_income":32000, "disposable_income":4700 },
//     "consent_basis": "application_consent_v3"
//   }
//
// Response: { received, inserted, updated, routed:{A,B,none}, errors:[{absa_ref,error}] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-intake-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type DeclineReason = "AFFORDABILITY" | "NON_CONTACTABLE" | "OTHER"
type Workstream = "A_UPSELL" | "B_REACTIVATION" | "NONE"

// Map Absa's free-text / coded decline reason onto our enum. Deliberately
// generous — the exact code list is finalised with Absa (gate G4), so we match
// on substrings and keep the raw value in decline_reason_raw for audit.
function mapReason(raw: string): DeclineReason {
  const r = (raw ?? "").toLowerCase()
  if (/afford|instal|dti|income|nca|serviceab/.test(r)) return "AFFORDABILITY"
  if (/contact|reach|unreach|no.?answer|rica|invalid.?number|bad.?number|trace/.test(r)) return "NON_CONTACTABLE"
  return "OTHER"
}

function routeFor(reason: DeclineReason): Workstream {
  if (reason === "AFFORDABILITY") return "A_UPSELL"
  if (reason === "NON_CONTACTABLE") return "B_REACTIVATION"
  return "NONE"
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

interface RawRecord {
  absa_ref?: string
  decline_reason?: string
  applicant?: { full_name?: string; id_number?: string; phone?: string; email?: string; address?: string }
  vehicle?: { make?: string; model?: string; year?: number | string; price?: number | string; deposit?: number | string }
  financials?: { monthly_income?: number | string; disposable_income?: number | string }
  consent_basis?: string
  [k: string]: unknown
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...CORS, "content-type": "application/json" } })
  }

  // Fail-closed auth.
  const expected = Deno.env.get("DECLINE_INTAKE_KEY")
  if (!expected) {
    console.error("[decline-intake] DECLINE_INTAKE_KEY not set — refusing all traffic")
    return new Response(JSON.stringify({ error: "intake not configured" }), { status: 503, headers: { ...CORS, "content-type": "application/json" } })
  }
  if (req.headers.get("x-intake-key") !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } })
  }

  // Normalise to an array of records.
  const records: RawRecord[] = Array.isArray(body)
    ? body as RawRecord[]
    : Array.isArray((body as { records?: unknown }).records)
      ? (body as { records: RawRecord[] }).records
      : [body as RawRecord]

  if (records.length === 0) {
    return new Response(JSON.stringify({ error: "no records" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } })
  }
  if (records.length > 5000) {
    return new Response(JSON.stringify({ error: "batch too large (max 5000)" }), { status: 413, headers: { ...CORS, "content-type": "application/json" } })
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )

  const errors: Array<{ absa_ref: string | null; error: string }> = []
  const rows: Record<string, unknown>[] = []
  const routed = { A: 0, B: 0, none: 0 }

  for (const rec of records) {
    const absa_ref = (rec.absa_ref ?? "").toString().trim()
    if (!absa_ref) { errors.push({ absa_ref: null, error: "missing absa_ref" }); continue }
    if (!rec.decline_reason) { errors.push({ absa_ref, error: "missing decline_reason" }); continue }

    const reason = mapReason(rec.decline_reason)
    const workstream = routeFor(reason)
    if (workstream === "A_UPSELL") routed.A++
    else if (workstream === "B_REACTIVATION") routed.B++
    else routed.none++

    const a = rec.applicant ?? {}
    const v = rec.vehicle ?? {}
    const f = rec.financials ?? {}

    rows.push({
      source: "absa",
      absa_ref,
      decline_reason: reason,
      decline_reason_raw: String(rec.decline_reason),
      workstream,
      recovery_status: "ROUTED",
      routed_at: new Date().toISOString(),
      full_name: a.full_name ?? null,
      id_number: a.id_number ?? null,
      phone: a.phone ?? null,
      email: a.email ?? null,
      physical_address: a.address ?? null,
      vehicle_make: v.make ?? null,
      vehicle_model: v.model ?? null,
      vehicle_year: num(v.year),
      vehicle_price: num(v.price),
      deposit_amount: num(v.deposit),
      monthly_income: num(f.monthly_income),
      disposable_income: num(f.disposable_income),
      consent_basis: rec.consent_basis ?? null,
      raw_payload: rec,
    })
  }

  let inserted = 0, updated = 0
  if (rows.length > 0) {
    // Idempotent upsert on (source, absa_ref). We fetch existing refs first so we
    // can report inserted vs updated honestly.
    const refs = rows.map((r) => r.absa_ref as string)
    const { data: existing } = await supa
      .from("decline_leads").select("absa_ref").eq("source", "absa").in("absa_ref", refs)
    const existingSet = new Set((existing ?? []).map((e: { absa_ref: string }) => e.absa_ref))

    const { error } = await supa
      .from("decline_leads")
      .upsert(rows, { onConflict: "source,absa_ref" })
    if (error) {
      return new Response(JSON.stringify({ error: `upsert failed: ${error.message}` }), { status: 500, headers: { ...CORS, "content-type": "application/json" } })
    }
    for (const r of rows) {
      if (existingSet.has(r.absa_ref as string)) updated++
      else inserted++
    }
  }

  return new Response(JSON.stringify({
    received: records.length,
    inserted, updated,
    routed,
    errors,
  }), { status: 200, headers: { ...CORS, "content-type": "application/json" } })
})
