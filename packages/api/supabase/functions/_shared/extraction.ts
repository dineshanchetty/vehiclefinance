// Shared extraction helpers used by extract-document (sync polling path) and
// mindee-webhook (async callback path). Pure functions + a single persistResult
// that writes the same DB rows regardless of how the inference arrived.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Cloudflare Workers AI vision helper ────────────────────────────────────
// Two-tier vision strategy for OTP extraction + photo angle classification:
// Cloudflare first (cheap), Claude as fallback (accurate). Mindee continues
// to own ID / POA / BS — untouched.
//
// Env required:
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_API_TOKEN
//
// API shape (verified against Cloudflare Workers AI docs for
// @cf/meta/llama-3.2-11b-vision-instruct):
//   POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}
//   Authorization: Bearer <token>
//   Body: { prompt: string, image: number[] }   // image = Array.from(Uint8Array)
//   Response: { result: { response: string }, success: boolean, errors: [...] }
//
// PDF input is NOT supported by the vision models — caller must rasterise
// (or send the underlying image directly). For OTP this means PDF-only OTPs
// will hit Claude; image-based OTPs hit Cloudflare.
//
// Throws on any non-2xx OR if env is missing — caller handles fallback.
const CF_MODEL_PRIMARY = "@cf/meta/llama-3.2-11b-vision-instruct"

export async function callCloudflareVision(
  bytes: Uint8Array,
  mime: string,
  prompt: string,
  model: string = CF_MODEL_PRIMARY,
): Promise<{ text: string; engine: string }> {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN")
  if (!accountId || !token) {
    throw new Error("Cloudflare env missing (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN)")
  }
  if (mime === "application/pdf") {
    // Workers AI vision models do not accept PDFs. Force fallback.
    throw new Error("Cloudflare vision: PDF input not supported")
  }

  // Workers AI Llama-3.2-Vision expects the image as an array of byte values
  // (NOT base64). See https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/
  const imageArray: number[] = Array.from(bytes)

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, image: imageArray, max_tokens: 2048 }),
  })
  if (!resp.ok) {
    const txt = (await resp.text()).slice(0, 500)
    throw new Error(`Cloudflare AI ${resp.status}: ${txt}`)
  }
  const json = await resp.json() as {
    success?: boolean
    result?: { response?: string; description?: string }
    errors?: Array<{ message?: string }>
  }
  if (json.success === false) {
    throw new Error(`Cloudflare AI failed: ${JSON.stringify(json.errors ?? [])}`)
  }
  const text = json.result?.response ?? json.result?.description ?? ""
  if (!text) throw new Error(`Cloudflare AI: empty response body: ${JSON.stringify(json).slice(0, 200)}`)
  return { text, engine: `cloudflare-llama-vision` }
}

export type KnownType =
  | "OFFER_TO_PURCHASE" | "SA_ID_SMART_CARD" | "SA_ID_GREEN_BOOK"
  | "PROOF_OF_ADDRESS" | "BANK_STATEMENT" | "PAYSLIP"
  | "VEHICLE_NATIS" | "VEHICLE_REGISTRATION" | "SETTLEMENT_LETTER" | "OTHER"

export interface ExtractionField { value: string | null; confidence: number }
export type ExtractedData = Record<string, ExtractionField>

export function flattenMindeeFields(
  raw: Record<string, unknown>, parentKey = "",
): ExtractedData {
  const out: ExtractedData = {}
  for (const [name, f] of Object.entries(raw)) {
    const key = parentKey ? `${parentKey}_${name}` : name
    if (!f || typeof f !== "object") continue
    const fObj = f as Record<string, unknown>
    if ("value" in fObj) {
      const v = fObj.value
      out[key] = {
        value: v === null || v === undefined ? null : String(v),
        confidence: typeof fObj.confidence === "number" ? fObj.confidence
                  : fObj.confidence === "High" ? 0.95
                  : fObj.confidence === "Medium" ? 0.7
                  : fObj.confidence === "Low" ? 0.4 : 0.5,
      }
    } else if ("fields" in fObj) {
      Object.assign(out, flattenMindeeFields(fObj.fields as Record<string, unknown>, key))
    }
  }
  return out
}

