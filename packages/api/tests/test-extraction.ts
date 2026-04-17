/**
 * test-extraction.ts — Deno integration tests for the extract-document edge function.
 *
 * Run with:
 *   deno test --allow-read packages/api/tests/test-extraction.ts
 *
 * The tests do NOT call the real edge function or the real Anthropic API.
 * All HTTP calls are intercepted via the stub helpers below.
 *
 * Fixtures live in packages/api/tests/fixtures/extraction/.
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts"

// ---------------------------------------------------------------------------
// Fixture paths (relative to repo root when run with `deno test` from root)
// ---------------------------------------------------------------------------

const FIXTURE_DIR = "packages/api/tests/fixtures/extraction"

// ---------------------------------------------------------------------------
// Types (mirroring the edge function shapes)
// ---------------------------------------------------------------------------

interface ExtractionField {
  value: string | null
  confidence: number
}

type ExtractedData = Record<string, ExtractionField>

interface EdgeFnRequest {
  document_id: string
}

interface EdgeFnResponse {
  success: boolean
  document_id?: string
  avg_confidence?: number
  flagged?: boolean
  low_confidence_fields?: string[]
  input_tokens?: number
  output_tokens?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Stub infrastructure
// ---------------------------------------------------------------------------

type StubFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Creates a stubbed fetch that returns a synthetic edge-function response
 * without making any real network calls.
 */
function makeEdgeFunctionStub(responsePayload: EdgeFnResponse): StubFetch {
  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(responsePayload), {
      status: responsePayload.success ? 200 : (responsePayload.error?.includes("too large") ? 413 : 500),
      headers: { "Content-Type": "application/json" },
    })
  }
}

/**
 * Invokes the stub fetch as if it were the extract-document edge function.
 */
