// test-recovery.ts — unit tests for the Workstream A qualifying-band engine.
// Pure functions, no I/O. Run:  deno test --allow-none packages/api/tests/test-recovery.ts
//   (or via the whole suite: deno test packages/api/tests/)

import { assert, assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  loanFromInstalment,
  computeQualifyingCeiling,
  composeUpsellOffer,
  DEFAULT_RATE_CONFIG,
  rateConfigFromEnv,
} from "../supabase/functions/_shared/recovery.ts"

Deno.test("loanFromInstalment — standard amortisation", () => {
  // R1 400/mo at 13.5% over 72 months ≈ R69 800 present value.
  const loan = loanFromInstalment(1400, 0.135, 72)
  assertAlmostEquals(loan, 69800, 1500) // within a reasonable band
  assert(loan > 60000 && loan < 75000)
})

Deno.test("loanFromInstalment — zero interest is instalment × term", () => {
  assertEquals(loanFromInstalment(1000, 0, 60), 60000)
})

Deno.test("loanFromInstalment — non-positive inputs return 0", () => {
  assertEquals(loanFromInstalment(0, 0.13, 72), 0)
  assertEquals(loanFromInstalment(1000, 0.13, 0), 0)
})

Deno.test("computeQualifyingCeiling — the fixture buyer (disposable ~R4 747)", () => {
  const r = computeQualifyingCeiling({ disposableIncome: 4747, deposit: 25000 })
  assert(r.qualifies)
  // safe instalment ≈ 4747 * 0.30 = 1424
  assertAlmostEquals(r.safeInstalment!, 1424, 1)
  // ceiling = loan(~71k) + deposit(25k), floored to R1 000. Should land ~R96 000.
  assert(r.qualifyingCeiling! >= 90000 && r.qualifyingCeiling! <= 100000,
    `ceiling was ${r.qualifyingCeiling}`)
  // rounded down to nearest 1000
  assertEquals(r.qualifyingCeiling! % 1000, 0)
})

Deno.test("computeQualifyingCeiling — never optimistic (floors down)", () => {
  const r = computeQualifyingCeiling({ disposableIncome: 4747 })
  // no deposit → ceiling is just the loan, floored
  assertEquals(r.qualifyingCeiling! % 1000, 0)
  assert(r.qualifyingCeiling! <= r.maxLoan!)
})

Deno.test("computeQualifyingCeiling — falls back to gross income", () => {
  const r = computeQualifyingCeiling({ monthlyIncome: 32000 })
  assert(r.qualifies)
  // fallback safe instalment = 32000 * 0.15 = 4800
  assertAlmostEquals(r.safeInstalment!, 4800, 1)
})

Deno.test("computeQualifyingCeiling — no income signal → does not qualify", () => {
  const r = computeQualifyingCeiling({ disposableIncome: null, monthlyIncome: null })
  assertEquals(r.qualifies, false)
  assertEquals(r.qualifyingCeiling, null)
})

Deno.test("computeQualifyingCeiling — below finance floor → does not qualify", () => {
  // Tiny disposable → ceiling under R30 000 floor.
  const r = computeQualifyingCeiling({ disposableIncome: 500 })
  assertEquals(r.qualifies, false)
  assert(r.reason.includes("floor"))
})

Deno.test("composeUpsellOffer — includes pre-qualified amount + band params", () => {
  const offer = composeUpsellOffer({
    fullName: "Thabo Nkosi",
    originalPrice: 285000,
    qualifyingCeiling: 182000,
    make: "Volkswagen",
    model: "Polo",
  })
  assert(offer.message.includes("Thabo"))
  assert(offer.message.includes("285 000"))
  assert(offer.message.includes("182 000"))
  assertEquals(offer.searchParams.max_price, 182000)
  assert(offer.searchParams.min_price < 182000 && offer.searchParams.min_price > 0)
  assertEquals(offer.searchParams.make, "Volkswagen")
})

Deno.test("composeUpsellOffer — graceful without a name", () => {
  const offer = composeUpsellOffer({ qualifyingCeiling: 150000 })
  assert(offer.message.includes("there")) // falls back to 'there'
  assert(offer.message.includes("150 000"))
})

Deno.test("rateConfigFromEnv — overrides + fallbacks", () => {
  const env: Record<string, string> = { RECOVERY_ANNUAL_RATE: "0.11", RECOVERY_TERM_MONTHS: "60" }
  const cfg = rateConfigFromEnv((k) => env[k])
  assertEquals(cfg.annualRate, 0.11)
  assertEquals(cfg.termMonths, 60)
  // unspecified fields fall back to defaults
  assertEquals(cfg.instalmentToDisposable, DEFAULT_RATE_CONFIG.instalmentToDisposable)
  assertEquals(cfg.minVehiclePrice, DEFAULT_RATE_CONFIG.minVehiclePrice)
})
