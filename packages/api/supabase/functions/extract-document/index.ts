// extract-document v16 — Mindee webhook support.
//
// If MINDEE_WEBHOOK_IDS is set, we enqueue with webhook_ids + alias=document_id
// and return { status: "queued" } immediately. Mindee will POST the result to
// the mindee-webhook edge function when ready.
//
// If MINDEE_WEBHOOK_IDS is NOT set, we fall back to v15 polling behaviour
// (handles both shape A {job:{...}} and shape B {inference:{...}} on poll).
//
// OTP is still extracted via Claude inline (no Mindee preset for it).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.89.0"
import {
  flattenMindeeFields, normaliseForDocType, selfValidateID,
  persistExtraction, summariseBankTransactions,
  type ExtractedData, type KnownType,
} from "../_shared/extraction.ts"

const CLAUDE_MODEL = "claude-opus-4-5"
const CLASSIFY_MODEL = "claude-sonnet-4-5"
const MINDEE_BASE = "https://api-v2.mindee.net/v2"
const MINDEE_POLL_TOTAL_MS = 60_000
const MINDEE_POLL_INTERVAL_MS = 1_500
const MAX_BYTES = 32 * 1024 * 1024
const BUCKET = "documents"

const KNOWN_TYPES = [
  "OFFER_TO_PURCHASE", "SA_ID_SMART_CARD", "SA_ID_GREEN_BOOK",
  "PROOF_OF_ADDRESS", "BANK_STATEMENT", "PAYSLIP",
  "VEHICLE_NATIS", "VEHICLE_REGISTRATION", "SETTLEMENT_LETTER", "OTHER",
] as const

interface ExtractRequest { document_id: string }

const CLASSIFY_PROMPT = `Classify this South African vehicle finance document. Return ONLY JSON:\n{ "type": "<OFFER_TO_PURCHASE | SA_ID_SMART_CARD | SA_ID_GREEN_BOOK | PROOF_OF_ADDRESS | BANK_STATEMENT | PAYSLIP | VEHICLE_NATIS | VEHICLE_REGISTRATION | SETTLEMENT_LETTER | OTHER>", "confidence": 0.0 }`

const BS_PROMPT = `Read this South African bank statement (it may be MULTI-PAGE — read every page, not just page 1). Return ONLY JSON, no markdown.

CRITICAL: Sum ALL credits (money in) across ALL pages for total_credits. Sum ALL debits (money out) across ALL pages for total_debits. Do NOT trust any printed "total" line if you can compute it from line items — line totals are often wrong or missing on multi-page statements. Numeric strings without R or commas. Dates YYYY-MM-DD.

{
  "account_holder":      { "value": "full name string or null",  "confidence": 0.0 },
  "bank_name":           { "value": "e.g. FNB, Standard Bank or null", "confidence": 0.0 },
  "account_number":      { "value": "string or null",            "confidence": 0.0 },
  "account_type":        { "value": "Cheque/Savings/Business/Personal or null", "confidence": 0.0 },
  "branch_code":         { "value": "6-digit or null",            "confidence": 0.0 },
  "statement_period_start_date": { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "statement_period_end_date":   { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "beginning_balance":   { "value": "numeric string or null",     "confidence": 0.0 },
  "ending_balance":      { "value": "numeric string or null",     "confidence": 0.0 },
  "closing_balance":     { "value": "numeric string or null (same as ending_balance)", "confidence": 0.0 },
  "total_credits":       { "value": "SUM of all credit line items across all pages, numeric string or null", "confidence": 0.0 },
  "total_debits":        { "value": "SUM of all debit line items across all pages, numeric string or null", "confidence": 0.0 },
  "salary_credit":       { "value": "largest recurring salary-style credit, numeric string or null", "confidence": 0.0 },
  "page_count":          { "value": "integer page count you saw, as string", "confidence": 0.0 },
  "transaction_count":   { "value": "integer count of line items you summed, as string", "confidence": 0.0 }
}

Sanity-check before returning: ending_balance − beginning_balance should be approximately equal to total_credits − total_debits (within a few rand for fees). If it's off by more than 5%, you missed transactions on a later page — re-read the document and fix the totals.`