export function normaliseForDocType(flat: ExtractedData, docType: KnownType): ExtractedData {
  const out: ExtractedData = { ...flat }
  const set = (k: string, src: ExtractionField | undefined) => { if (src && !out[k]) out[k] = src }
  if (docType === "SA_ID_SMART_CARD" || docType === "SA_ID_GREEN_BOOK") {
    const surname = flat.surnames?.value ?? ""
    const givenNames = flat.given_names?.value ?? ""
    if (surname || givenNames) {
      const conf = Math.min(flat.surnames?.confidence ?? 1, flat.given_names?.confidence ?? 1)
      set("full_name", { value: `${surname} ${givenNames}`.trim(), confidence: conf })
    }
    if (flat.document_number?.value) {
      const stripped = flat.document_number.value.replace(/\s+/g, "")
      set("id_number", { value: stripped, confidence: flat.document_number.confidence })
    }
    if (flat.sex?.value) {
      const s = flat.sex.value.toUpperCase()
      set("gender", { value: s === "M" || s === "F" ? s : null, confidence: flat.sex.confidence })
    }
  } else if (docType === "PROOF_OF_ADDRESS") {
    set("address_line_1", flat.address_street ?? flat.street)
    set("city", flat.address_city ?? flat.city)
    set("postal_code", flat.address_zip_code ?? flat.address_postal_code ?? flat.postal_code)
    set("suburb", flat.address_suburb ?? flat.suburb)
    set("document_date", flat.document_date ?? flat.date)
    set("account_holder_name", flat.account_holder_name ?? flat.holder_name ?? flat.full_name)
  } else if (docType === "BANK_STATEMENT") {
    // Mindee BS: holder name surfaces under several different keys. Try them
    // all; first non-null wins. account_holder_names is an ARRAY of items
    // (Mindee returns multiple — buyer + bank). Pick the first one that
    // doesn't look like a bank name.
    const namesItem = flat.account_holder_names_value
      ?? flat.account_holder_names_0_value
    set("account_holder", flat.account_holder
      ?? flat.account_holder_name
      ?? flat.holder_name
      ?? flat.customer_name
      ?? flat.client_name
      ?? flat.full_name
      ?? namesItem)
    set("bank_name", flat.bank_name ?? flat.bank)
    set("account_number", flat.account_number ?? flat.iban)
    set("account_type", flat.account_type ?? { value: "unknown", confidence: 0.3 })
    set("statement_from", flat.statement_from
      ?? flat.statement_period_start_date
      ?? flat.period_start ?? flat.start_date)
    set("statement_to", flat.statement_to
      ?? flat.statement_period_end_date
      ?? flat.period_end ?? flat.end_date)
    set("closing_balance", flat.closing_balance
      ?? flat.ending_balance ?? flat.end_balance ?? flat.balance)
  }
  return out
}

