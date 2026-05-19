// cars-alternatives — composes targeted cars.co.za search URLs the buyer
// can tap to explore alternative vehicles.
//
// Why URL composition (not scraping):
//   cars.co.za is gated by Cloudflare's anti-bot challenge — every fetch
//   returns a 403 JS-challenge page, not real content. Even Deno's fetch
//   with a real User-Agent string fails. A headless-browser scrape would
//   work but is fragile + slow + expensive.
//
// What we do instead:
//   Build 3-4 deep-link search URLs that filter cars.co.za to listings
//   the buyer is likely to care about (same model / same make+price
//   band / lower mileage / similar body type). The buyer taps the link
//   and sees REAL listings on cars.co.za itself — no scraping needed,
//   no stale data, and we respect cars.co.za's site.
//
// POST body: { make?, model?, body_type?, min_price?, max_price?, year_min?, max_mileage_km? }
// Response : { results: [{ label, url, hint }] }
//
// No auth required (server-to-server from the bot edge function).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const CARS_BASE = "https://www.cars.co.za/cars-for-sale/"

interface SearchInput {
  make?:           string  // "Volkswagen"
  model?:          string  // "Golf"
  body_type?:      string  // "Hatchback", "SUV", "Sedan", etc.
  min_price?:      number  // ZAR
  max_price?:      number  // ZAR
  year_min?:       number  // 2017
  max_mileage_km?: number  // 120000
}

interface Alternative {
  label: string  // human-friendly heading shown in the WhatsApp message
  url:   string  // cars.co.za search URL
  hint:  string  // 1-line explanation of why this set
}

function urlFor(params: Record<string, string | number | undefined>): string {
  const u = new URL(CARS_BASE + "2/")
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue
    u.searchParams.set(k, String(v))
  }
  // Sort & ascending price by default — most relevant listings first.
  u.searchParams.set("Sorting", "PriceAsc")
  return u.toString()
}

function build(input: SearchInput): Alternative[] {
  const out: Alternative[] = []
  const price = input.max_price ?? null
  const minP  = input.min_price ?? (price ? Math.round(price * 0.85) : undefined)
  const maxP  = input.max_price ?? (price ? Math.round(price * 1.10) : undefined)

  // 1. Same make + model — most directly comparable.
  if (input.make && input.model) {
    out.push({
      label: `Same model — ${input.make} ${input.model}`,
      url:   urlFor({
        Manufacturer: input.make, Model: input.model,
        PriceMin: minP, PriceMax: maxP, YearMin: input.year_min,
      }),
      hint: "Other listings of the exact same model in your price band.",
    })
  }

  // 2. Same make, different model — fallback if same-model is too narrow.
  if (input.make) {
    out.push({
      label: `Other ${input.make} models`,
      url:   urlFor({
        Manufacturer: input.make,
        PriceMin: minP, PriceMax: maxP, YearMin: input.year_min,
      }),
      hint: `Stay with ${input.make}, explore different models at the same price.`,
    })
  }

  // 3. Same body type — broaden the net (Hatchback / SUV / Sedan etc).
  if (input.body_type) {
    out.push({
      label: `Same body type — ${input.body_type}`,
      url:   urlFor({
        BodyType: input.body_type,
        PriceMin: minP, PriceMax: maxP, YearMin: input.year_min,
      }),
      hint: "Different make, same shape and price.",
    })
  }

  // 4. Lower-mileage option if we have a mileage hint.
  if (input.max_mileage_km) {
    out.push({
      label: `Lower mileage (under ${Math.round(input.max_mileage_km * 0.7 / 1000)}k km)`,
      url:   urlFor({
        Manufacturer: input.make, Model: input.model,
        PriceMin: minP, PriceMax: maxP,
        MileageMax: Math.round(input.max_mileage_km * 0.7),
      }),
      hint: "Fewer kilometres on the clock vs the one that didn't pass.",
    })
  }

  // 5. Open-band fallback if we have basically no info.
  if (out.length === 0) {
    out.push({
      label: "Cars under your price",
      url:   urlFor({ PriceMin: minP, PriceMax: maxP }),
      hint:  "Broad search — refine on cars.co.za.",
    })
  }

  return out.slice(0, 5)
}

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405)

  let body: SearchInput = {}
  try { body = (await req.json()) ?? {} } catch { return json({ error: "Invalid JSON body" }, 400) }

  const results = build(body)
  return json({ results })
})