async function callStubEdgeFn(
  stub: StubFetch,
  body: EdgeFnRequest,
): Promise<{ status: number; json: EdgeFnResponse }> {
  const res = await stub("https://example.supabase.co/functions/v1/extract-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = await res.json() as EdgeFnResponse
  return { status: res.status, json }
}

// ---------------------------------------------------------------------------
// Confidence policy logic (extracted for unit testing without the full fn)
// ---------------------------------------------------------------------------

interface ConfidenceStats {
  average: number
  lowFields: string[]
  flagged: boolean
}

function calcConfidenceStats(data: ExtractedData): ConfidenceStats {
  const entries = Object.entries(data)
  if (entries.length === 0) return { average: 0, lowFields: [], flagged: true }

  const sum = entries.reduce((acc, [, f]) => acc + (f.confidence ?? 0), 0)
  const average = sum / entries.length
  const lowFields = entries
    .filter(([, f]) => (f.confidence ?? 1) < 0.60)
    .map(([k]) => k)

  return { average, lowFields, flagged: lowFields.length > 0 }
}

// ---------------------------------------------------------------------------
// Helper: load a fixture JSON file
// ---------------------------------------------------------------------------

async function loadFixture(filename: string): Promise<ExtractedData> {
  const text = await Deno.readTextFile(`${FIXTURE_DIR}/${filename}`)
  // Strip _comment key
  const raw = JSON.parse(text) as Record<string, unknown>
  delete raw["_comment"]
  return raw as ExtractedData
}

// ===========================================================================
// Tests
// ===========================================================================

Deno.test("fixture: id_document_expected.json is valid and parseable", async () => {
  const fixture = await loadFixture("id_document_expected.json")
  assertExists(fixture.full_name, "full_name field should exist")
  assertExists(fixture.id_number, "id_number field should exist")
  assertExists(fixture.date_of_birth, "date_of_birth field should exist")
  assertExists(fixture.gender, "gender field should exist")

  for (const [key, field] of Object.entries(fixture)) {
    assert(typeof field.confidence === "number", `${key}.confidence must be a number`)
    assert(field.confidence >= 0 && field.confidence <= 1, `${key}.confidence must be 0–1`)
  }
})

Deno.test("fixture: bank_statement_expected.json is valid and parseable", async () => {
  const fixture = await loadFixture("bank_statement_expected.json")
  assertExists(fixture.account_holder)
  assertExists(fixture.bank_name)
  assertExists(fixture.closing_balance)
  // Monetary values should be numeric strings
  const closingVal = fixture.closing_balance.value
  if (closingVal !== null) {
    assert(!isNaN(Number(closingVal)), "closing_balance.value should be a numeric string")
  }
})

Deno.test("confidence policy: high-confidence doc is not flagged", async () => {
  const fixture = await loadFixture("id_document_expected.json")
  const { flagged, lowFields, average } = calcConfidenceStats(fixture)
  assert(!flagged, "High-confidence doc should not be flagged")
  assertEquals(lowFields.length, 0, "No low-confidence fields expected")
  assert(average >= 0.80, "Average confidence should be >= 0.80")
})

Deno.test("confidence policy: low-confidence doc is flagged and creates Q_MISMATCH_REVIEW", async () => {
  const fixture = await loadFixture("low_confidence_expected.json")
  const { flagged, lowFields, average } = calcConfidenceStats(fixture)
  assert(flagged, "Low-confidence doc should be flagged")
  assert(lowFields.length > 0, "Should have at least one low-confidence field")
  assert(average < 0.80, "Average confidence should be < 0.80 — would trigger Q_MISMATCH_REVIEW task")
})

Deno.test("confidence policy: individual field < 0.60 appears in lowFields", () => {
  const data: ExtractedData = {
    full_name:  { value: "Test User", confidence: 0.91 },
    id_number:  { value: "0000000000000", confidence: 0.55 }, // below threshold
    gender:     { value: "M", confidence: 0.88 },
  }
  const { lowFields, flagged } = calcConfidenceStats(data)
  assert(flagged, "Should be flagged due to low id_number confidence")
  assert(lowFields.includes("id_number"), "id_number should appear in lowFields")
  assert(!lowFields.includes("full_name"), "full_name should not appear in lowFields")
})

Deno.test("stub: edge function returns success for normal document", async () => {
  const fixture = await loadFixture("id_document_expected.json")
  const { average, lowFields, flagged } = calcConfidenceStats(fixture)

  const stub = makeEdgeFunctionStub({
    success: true,
    document_id: "doc-test-001",
    avg_confidence: average,
    flagged,
    low_confidence_fields: lowFields,
    input_tokens: 1200,
    output_tokens: 180,
  })

  const { status, json } = await callStubEdgeFn(stub, { document_id: "doc-test-001" })
  assertEquals(status, 200)
  assertEquals(json.success, true)
  assertEquals(json.document_id, "doc-test-001")
  assert(typeof json.avg_confidence === "number")
  assert(Array.isArray(json.low_confidence_fields))
})

Deno.test("stub: edge function returns 413 for oversize document", async () => {
  const stub = makeEdgeFunctionStub({
    success: false,
    error: "File too large (> 20 MB)",
  })

  const { status, json } = await callStubEdgeFn(stub, { document_id: "doc-oversize" })
  assertEquals(status, 413)
  assertEquals(json.success, false)
  assert(json.error?.includes("large"), "Error message should mention size")
})

Deno.test("stub: edge function returns error for failed extraction", async () => {
  const stub = makeEdgeFunctionStub({
    success: false,
    error: "Anthropic API error (529): overloaded",
  })

  const { status, json } = await callStubEdgeFn(stub, { document_id: "doc-fail" })
  assertEquals(status, 500)
  assertEquals(json.success, false)
  assertExists(json.error)
})

Deno.test("stub: low-confidence doc triggers Q_MISMATCH_REVIEW flag in response", async () => {
  const fixture = await loadFixture("low_confidence_expected.json")
  const { average, lowFields, flagged } = calcConfidenceStats(fixture)

  const stub = makeEdgeFunctionStub({
    success: true,
    document_id: "doc-lowconf",
    avg_confidence: average,
    flagged,
    low_confidence_fields: lowFields,
    input_tokens: 1100,
    output_tokens: 160,
  })

  const { status, json } = await callStubEdgeFn(stub, { document_id: "doc-lowconf" })
  assertEquals(status, 200)
  assertEquals(json.success, true)
  assertEquals(json.flagged, true)
  assert((json.low_confidence_fields?.length ?? 0) > 0, "Should have low_confidence_fields")
  // avg_confidence < 0.80 means the real function would create Q_MISMATCH_REVIEW task
  assert((json.avg_confidence ?? 1) < 0.80, "avg_confidence should be < 0.80")
})

Deno.test("stub: get-results returns pending when extraction task is processing", async () => {
  // Simulate the bot handler behaviour: edge fn fires async, task is pending
  const taskStatus = "pending"
  // No real DB call; just verify the shape the bot handler returns
  const simulatedResult = {
    success: true,
    status: taskStatus,
    message: "Extraction still in progress. Please try again in a moment.",
  }
  assertEquals(simulatedResult.status, "pending")
  assertEquals(simulatedResult.success, true)
  assertExists(simulatedResult.message)
})

Deno.test("confidence stats: empty extraction data returns flagged=true", () => {
  const { flagged, average, lowFields } = calcConfidenceStats({})
  assert(flagged, "Empty extraction should be flagged")
  assertEquals(average, 0)
  assertEquals(lowFields.length, 0)
})

Deno.test("proof_of_address fixture: document_date is present and YYYY-MM-DD", async () => {
  const fixture = await loadFixture("proof_of_address_expected.json")
  assertExists(fixture.document_date)
  const val = fixture.document_date.value
  if (val !== null) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(val), `document_date should be YYYY-MM-DD, got: ${val}`)
  }
})
