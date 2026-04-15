import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"
import { createMessage, type ContentBlockImage, type Message } from "../_shared/anthropic.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessDocumentRequest {
  document_id: string
  deal_id: string
  file_url: string
  doc_type: string
}

interface ExtractionField {
  value: string | null
  confidence: number
}

interface IDExtractionResult {
  full_name: ExtractionField
  id_number: ExtractionField
  date_of_birth: ExtractionField
  gender: ExtractionField
  nationality: ExtractionField
}

interface AddressExtractionResult {
  address: ExtractionField
  document_date: ExtractionField
  account_holder_name: ExtractionField
}

interface BankStatementExtractionResult {
  account_holder: ExtractionField
  bank_name: ExtractionField
  account_number: ExtractionField
  statement_period: ExtractionField
  income_credits: ExtractionField
  total_debits: ExtractionField
  closing_balance: ExtractionField
}

interface NatisExtractionResult {
  registration_number: ExtractionField
  vin: ExtractionField
  engine_number: ExtractionField
  make: ExtractionField
  model: ExtractionField
  year: ExtractionField
  colour: ExtractionField
  owner_name: ExtractionField
}

type ExtractionResult =
  | IDExtractionResult
  | AddressExtractionResult
  | BankStatementExtractionResult
  | NatisExtractionResult

// ---------------------------------------------------------------------------
// Extraction prompts by document type
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPTS: Record<string, string> = {
  ID_DOCUMENT: `Extract the following fields from this South African ID document image.
For each field, provide a value and a confidence score between 0.0 and 1.0.
Return ONLY valid JSON matching this schema:
{
  "full_name": { "value": "string or null", "confidence": 0.0 },
  "id_number": { "value": "string or null", "confidence": 0.0 },
  "date_of_birth": { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "gender": { "value": "M or F or null", "confidence": 0.0 },
  "nationality": { "value": "string or null", "confidence": 0.0 }
}`,

  PROOF_OF_ADDRESS: `Extract the following fields from this proof of address document.
For each field, provide a value and a confidence score between 0.0 and 1.0.
Return ONLY valid JSON matching this schema:
{
  "address": { "value": "full address string or null", "confidence": 0.0 },
  "document_date": { "value": "YYYY-MM-DD or null", "confidence": 0.0 },
  "account_holder_name": { "value": "string or null", "confidence": 0.0 }
}`,

  BANK_STATEMENT: `Extract the following financial fields from this bank statement.
For each field, provide a value and a confidence score between 0.0 and 1.0.
Monetary values should be numeric strings (e.g. "15230.50"), not formatted.
Return ONLY valid JSON matching this schema:
{
  "account_holder": { "value": "string or null", "confidence": 0.0 },
  "bank_name": { "value": "string or null", "confidence": 0.0 },
  "account_number": { "value": "string or null", "confidence": 0.0 },
  "statement_period": { "value": "e.g. 2024-01-01 to 2024-01-31 or null", "confidence": 0.0 },
  "income_credits": { "value": "total credits as string or null", "confidence": 0.0 },
  "total_debits": { "value": "total debits as string or null", "confidence": 0.0 },
  "closing_balance": { "value": "closing balance as string or null", "confidence": 0.0 }
}`,

  NATIS: `Extract the following vehicle registration fields from this NATIS document.
For each field, provide a value and a confidence score between 0.0 and 1.0.
Return ONLY valid JSON matching this schema:
{
  "registration_number": { "value": "string or null", "confidence": 0.0 },
  "vin": { "value": "string or null", "confidence": 0.0 },
  "engine_number": { "value": "string or null", "confidence": 0.0 },
  "make": { "value": "string or null", "confidence": 0.0 },
  "model": { "value": "string or null", "confidence": 0.0 },
  "year": { "value": "YYYY or null", "confidence": 0.0 },
  "colour": { "value": "string or null", "confidence": 0.0 },
  "owner_name": { "value": "string or null", "confidence": 0.0 }
}`,
}

// ---------------------------------------------------------------------------
// Cross-document validation
// ---------------------------------------------------------------------------

interface VerificationCheck {
  deal_id: string
  check_type: string
  field_name: string
  doc1_value: string
  doc2_value: string
  match: boolean
  confidence: number
}

