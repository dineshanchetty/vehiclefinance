// test-tracing.ts — unit tests for the Workstream B contact-tracing adapter.
// Run:  deno test packages/api/tests/test-tracing.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  StubTraceProvider, getTraceProvider, bestCandidate,
} from "../supabase/functions/_shared/tracing.ts"

Deno.test("StubTraceProvider — returns a candidate for a valid ID", async () => {
  const p = new StubTraceProvider()
  const out = await p.trace({ idNumber: "8501125007087", fullName: "Test" })
  assertEquals(out.length, 1)
  assertEquals(out[0].source, "stub")
  assert(out[0].phone!.startsWith("2773"))
  assert(out[0].confidence >= 0.60 && out[0].confidence <= 0.94)
})

Deno.test("StubTraceProvider — deterministic (same ID → same result)", async () => {
  const p = new StubTraceProvider()
  const a = await p.trace({ idNumber: "9001010000001" })
  const b = await p.trace({ idNumber: "9001010000001" })
  assertEquals(a[0].phone, b[0].phone)
  assertEquals(a[0].confidence, b[0].confidence)
})

Deno.test("StubTraceProvider — different IDs → different numbers", async () => {
  const p = new StubTraceProvider()
  const a = await p.trace({ idNumber: "9001010000001" })
  const b = await p.trace({ idNumber: "8806155234083" })
  assert(a[0].phone !== b[0].phone)
})

Deno.test("StubTraceProvider — no strong identifier → no candidate", async () => {
  const p = new StubTraceProvider()
  assertEquals((await p.trace({ fullName: "Only A Name" })).length, 0)
  assertEquals((await p.trace({ idNumber: "123" })).length, 0) // too short
})

Deno.test("getTraceProvider — defaults to stub", () => {
  assertEquals(getTraceProvider(() => undefined).name, "stub")
  assertEquals(getTraceProvider((k) => (k === "TRACE_PROVIDER" ? "stub" : undefined)).name, "stub")
})

Deno.test("getTraceProvider — unknown provider fails loudly (not silently)", () => {
  let threw = false
  try { getTraceProvider((k) => (k === "TRACE_PROVIDER" ? "transunion" : undefined)) }
  catch (e) { threw = true; assert((e as Error).message.includes("G5")) }
  assert(threw, "expected an unconfigured real provider to throw")
})

Deno.test("bestCandidate — picks highest confidence", () => {
  const best = bestCandidate([
    { source: "a", confidence: 0.4, phone: "1" },
    { source: "b", confidence: 0.9, phone: "2" },
    { source: "c", confidence: 0.7, phone: "3" },
  ])
  assertEquals(best?.phone, "2")
})

Deno.test("bestCandidate — empty → null", () => {
  assertEquals(bestCandidate([]), null)
})
