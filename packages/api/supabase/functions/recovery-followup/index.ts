// recovery-followup — the automated outreach agent.
//
// Runs on a schedule (pg_cron → this endpoint) and keeps engaged upsell
// journeys moving without a human touching them:
//
//   • Lead RE_ENGAGED but quiet  → send a nudge, capped + spaced
//   • Session window closing     → final "window closing" nudge
//   • Session window closed      → count it (template re-open path, gate G2);
//                                  a business message CANNOT reopen the window,
//                                  only the customer replying can — so we never
//                                  send into a closed window.
//   • OPTED_OUT / RETURNED / …   → never touched
//
// Compliance rails, in order:
//   1. WhatsApp 24h window: free-form sends only while the customer's LAST
//      inbound message is < 24h old (checked against conversation_messages).
//   2. Nudge cap: MAX_NUDGES per engagement — automation must not become spam.
//   3. Spacing: at least MIN_GAP_HOURS since the last nudge or any activity.
//   4. Opt-out is terminal: OPTED_OUT leads are excluded at the query.
//
// AUTH: x-intake-key (same shared secret as the other recovery fns).
// POST body (optional): { dry?: boolean, limit?: number }
//   dry=true → report what WOULD be sent, send nothing (for testing).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendTextMessage } from "../_shared/dialog360.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-intake-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } })

const MAX_NUDGES = 2          // per engagement — 3 unanswered messages total incl. the offer
const MIN_GAP_HOURS = 4       // quiet time before we nudge
const WINDOW_HOURS = 24       // WhatsApp customer-service window
const CLOSING_THRESHOLD = 20  // after this many hours, send the final nudge

function nudgeCopy(attempt: number, firstName: string, hoursLeft: number): string {
  if (attempt === 0) {
    return `Hi ${firstName} 👋 Just checking in — did any of those cars catch your eye? ` +
      `Reply with the name (e.g. *the Golf*) or *1*, *2* or *3* and I'll take it from there 🚗`
  }
  // Final nudge — the window is closing; honest urgency, no dark patterns.
  return `Hi ${firstName} — I can hold your pre-qualified amount for this conversation a little longer ` +
    `(about ${Math.max(1, Math.round(hoursLeft))}h). If you'd like one of the cars I sent, just reply *1*, *2* or *3*. ` +
    `No rush otherwise — you can always message me here to pick it up again. 👍`
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)

  const expected = Deno.env.get("DECLINE_INTAKE_KEY")
  if (!expected) return json({ error: "not configured" }, 503)
  if (req.headers.get("x-intake-key") !== expected) return json({ error: "unauthorized" }, 401)

  let body: { dry?: boolean; limit?: number } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const dry = body.dry === true
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 500)

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )

  // Candidates: engaged upsell leads with a phone, under the nudge cap.
  const { data: leads, error } = await supa.from("decline_leads")
    .select("id, absa_ref, full_name, phone, recovery_status, followup_count, last_followup_at, updated_at")
    .eq("workstream", "A_UPSELL")
    .eq("recovery_status", "RE_ENGAGED")
    .lt("followup_count", MAX_NUDGES)
    .not("phone", "is", null)
    .limit(limit)
  if (error) return json({ error: `select failed: ${error.message}` }, 500)

  const now = Date.now()
  let nudged = 0, tooSoon = 0, windowClosed = 0, noInbound = 0
  const actions: unknown[] = []

  for (const lead of leads ?? []) {
    // Last inbound message from the customer — anchors the 24h window.
    const { data: lastIn } = await supa.from("conversation_messages")
      .select("created_at")
      .eq("phone", lead.phone).eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle()

    if (!lastIn) { noInbound++; continue } // never messaged us — outbound is template-only (G1/G2)

    const hoursSinceInbound = (now - new Date(lastIn.created_at).getTime()) / 3_600_000
    if (hoursSinceInbound >= WINDOW_HOURS) {
      windowClosed++ // template re-open path (G2) — never free-form into a closed window
      actions.push({ absa_ref: lead.absa_ref, action: "window_closed" })
      continue
    }

    // Quiet-time spacing: measure from the latest of last nudge / lead activity.
    const lastTouch = Math.max(
      new Date(lead.updated_at).getTime(),
      lead.last_followup_at ? new Date(lead.last_followup_at).getTime() : 0,
      new Date(lastIn.created_at).getTime(),
    )
    const quietHours = (now - lastTouch) / 3_600_000
    const isClosing = hoursSinceInbound >= CLOSING_THRESHOLD
    // Nudge when quiet long enough — or immediately if the window is about to
    // close and we still have a nudge budget left.
    if (quietHours < MIN_GAP_HOURS && !isClosing) { tooSoon++; continue }

    const first = (lead.full_name ?? "").trim().split(/\s+/)[0] || "there"
    const msg = nudgeCopy(lead.followup_count, first, WINDOW_HOURS - hoursSinceInbound)

    if (!dry) {
      await sendTextMessage(lead.phone, msg)
      await supa.from("conversation_messages").insert({
        phone: lead.phone, role: "assistant", content: msg, party_type: "buyer",
        tool_use: { source: "recovery-followup", nudge: lead.followup_count + 1 },
      })
      await supa.from("decline_leads").update({
        followup_count: lead.followup_count + 1,
        last_followup_at: new Date().toISOString(),
      }).eq("id", lead.id)
    }
    nudged++
    actions.push({ absa_ref: lead.absa_ref, action: dry ? "would_nudge" : "nudged", attempt: lead.followup_count + 1 })
  }

  return json({
    dry, candidates: (leads ?? []).length,
    nudged, too_soon: tooSoon, window_closed: windowClosed, no_inbound: noInbound,
    actions,
  })
})