async function runCrossDocumentValidation(
  supabase: ReturnType<typeof getSupabaseClient>,
  dealId: string,
  newDocType: string,
  newExtraction: ExtractionResult
): Promise<void> {
  const { data: existingResults } = await supabase
    .from("extraction_results")
    .select("*, documents!inner(doc_type)")
    .eq("deal_id", dealId)

  if (!existingResults || existingResults.length === 0) return

  const checks: VerificationCheck[] = []

  for (const existing of existingResults) {
    const existingDocType = existing.documents?.doc_type
    const existingData = existing.extracted_data as Record<string, ExtractionField>
    const newData = newExtraction as Record<string, ExtractionField>

    // ID vs Bank Statement: name match
    if (
      (newDocType === "ID_DOCUMENT" && existingDocType === "BANK_STATEMENT") ||
      (newDocType === "BANK_STATEMENT" && existingDocType === "ID_DOCUMENT")
    ) {
      const idData = newDocType === "ID_DOCUMENT" ? newData : existingData
      const bankData = newDocType === "BANK_STATEMENT" ? newData : existingData

      const idName = (idData.full_name?.value ?? "").toLowerCase().trim()
      const bankName = (bankData.account_holder?.value ?? "").toLowerCase().trim()

      if (idName && bankName) {
        checks.push({
          deal_id: dealId,
          check_type: "NAME_MATCH",
          field_name: "full_name vs account_holder",
          doc1_value: idName,
          doc2_value: bankName,
          match: idName === bankName || idName.includes(bankName) || bankName.includes(idName),
          confidence: idData.full_name?.confidence ?? 0,
        })
      }
    }

    // ID vs Proof of Address: name match
    if (
      (newDocType === "ID_DOCUMENT" && existingDocType === "PROOF_OF_ADDRESS") ||
      (newDocType === "PROOF_OF_ADDRESS" && existingDocType === "ID_DOCUMENT")
    ) {
      const idData = newDocType === "ID_DOCUMENT" ? newData : existingData
      const poaData = newDocType === "PROOF_OF_ADDRESS" ? newData : existingData

      const idName = (idData.full_name?.value ?? "").toLowerCase().trim()
      const poaName = (poaData.account_holder_name?.value ?? "").toLowerCase().trim()

      if (idName && poaName) {
        checks.push({
          deal_id: dealId,
          check_type: "NAME_MATCH",
          field_name: "full_name vs account_holder_name",
          doc1_value: idName,
          doc2_value: poaName,
          match: idName === poaName || idName.includes(poaName) || poaName.includes(idName),
          confidence: idData.full_name?.confidence ?? 0,
        })
      }
    }
  }

  if (checks.length > 0) {
    await supabase.from("verification_checks").insert(checks)
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  let body: ProcessDocumentRequest
  try {
    body = await req.json()
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 })
  }

  const { document_id, deal_id, file_url, doc_type } = body

  if (!document_id || !deal_id || !file_url) {
    return new Response("Bad Request: missing required fields", { status: 400 })
  }

  const supabase = getSupabaseClient()

  try {
    // Update document status to PROCESSING
    await supabase
      .from("documents")
      .update({ status: "PROCESSING" })
      .eq("id", document_id)

    // Download file from Supabase Storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from("deal-documents")
      .download(file_url)

    if (dlError || !fileData) {
      throw new Error(`Failed to download document: ${dlError?.message}`)
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    const mimeType = fileData.type || "application/octet-stream"

    // Determine extraction prompt
    const normalizedDocType = doc_type?.toUpperCase() as keyof typeof EXTRACTION_PROMPTS
    const prompt = EXTRACTION_PROMPTS[normalizedDocType] ?? EXTRACTION_PROMPTS.ID_DOCUMENT

    // Call Anthropic vision API
    const imageBlock: ContentBlockImage = {
      type: "image",
      source: { type: "base64", media_type: mimeType, data: base64 },
    }

    const messages: Message[] = [
      {
        role: "user",
        content: [imageBlock, { type: "text", text: prompt }],
      },
    ]

    const aiResponse = await createMessage({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages,
    })

    // Parse JSON from response
    let extractedData: ExtractionResult
    const rawText = aiResponse.content.find((b) => b.type === "text")
    if (!rawText || rawText.type !== "text") {
      throw new Error("No text response from Anthropic")
    }

    // Strip markdown code fences if present
    const jsonStr = rawText.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()
    extractedData = JSON.parse(jsonStr)

    // Calculate overall confidence
    const fields = Object.values(extractedData) as ExtractionField[]
    const avgConfidence = fields.reduce((s, f) => s + (f.confidence ?? 0), 0) / fields.length
    const lowConfidenceFields = fields.filter((f) => (f.confidence ?? 1) < 0.6)

    // Store extraction result
    const { error: insertError } = await supabase.from("extraction_results").insert({
      document_id,
      deal_id,
      doc_type: normalizedDocType,
      extracted_data: extractedData,
      confidence_score: avgConfidence,
      model_used: "claude-sonnet-4-20250514",
    })

    if (insertError) throw new Error(`Failed to store extraction: ${insertError.message}`)

    // Update document status
    await supabase
      .from("documents")
      .update({ status: "PROCESSED" })
      .eq("id", document_id)

    // Cross-document validation
    await runCrossDocumentValidation(supabase, deal_id, normalizedDocType, extractedData)

    // Create review task if low confidence fields
    if (lowConfidenceFields.length > 0) {
      // Determine party type from deal context
      const { data: doc } = await supabase
        .from("documents")
        .select("uploaded_by")
        .eq("id", document_id)
        .single()

      const queue =
        doc?.uploaded_by === "seller" ? "Q_SELLER_DOC_REVIEW" : "Q_BUYER_DOC_REVIEW"

      await supabase.from("tasks").insert({
        queue_name: queue,
        deal_id,
        title: `Low confidence extraction: ${normalizedDocType}`,
        description: `${lowConfidenceFields.length} fields with confidence < 0.60 on document ${document_id}`,
        priority: "NORMAL",
        status: "OPEN",
        metadata: { document_id, low_confidence_count: lowConfidenceFields.length },
      })
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      deal_id,
      event_type: "DOCUMENT_EXTRACTED",
      actor: "system:process-document",
      metadata: {
        document_id,
        doc_type: normalizedDocType,
        confidence: avgConfidence,
        low_confidence_fields: lowConfidenceFields.length,
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        confidence: avgConfidence,
        low_confidence_fields: lowConfidenceFields.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("process-document error:", err)

    // Mark document as failed
    await supabase
      .from("documents")
      .update({ status: "FAILED", error_message: String(err) })
      .eq("id", document_id)
      .catch(() => {})

    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