export function selfValidateID(extracted: ExtractedData): ExtractedData {
  const idField = extracted.id_number
  if (!idField?.value || !/^\d{13}$/.test(idField.value)) return extracted
  const yy = parseInt(idField.value.slice(0, 2), 10)
  const mm = parseInt(idField.value.slice(2, 4), 10)
  const dd = parseInt(idField.value.slice(4, 6), 10)
  const century = yy <= 26 ? 2000 : 1900
  const derivedDob = `${century + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
  const derivedGender = parseInt(idField.value[6], 10) >= 5 ? "M" : "F"
  if (extracted.date_of_birth) {
    const matches = extracted.date_of_birth.value === derivedDob
    extracted.date_of_birth.confidence = matches
      ? Math.max(extracted.date_of_birth.confidence, 0.95)
      : Math.min(extracted.date_of_birth.confidence, 0.4)
    if (!extracted.date_of_birth.value) extracted.date_of_birth.value = derivedDob
  } else { extracted.date_of_birth = { value: derivedDob, confidence: 0.85 } }
  if (extracted.gender) {
    const matches = extracted.gender.value === derivedGender
    extracted.gender.confidence = matches
      ? Math.max(extracted.gender.confidence, 0.95)
      : Math.min(extracted.gender.confidence, 0.5)
    if (!extracted.gender.value) extracted.gender.value = derivedGender
  } else { extracted.gender = { value: derivedGender, confidence: 0.85 } }
  return extracted
}

export function policyFlagsFor(extracted: ExtractedData, docType: KnownType): string[] {
  const flags: string[] = []
  if (docType === "BANK_STATEMENT") {
    const accountType = extracted.account_type?.value?.toLowerCase() ?? ""
    // Match any "business" / "corporate" / "company" wording — banks label these
    // as "PLATINUM BUSINESS ACCOUNT", "Corporate Cheque", etc., not just "business".
    if (/business|corporate|company|enterprise/.test(accountType)) {
      flags.push("business_account_rejected")
    }
  }
  return flags
}

/**
 * For Mindee BANK_STATEMENT only: walk the raw `list_of_transactions` items
 * and sum positive amounts as total_credits and absolute negative amounts as
 * total_debits. Mindee's own `total_credits` / `total_debits` summary fields
 * are unreliable on multi-page statements (we've seen them under-report by
 * 3-4×), but the per-line `list_of_transactions` IS complete across pages.
 *
 * Pass in the raw `inference.result.fields` payload — same shape consumed by
 * flattenMindeeFields. Returns null if no transactions array is present.
 */
interface BankSummary {
  total_credits: number
  total_debits: number
  net: number
  count: number
  largest_credit: number | null
  fee_total: number
  fee_count: number
  top_credit_sources: Array<{ description: string; total: number; count: number }>
  top_expense_categories: Array<{ description: string; total: number; count: number }>
  recurring_credits: Array<{ description: string; total: number; count: number; avg: number }>
}

/** Lightweight category for descriptions — strips amounts/dates/refs to find recurring patterns. */
function normaliseDescription(desc: string): string {
  return desc
    .replace(/\d{6,}/g, "")          // long ref numbers
    .replace(/\b\d{6}\b/g, "")        // 6-digit codes (DDMMYY)
    .replace(/\bZA\b/g, "")
    .replace(/\bUS\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 50)
}

export function summariseBankTransactions(rawFields: Record<string, unknown>): BankSummary | null {
  const tx = rawFields.list_of_transactions as
    { items?: Array<{ fields?: Record<string, { value?: unknown }> }> } | undefined
  const items = tx?.items
  if (!Array.isArray(items) || items.length === 0) return null

  let credits = 0, debits = 0, largestCredit = 0, count = 0
  let feeTotal = 0, feeCount = 0
  const creditMap = new Map<string, { total: number; count: number }>()
  const debitMap  = new Map<string, { total: number; count: number }>()

  for (const it of items) {
    const amt = it.fields?.amount?.value
    const desc = it.fields?.description?.value
    const n = typeof amt === "number" ? amt : parseFloat(String(amt ?? ""))
    const d = typeof desc === "string" ? desc : String(desc ?? "")
    if (!Number.isFinite(n)) continue
    count++

    const key = normaliseDescription(d)
    const isFee = /\bFee:|\bservice fee|\bsms notification/i.test(d)
    if (isFee) { feeCount++; feeTotal += Math.abs(n) }

    if (n > 0) {
      credits += n
      if (n > largestCredit) largestCredit = n
      const cur = creditMap.get(key) ?? { total: 0, count: 0 }
      creditMap.set(key, { total: cur.total + n, count: cur.count + 1 })
    } else if (n < 0) {
      debits += -n
      const cur = debitMap.get(key) ?? { total: 0, count: 0 }
      debitMap.set(key, { total: cur.total + (-n), count: cur.count + 1 })
    }
  }

  const topN = (m: Map<string, { total: number; count: number }>, n: number) =>
    [...m.entries()]
      .map(([description, v]) => ({ description, total: Math.round(v.total * 100) / 100, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, n)

  const recurring = [...creditMap.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([description, v]) => ({
      description,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
      avg:   Math.round((v.total / v.count) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  return {
    total_credits: Math.round(credits * 100) / 100,
    total_debits:  Math.round(debits  * 100) / 100,
    net:           Math.round((credits - debits) * 100) / 100,
    count,
    largest_credit: largestCredit > 0 ? largestCredit : null,
    fee_total: Math.round(feeTotal * 100) / 100,
    fee_count: feeCount,
    top_credit_sources:    topN(creditMap, 5),
    top_expense_categories: topN(debitMap, 5),
    recurring_credits: recurring,
  }
}

/**
 * Persist an extracted result for a document. Writes:
 *   - extraction_results rows (one per field)
 *   - documents.status = 'extracted'
 *   - extraction_tasks.status = 'completed'
 * Returns avg confidence + policy flags.
 */
export async function persistExtraction(
  supabase: SupabaseClient,
  documentId: string,
  extracted: ExtractedData,
  docType: KnownType,
  engine: string,
): Promise<{ avg_confidence: number; field_count: number; policy_flags: string[] }> {
  const policy_flags = policyFlagsFor(extracted, docType)

  const fieldRows = Object.entries(extracted).map(([field_name, f]) => ({
    document_id: documentId,
    field_name,
    extracted_value: f.value,
    confidence: f.confidence ?? 0,
    verification_status: "PENDING",
    created_at: new Date().toISOString(),
  }))
  if (fieldRows.length > 0) {
    const { error: insErr } = await supabase.from("extraction_results").insert(fieldRows)
    if (insErr) throw new Error(`extraction_results insert failed: ${insErr.message}`)
  }

  const confidences = Object.values(extracted)
    .map((f) => f.confidence ?? 0)
    .filter((c): c is number => typeof c === "number")
  const avg = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0

  await supabase.from("documents")
    .update({ status: "extracted", extracted_at: new Date().toISOString() })
    .eq("id", documentId)
  await supabase.from("extraction_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("status", "pending")

  // best-effort log line; ignore void
  void engine
  return { avg_confidence: avg, field_count: fieldRows.length, policy_flags }
}
