// mindee-webhook — receives Mindee v2 callback when an extraction job completes.
//
// Mindee config (one-time, in Mindee dashboard):
//   1. Webhooks → New Webhook
//   2. URL: https://<project-ref>.supabase.co/functions/v1/mindee-webhook
//   3. Auth: HMAC-SHA256 with secret = MINDEE_WEBHOOK_SECRET (also set as
//      Supabase secret via `supabase secrets set`)
//   4. Copy the webhook ID into Supabase secret MINDEE_WEBHOOK_IDS
//      (comma-separated if multiple).
//
// extract-document, when MINDEE_WEBHOOK_IDS is set, passes that list on the
// enqueue request and uses `alias = <document_id>` so we can correlate the
// callback back to our document row.
//
// Payload shape (Mindee v2):
//   {
//     "job":       { "id": "...", "alias": "<document_id>", "status": "Processed" },
//     "inference": { "result": { "fields": { ... } }, "model": { "id": "..." } }
//   }
//
// We re-use the same flatten + normalise + persist logic as the sync path, so
// the rest of the system (bot, web dashboard) sees identical rows.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  flattenMindeeFields, normaliseForDocType, selfValidateID,
  persistExtraction, type KnownType,
} from "../_shared/extraction.ts"

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")
  // Mindee signs as plain hex; accept exact or "sha256=<hex>" form
  return signature === hex || signature === `sha256=${hex}`
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

  const rawBody = await req.text()
  const secret = Deno.env.get("MINDEE_WEBHOOK_SECRET")
  if (secret) {
    const sig = req.headers.get("x-mindee-signature") ?? req.headers.get("X-Hub-Signature-256")
    const ok = await verifySignature(rawBody, sig, secret)
    if (!ok) return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 })
  }

  let payload: Record<string, unknown>
  try { payload = JSON.parse(rawBody) }
  catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 }) }

  const job = payload.job as { id?: string; alias?: string; status?: string; error?: unknown } | undefined
  const documentId = job?.alias
  if (!documentId) {
    console.warn("[mindee-webhook] no job.alias — cannot correlate")
    return new Response(JSON.stringify({ error: "missing job.alias (document_id)" }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  try {
    if (job?.status === "Failed") {
      const errMsg = `Mindee job failed: ${JSON.stringify(job.error ?? "unknown")}`
      await supabase.from("documents").update({ status: "failed", error_message: errMsg }).eq("id", documentId)
      await supabase.from("extraction_tasks")
        .update({ status: "failed", error_message: errMsg })
        .eq("document_id", documentId).eq("status", "pending")
      return new Response(JSON.stringify({ ok: true, document_id: documentId, failed: true }), { status: 200 })
    }

    const { data: doc, error: docErr } = await supabase
      .from("documents").select("id, doc_type")
      .eq("id", documentId).single()
    if (docErr || !doc) {
      console.warn(`[mindee-webhook] document ${documentId} not found`)
      // ack anyway so Mindee doesn't retry forever
      return new Response(JSON.stringify({ ok: true, ignored: "document not found" }), { status: 200 })
    }

    const docType = (doc.doc_type as KnownType) ?? "OTHER"
    const fields = (payload as { inference?: { result?: { fields?: Record<string, unknown> } } })
      ?.inference?.result?.fields ?? {}
    let extracted = normaliseForDocType(flattenMindeeFields(fields), docType)
    if (docType === "SA_ID_SMART_CARD" || docType === "SA_ID_GREEN_BOOK") {
      extracted = selfValidateID(extracted)
    }

    const result = await persistExtraction(supabase, documentId, extracted, docType, "mindee-webhook")

    return new Response(JSON.stringify({
      ok: true, document_id: documentId, ...result,
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (err) {
    console.error("[mindee-webhook] error:", err)
    try {
      await supabase.from("documents")
        .update({ status: "failed", error_message: String(err) }).eq("id", documentId)
    } catch {}
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
