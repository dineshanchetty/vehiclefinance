/**
 * extract-document — Supabase Edge Function
 *
 * Accepts a document_id, fetches the file from Supabase Storage, calls Claude
 * claude-sonnet-4-5 vision for field extraction, applies confidence-based policy,
 * and persists results.
 *
 * POST body:
 *   { document_id: string }
 *
 * Size guard: rejects files > 20 MB or PDFs with > 20 pages (approximated by
 * checking content-length before download and a page-count heuristic).
 *
 * Confidence policy:
 *   - Any field confidence < 0.60  → flag document (low_confidence_fields list)
 *   - Overall average < 0.80       → create Q_MISMATCH_REVIEW ops task
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"
import { createMessage, type ContentBlockImage, type ContentBlockText, type Message } from "../_shared/anthropic.ts"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-4-5"
const MAX_BYTES = 20 * 1024 * 1024        // 20 MB
const MAX_PAGES = 20                       // PDF page guard
const LOW_FIELD_THRESHOLD = 0.60
const OVERALL_LOW_THRESHOLD = 0.80

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractRequest {
  document_id: string
}

interface ExtractionField {
  value: string | null
  confidence: number
}

type ExtractedData = Record<string, ExtractionField>

// ---------------------------------------------------------------------------
// Prompt library (inline; keep prompts small for edge latency)
// ---------------------------------------------------------------------------

const PROMPTS: Record<string, string> = {
  // SA ID smart card
  id_document: `You are an expert document reader for South African identity documents.
This is a South African ID document (smart card or green ID book).
Extract the following fields. For each field return a value and a confidence score (0.0–1.0).
Return ONLY valid JSON with no markdown fences.

{
  "full_name":        { "value": "string or null", "confidence": 0.0 },
  "id_number":        { "value": "13-digit string or null", "confidence": 0.0 },
  "date_of_birth":    { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "gender":           { "value": "M or F or null", "confidence": 0.0 },
  "nationality":      { "value": "string or null", "confidence": 0.0 },
  "country_of_birth": { "value": "string or null", "confidence": 0.0 }
}

Guidance: id_number must be exactly 13 digits. Derive date_of_birth from first 6 digits if not printed (YY≤26→20xx else 19xx).`,

  // Proof of address
  proof_of_address: `You are an expert document reader for South African utility bills and bank letters.
Extract the following fields. For each field return a value and a confidence score (0.0–1.0).
Return ONLY valid JSON with no markdown fences.

{
  "account_holder_name": { "value": "string or null", "confidence": 0.0 },
  "address_line_1":      { "value": "string or null", "confidence": 0.0 },
  "address_line_2":      { "value": "string or null", "confidence": 0.0 },
  "suburb":              { "value": "string or null", "confidence": 0.0 },
  "city":                { "value": "string or null", "confidence": 0.0 },
  "postal_code":         { "value": "4-digit code or null", "confidence": 0.0 },
  "province":            { "value": "string or null", "confidence": 0.0 },
  "document_date":       { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "issuer_name":         { "value": "e.g. Eskom or null", "confidence": 0.0 }
}`,

  // Bank statement
  bank_statement: `You are an expert document reader for South African bank statements.
Extract the following fields. Monetary values must be numeric strings (e.g. "32500.00") without currency symbols.
Return ONLY valid JSON with no markdown fences.

{
  "account_holder":  { "value": "string or null", "confidence": 0.0 },
  "bank_name":       { "value": "string or null", "confidence": 0.0 },
  "account_number":  { "value": "string or null", "confidence": 0.0 },
  "account_type":    { "value": "string or null", "confidence": 0.0 },
  "statement_from":  { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "statement_to":    { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "opening_balance": { "value": "numeric string or null", "confidence": 0.0 },
  "closing_balance": { "value": "numeric string or null", "confidence": 0.0 },
  "total_credits":   { "value": "numeric string or null", "confidence": 0.0 },
  "total_debits":    { "value": "numeric string or null", "confidence": 0.0 },
  "salary_credit":   { "value": "largest salary credit as numeric string or null", "confidence": 0.0 }
}`,

  // NATIS / vehicle registration
  natis: `You are an expert document reader for South African vehicle registration documents (NATIS).
Extract the following fields. Return ONLY valid JSON with no markdown fences.

{
  "registration_number": { "value": "string or null", "confidence": 0.0 },
  "vin":                 { "value": "17-char VIN or null", "confidence": 0.0 },
  "engine_number":       { "value": "string or null", "confidence": 0.0 },
  "make":                { "value": "string or null", "confidence": 0.0 },
  "model":               { "value": "string or null", "confidence": 0.0 },
  "year":                { "value": "YYYY or null", "confidence": 0.0 },
  "colour":              { "value": "string or null", "confidence": 0.0 },
  "owner_name":          { "value": "string or null", "confidence": 0.0 }
}`,
}

// Fallback for unknown doc types
const FALLBACK_PROMPT = `Extract all identifiable text fields from this document image.
For each field return a value and confidence score.
Return ONLY valid JSON: { "<field_name>": { "value": "string or null", "confidence": 0.0 } }`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function selectPrompt(docType: string): string {
  const key = docType.toLowerCase().replace(/[^a-z_]/g, "_")
  return PROMPTS[key] ?? FALLBACK_PROMPT
}

function calcConfidenceStats(data: ExtractedData): {
  average: number
  lowFields: string[]
  flagged: boolean
} {
  const entries = Object.entries(data)
  if (entries.length === 0) return { average: 0, lowFields: [], flagged: true }

  const sum = entries.reduce((acc, [, f]) => acc + (f.confidence ?? 0), 0)
  const average = sum / entries.length
  const lowFields = entries
    .filter(([, f]) => (f.confidence ?? 1) < LOW_FIELD_THRESHOLD)
    .map(([k]) => k)

  return { average, lowFields, flagged: lowFields.length > 0 }
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim()
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let body: ExtractRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { document_id } = body

  if (!document_id) {
    return new Response(JSON.stringify({ error: "document_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const supabase = getSupabaseClient()

  try {
    // ── 1. Fetch document record ───────────────────────────────────────────
    const { data: docRow, error: docErr } = await supabase
      .from("documents")
      .select("id, deal_id, document_type, storage_path, mime_type, status, party_type")
      .eq("id", document_id)
      .single()

    if (docErr || !docRow) {
      return new Response(
        JSON.stringify({ error: `Document not found: ${docErr?.message}` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    // ── 2. Mark as processing ──────────────────────────────────────────────
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", document_id)

    // ── 3. Download from storage ───────────────────────────────────────────
    const storagePath: string = docRow.storage_path ?? ""
    if (!storagePath) {
      throw new Error("Document has no storage_path; cannot extract.")
    }

    // Strip bucket prefix if present — storage_path may be either
    // "bucket/path/to/file.jpg"  or  just  "path/to/file.jpg"
    const BUCKET = "deal-documents"
    const objectPath = storagePath.startsWith(BUCKET + "/")
      ? storagePath.slice(BUCKET.length + 1)
      : storagePath

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(objectPath)

    if (dlErr || !fileBlob) {
      throw new Error(`Storage download failed: ${dlErr?.message}`)
    }

    // ── 4. Size guard ──────────────────────────────────────────────────────
    const arrayBuf = await fileBlob.arrayBuffer()

    if (arrayBuf.byteLength > MAX_BYTES) {
      await supabase
        .from("documents")
        .update({ status: "failed", error_message: "File exceeds 20 MB limit" })
        .eq("id", document_id)

      return new Response(
        JSON.stringify({ error: "File too large (> 20 MB)", document_id }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      )
    }

    const mimeType: string = docRow.mime_type ?? fileBlob.type ?? "application/octet-stream"

    // PDF page guard — approximate: count "%Page" occurrences in first 50 kB
    if (mimeType === "application/pdf") {
      const sample = new TextDecoder("latin1").decode(arrayBuf.slice(0, 51200))
      const pageCount = (sample.match(/%Page\b/gi) ?? []).length
      if (pageCount > MAX_PAGES) {
        await supabase
          .from("documents")
          .update({ status: "failed", error_message: `PDF exceeds ${MAX_PAGES} page limit` })
          .eq("id", document_id)

        return new Response(
          JSON.stringify({ error: `PDF has more than ${MAX_PAGES} pages`, document_id }),
          { status: 413, headers: { "Content-Type": "application/json" } }
        )
      }
    }

    // ── 5. Build vision request ────────────────────────────────────────────
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)))

    // For PDFs, Claude cannot directly vision-process; convert prompt type
    const effectiveMime = mimeType.startsWith("image/")
      ? mimeType
      : "image/jpeg" // best-effort; edge function cannot transcode PDFs

    const imageBlock: ContentBlockImage = {
      type: "image",
      source: { type: "base64", media_type: effectiveMime as "image/jpeg", data: base64 },
    }

    const prompt = selectPrompt(docRow.document_type ?? "")

    const messages: Message[] = [
      {
        role: "user",
        content: [imageBlock, { type: "text", text: prompt }],
      },
    ]

    // ── 6. Call Claude ─────────────────────────────────────────────────────
    const aiResponse = await createMessage({
      model: MODEL,
      max_tokens: 1024,
      messages,
    })

    // Narrow to a text block so TS knows `.text` is a string (ContentBlock is a
    // union of ContentBlockImage | ContentBlockText).
    const rawBlock = aiResponse.content.find(
      (b): b is ContentBlockText => b.type === "text",
    )
    if (!rawBlock) {
      throw new Error("No text block in Claude response")
    }

    // ── 7. Parse JSON ──────────────────────────────────────────────────────
    let extractedData: ExtractedData
    try {
      extractedData = JSON.parse(stripFences(rawBlock.text))
    } catch {
      throw new Error(`Claude returned non-JSON: ${rawBlock.text.slice(0, 200)}`)
    }

    // ── 8. Confidence policy ───────────────────────────────────────────────
    const { average, lowFields, flagged } = calcConfidenceStats(extractedData)

    // ── 9. Persist extraction result ───────────────────────────────────────
    const { error: insertErr } = await supabase.from("extraction_results").insert({
      document_id,
      deal_id: docRow.deal_id,
      doc_type: docRow.document_type,
      extracted_data: extractedData,
      confidence_score: average,
      model_used: MODEL,
      low_confidence_fields: lowFields,
      flagged,
    })

    if (insertErr) {
      throw new Error(`Failed to insert extraction_results: ${insertErr.message}`)
    }

    // ── 10. Update document status ─────────────────────────────────────────
    await supabase
      .from("documents")
      .update({
        status: "extracted",
        extracted_data: extractedData,
        confidence_scores: Object.fromEntries(
          Object.entries(extractedData).map(([k, f]) => [k, f.confidence])
        ),
        extracted_at: new Date().toISOString(),
      })
      .eq("id", document_id)

    // Also mark the extraction_tasks row as done
    await supabase
      .from("extraction_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("document_id", document_id)
      .eq("status", "pending")

    // ── 11. Low-confidence task ────────────────────────────────────────────
    if (average < OVERALL_LOW_THRESHOLD) {
      await supabase.from("tasks").insert({
        queue_name: "Q_MISMATCH_REVIEW",
        deal_id: docRow.deal_id,
        title: `Low-confidence extraction: ${docRow.document_type} (${Math.round(average * 100)}%)`,
        description:
          `Overall confidence ${Math.round(average * 100)}% < 80% threshold. ` +
          `Low-confidence fields: ${lowFields.join(", ") || "none individually, but overall low"}.`,
        priority: "NORMAL",
        status: "OPEN",
        metadata: {
          document_id,
          avg_confidence: average,
          low_confidence_fields: lowFields,
        },
      })
    }

    // ── 12. Audit log ──────────────────────────────────────────────────────
    await supabase.from("audit_logs").insert({
      deal_id: docRow.deal_id,
      event_type: "DOCUMENT_EXTRACTED",
      actor: "system:extract-document",
      metadata: {
        document_id,
        doc_type: docRow.document_type,
        avg_confidence: average,
        low_confidence_fields: lowFields,
        model: MODEL,
        input_tokens: aiResponse.usage.input_tokens,
        output_tokens: aiResponse.usage.output_tokens,
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        avg_confidence: average,
        flagged,
        low_confidence_fields: lowFields,
        input_tokens: aiResponse.usage.input_tokens,
        output_tokens: aiResponse.usage.output_tokens,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[extract-document] error:", err)

    // Attempt to mark document as failed (best-effort — we're already in an
    // error path; don't let a second DB failure mask the original).
    try {
      await supabase
        .from("documents")
        .update({ status: "failed", error_message: String(err) })
        .eq("id", document_id)
    } catch {
      // swallow
    }

    // Also update extraction task (best-effort)
    try {
      await supabase
        .from("extraction_tasks")
        .update({ status: "failed", error_message: String(err) })
        .eq("document_id", document_id)
        .eq("status", "pending")
    } catch {
      // swallow
    }

    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