const OTP_PROMPT = `Read this South African vehicle Offer to Purchase / Sale Agreement and extract every field. Monetary values: numeric strings (no R, no commas). Dates: YYYY-MM-DD. Return ONLY JSON, no markdown:\n{\n  "buyer_full_name":     { "value": "string or null", "confidence": 0.0 },\n  "buyer_id_number":     { "value": "13-digit or null", "confidence": 0.0 },\n  "buyer_phone":         { "value": "string or null", "confidence": 0.0 },\n  "buyer_address":       { "value": "string or null", "confidence": 0.0 },\n  "buyer_email":         { "value": "string or null", "confidence": 0.0 },\n  "seller_full_name":    { "value": "string or null", "confidence": 0.0 },\n  "seller_id_number":    { "value": "13-digit or null", "confidence": 0.0 },\n  "seller_phone":        { "value": "string or null", "confidence": 0.0 },\n  "seller_address":      { "value": "string or null", "confidence": 0.0 },\n  "seller_bank_name":    { "value": "string or null", "confidence": 0.0 },\n  "seller_bank_account": { "value": "string or null", "confidence": 0.0 },\n  "vehicle_make":        { "value": "string or null", "confidence": 0.0 },\n  "vehicle_model":       { "value": "string or null", "confidence": 0.0 },\n  "vehicle_year":        { "value": "YYYY or null", "confidence": 0.0 },\n  "vehicle_vin":         { "value": "17-char VIN or null", "confidence": 0.0 },\n  "vehicle_registration":{ "value": "string or null", "confidence": 0.0 },\n  "vehicle_mileage":     { "value": "numeric km or null", "confidence": 0.0 },\n  "vehicle_colour":      { "value": "string or null", "confidence": 0.0 },\n  "agreed_price":        { "value": "numeric string or null", "confidence": 0.0 },\n  "deposit_amount":      { "value": "numeric string or null", "confidence": 0.0 },\n  "date_signed":         { "value": "YYYY-MM-DD or null", "confidence": 0.0 }\n}`

function stripFences(text: string): string { return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim() }
function encodeBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  return btoa(binary)
}

async function callClaudeVision(
  bytes: Uint8Array, mime: string, prompt: string, model = CLAUDE_MODEL,
): Promise<{ text: string; usage: Record<string, number> }> {
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })
  const base64 = encodeBase64(bytes)
  const isPdf = mime === "application/pdf"
  const sourceBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image",    source: { type: "base64", media_type: mime as "image/jpeg", data: base64 } }
  const resp = await anthropic.messages.create({
    model,
    // Higher budget for multi-page BS — Claude needs room to walk every page.
    max_tokens: 4096,
    messages: [{ role: "user", content: [ sourceBlock as never, { type: "text", text: prompt } ] }],
  })
  const tb = (resp.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text")
  if (!tb?.text) throw new Error("No text block in Claude response")
  return { text: tb.text, usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens } }
}

async function classifyWithClaude(bytes: Uint8Array, mime: string): Promise<{ type: KnownType; confidence: number }> {
  try {
    const { text } = await callClaudeVision(bytes, mime, CLASSIFY_PROMPT, CLASSIFY_MODEL)
    const parsed = JSON.parse(stripFences(text)) as { type?: string; confidence?: number }
    const t = (parsed.type ?? "OTHER") as KnownType
    if (!KNOWN_TYPES.includes(t as typeof KNOWN_TYPES[number])) return { type: "OTHER", confidence: parsed.confidence ?? 0.3 }
    return { type: t, confidence: parsed.confidence ?? 0.7 }
  } catch { return { type: "OTHER", confidence: 0 } }
}

interface MindeeEnqueueResult {
  job_id: string
  inline_payload: Record<string, unknown> | null  // null = async, will arrive via webhook
}

