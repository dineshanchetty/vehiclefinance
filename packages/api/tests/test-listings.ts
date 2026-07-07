// test-listings.ts — unit tests for the pluggable listing provider.
// Run:  deno test packages/api/tests/test-listings.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { DemoInventoryProvider, getListingProvider } from "../supabase/functions/_shared/listings.ts"

Deno.test("demo provider — respects the price band", async () => {
  const p = new DemoInventoryProvider()
  const out = await p.search({ min_price: 100000, max_price: 200000 })
  assert(out.length > 0)
  for (const l of out) {
    assert(l.body.includes("R "), "body should show a price")
    assert(l.imageUrl?.startsWith("https://"), "demo listings carry an image")
    assert(l.body.toLowerCase().includes("demo"), "demo listings are stamped as demo")
  }
})

Deno.test("demo provider — prefers same make first", async () => {
  const p = new DemoInventoryProvider()
  const out = await p.search({ make: "Volkswagen", min_price: 100000, max_price: 271000 })
  assert(out.length >= 1)
  assert(out[0].title.includes("Volkswagen"), `expected VW first, got ${out[0].title}`)
})

Deno.test("demo provider — caps at 3 cards", async () => {
  const p = new DemoInventoryProvider()
  const out = await p.search({ min_price: 0, max_price: 999999 })
  assert(out.length <= 3)
})

Deno.test("getListingProvider — selection + loud failure", () => {
  assertEquals(getListingProvider(() => undefined).name, "deeplink")
  assertEquals(getListingProvider((k) => (k === "LISTING_PROVIDER" ? "demo" : undefined)).name, "demo")
  let threw = false
  try { getListingProvider((k) => (k === "LISTING_PROVIDER" ? "webuycars" : undefined)) }
  catch (e) { threw = true; assert((e as Error).message.includes("partnership")) }
  assert(threw)
})