async function enqueueMindee(
  bytes: Uint8Array, filename: string, mime: string, modelId: string,
  alias: string, webhookIds: string[],
): Promise<MindeeEnqueueResult> {
  const apiKey = Deno.env.get("MINDEE_API_KEY")
  if (!apiKey) throw new Error("MINDEE_API_KEY not set")

  const form = new FormData()
  form.append("model_id", modelId)
  form.append("alias", alias)
  for (const id of webhookIds) form.append("webhook_ids", id)
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename)

  const enqRes = await fetch(`${MINDEE_BASE}/products/extraction/enqueue`, {
    method: "POST", headers: { "Authorization": apiKey }, body: form,
  })
  if (!enqRes.ok) {
    const txt = (await enqRes.text()).slice(0, 500)
    // Friendlier error for password-protected PDFs — banks ship these by default
    if (/PDFium.*[Pp]assword|encrypted|password.protected/i.test(txt)) {
      throw new Error("PDF_PASSWORD_PROTECTED: bank statement PDF is password-protected. Please open it, save an unlocked copy, and resend — or send a screenshot of the relevant pages instead.")
    }
    throw new Error(`Mindee enqueue ${enqRes.status}: ${txt}`)
  }
  const enqJson = await enqRes.json() as { job?: { id: string; polling_url: string } }
  const jobId = enqJson.job?.id
  const pollUrl = enqJson.job?.polling_url
  if (!jobId || !pollUrl) throw new Error("Mindee enqueue: no job_id/polling_url")

  // If webhooks are configured, return immediately — Mindee will POST result.
  if (webhookIds.length > 0) return { job_id: jobId, inline_payload: null }

  // No webhook configured — fall back to polling (legacy v15 path).
  const startedAt = Date.now()
  let lastStatus = "unknown"
  while (Date.now() - startedAt < MINDEE_POLL_TOTAL_MS) {
    await new Promise((r) => setTimeout(r, MINDEE_POLL_INTERVAL_MS))
    const pollRes = await fetch(pollUrl, { headers: { "Authorization": apiKey } })
    if (pollRes.status === 404) {
      const resRes = await fetch(`${MINDEE_BASE}/products/extraction/results/${jobId}`, {
        headers: { "Authorization": apiKey },
      })
      if (resRes.ok) return { job_id: jobId, inline_payload: await resRes.json() }
      throw new Error(`Mindee result not retrievable (job purged after ${Date.now()-startedAt}ms, last: ${lastStatus})`)
    }
    if (!pollRes.ok) continue
    const pollJson = await pollRes.json() as Record<string, unknown>
    const job = pollJson.job as { status?: string; result_url?: string | null; error?: unknown } | undefined
    if (job) {
      lastStatus = job.status ?? lastStatus
      if (job.status === "Failed") throw new Error(`Mindee job failed: ${JSON.stringify(job.error)}`)
      if (job.status === "Processed" && job.result_url) {
        const resRes = await fetch(job.result_url, { headers: { "Authorization": apiKey } })
        if (!resRes.ok) throw new Error(`Mindee result fetch ${resRes.status}`)
        return { job_id: jobId, inline_payload: await resRes.json() }
      }
    }
    if ("inference" in pollJson && pollJson.inference) {
      return { job_id: jobId, inline_payload: pollJson }
    }
  }
  throw new Error(`Mindee polling timed out after ${MINDEE_POLL_TOTAL_MS}ms (last: ${lastStatus})`)
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })
  let body: ExtractRequest
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }) }
  if (!body.document_id) return new Response(JSON.stringify({ error: "document_id required" }), { status: 400 })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const webhookIds = (Deno.env.get("MINDEE_WEBHOOK_IDS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)

  try {
    const { data: doc, error: docErr } = await supabase
      .from("documents").select("id, deal_id, doc_type, storage_path, mime_type, file_name")
      .eq("id", body.document_id).single()
    if (docErr || !doc) return new Response(JSON.stringify({ error: `Document not found: ${docErr?.message}` }), { status: 404 })
    await supabase.from("documents").update({ status: "processing" }).eq("id", body.document_id)

    let objectPath = doc.storage_path ?? ""
    const publicPrefix = `/storage/v1/object/public/${BUCKET}/`
    const idx = objectPath.indexOf(publicPrefix)
    if (idx !== -1) objectPath = objectPath.slice(idx + publicPrefix.length)
    if (objectPath.startsWith(`${BUCKET}/`)) objectPath = objectPath.slice(BUCKET.length + 1)
    if (!objectPath) throw new Error("documents.storage_path is empty")

    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(objectPath)
    if (dlErr || !blob) throw new Error(`storage download failed: ${dlErr?.message}`)

    const arrayBuf = await blob.arrayBuffer()
    if (arrayBuf.byteLength > MAX_BYTES) {
      await supabase.from("documents").update({ status: "failed", error_message: "file > 32 MB" }).eq("id", body.document_id)
      return new Response(JSON.stringify({ error: "file too large" }), { status: 413 })
    }
    const inputMime = doc.mime_type ?? blob.type ?? "application/octet-stream"
    const filename = doc.file_name ?? `document-${body.document_id}.${inputMime.split("/")[1] ?? "bin"}`
    const bytes = new Uint8Array(arrayBuf)

    const classified = await classifyWithClaude(bytes, inputMime)
    const effectiveType = classified.confidence >= 0.7 ? classified.type : (doc.doc_type as KnownType ?? classified.type)
    if (effectiveType !== doc.doc_type) {
      await supabase.from("documents")
        .update({ doc_type: effectiveType, classification_confidence: classified.confidence })
        .eq("id", body.document_id)
    }

    // OTP path — Claude inline (no Mindee model for sale agreements).
    if (effectiveType === "OFFER_TO_PURCHASE") {
      const r = await callClaudeVision(bytes, inputMime, OTP_PROMPT)
      let extracted: ExtractedData
      try { extracted = JSON.parse(stripFences(r.text)) }
      catch { throw new Error(`Claude returned non-JSON: ${r.text.slice(0, 200)}`) }
      const persisted = await persistExtraction(supabase, body.document_id, extracted, effectiveType, "claude")
      return new Response(JSON.stringify({
        success: true, document_id: body.document_id, status: "extracted",
        detected_type: effectiveType, classification_confidence: classified.confidence,
        average_confidence: persisted.avg_confidence, field_count: persisted.field_count,
        policy_flags: persisted.policy_flags, classify_model: CLASSIFY_MODEL,
        engine: "claude", usage: r.usage,
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    }

    // Suppress unused warning for BS_PROMPT now that BS goes back through Mindee
    void BS_PROMPT

    // Mindee path — webhook (async) or polling (sync). Used for ID, POA, BS.
    const modelMap: Partial<Record<KnownType, string | undefined>> = {
      SA_ID_SMART_CARD:  Deno.env.get("MINDEE_MODEL_ID_DOC"),
      SA_ID_GREEN_BOOK:  Deno.env.get("MINDEE_MODEL_ID_DOC"),
      PROOF_OF_ADDRESS:  Deno.env.get("MINDEE_MODEL_POA"),
      BANK_STATEMENT:    Deno.env.get("MINDEE_MODEL_BS"),
    }
    const modelId = modelMap[effectiveType]
    if (!modelId) {
      // No Mindee model — fall through to Claude with the OTP prompt as a generic catch
      const r = await callClaudeVision(bytes, inputMime, OTP_PROMPT)
      let extracted: ExtractedData
      try { extracted = JSON.parse(stripFences(r.text)) }
      catch { throw new Error(`Fallback Claude returned non-JSON: ${r.text.slice(0, 200)}`) }
      const persisted = await persistExtraction(supabase, body.document_id, extracted, effectiveType, "claude-fallback")
      return new Response(JSON.stringify({
        success: true, document_id: body.document_id, status: "extracted",
        detected_type: effectiveType, classification_confidence: classified.confidence,
        average_confidence: persisted.avg_confidence, field_count: persisted.field_count,
        policy_flags: persisted.policy_flags, engine: "claude-fallback-no-mindee-model",
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    }

    const enq = await enqueueMindee(bytes, filename, inputMime, modelId, body.document_id, webhookIds)

    // Async path — webhook will populate results later
    if (enq.inline_payload === null) {
      return new Response(JSON.stringify({
        success: true, document_id: body.document_id, status: "queued",
        detected_type: effectiveType, classification_confidence: classified.confidence,
        mindee_job_id: enq.job_id, engine: "mindee-async",
      }), { status: 202, headers: { "Content-Type": "application/json" } })
    }

    // Sync path — process inline payload now
    const fields = (enq.inline_payload as { inference?: { result?: { fields?: Record<string, unknown> } } })
      ?.inference?.result?.fields ?? {}
    let extracted = normaliseForDocType(flattenMindeeFields(fields), effectiveType)
    if (effectiveType === "SA_ID_SMART_CARD" || effectiveType === "SA_ID_GREEN_BOOK") {
      extracted = selfValidateID(extracted)
    }

    // BANK_STATEMENT: Mindee's total_credits/total_debits summary fields are
    // unreliable on multi-page statements. Sum the per-line list_of_transactions
    // ourselves and override. Also stash the recomputed totals + line-item
    // summary on the document row so the affordability UI can render the
    // breakdown without re-fetching the raw payload.
    let bsLineSummary: ReturnType<typeof summariseBankTransactions> = null
    if (effectiveType === "BANK_STATEMENT") {
      bsLineSummary = summariseBankTransactions(fields)
      if (bsLineSummary) {
        extracted.total_credits = { value: String(bsLineSummary.total_credits), confidence: 0.95 }
        extracted.total_debits  = { value: String(bsLineSummary.total_debits),  confidence: 0.95 }
        if (bsLineSummary.largest_credit != null) {
          extracted.salary_credit = extracted.salary_credit ?? {
            value: String(bsLineSummary.largest_credit), confidence: 0.7,
          }
        }
        extracted.transaction_count = { value: String(bsLineSummary.count), confidence: 0.99 }
        extracted.fee_total = { value: String(bsLineSummary.fee_total), confidence: 0.95 }
        extracted.fee_count = { value: String(bsLineSummary.fee_count), confidence: 0.99 }
        // Encoded as JSON strings so the UI can render breakdowns without
        // re-fetching the raw payload.
        extracted.top_credit_sources     = { value: JSON.stringify(bsLineSummary.top_credit_sources),     confidence: 0.9 }
        extracted.top_expense_categories = { value: JSON.stringify(bsLineSummary.top_expense_categories), confidence: 0.9 }
        extracted.recurring_credits      = { value: JSON.stringify(bsLineSummary.recurring_credits),      confidence: 0.9 }
      }
    }

    const persisted = await persistExtraction(supabase, body.document_id, extracted, effectiveType, "mindee")

    // Persist the raw transactions blob for the affordability UI (BS only).
    if (effectiveType === "BANK_STATEMENT" && fields.list_of_transactions) {
      try {
        await supabase.from("documents").update({
          line_items: fields.list_of_transactions,
        }).eq("id", body.document_id)
      } catch (e) {
        // Column may not exist yet — non-fatal, log and continue.
        console.warn("[extract-document] could not persist line_items:", e)
      }
    }

    return new Response(JSON.stringify({
      success: true, document_id: body.document_id, status: "extracted",
      detected_type: effectiveType, classification_confidence: classified.confidence,
      average_confidence: persisted.avg_confidence, field_count: persisted.field_count,
      policy_flags: persisted.policy_flags, classify_model: CLASSIFY_MODEL, engine: "mindee",
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (err) {
    console.error("[extract-document] error:", err)
    try { await supabase.from("documents").update({ status: "failed", error_message: String(err) }).eq("id", body.document_id) } catch {}
    try { await supabase.from("extraction_tasks").update({ status: "failed", error_message: String(err) }).eq("document_id", body.document_id).eq("status", "pending") } catch {}
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
