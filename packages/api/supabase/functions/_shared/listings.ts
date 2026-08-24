// listings.ts — pluggable vehicle-listing provider for the upsell journey.
//
// Mirrors the tracing-provider pattern: one interface, swappable adapters.
//
//   deeplink (default) — composes cars.co.za search URLs (no images; cars.co.za
//                        blocks server-side fetches, so we never see listings)
//   demo               — small curated inventory with self-hosted images, for
//                        demos/testing the card-with-photo experience
//   (future)           — WeBuyCars / AutoTrader / cars.co.za feed adapters plug
//                        in here the day a partnership/API agreement lands
//
// Select with env LISTING_PROVIDER. Unknown names fail loudly.

export interface ListingQuery {
  make?: string
  model?: string
  min_price: number
  max_price: number
}

export interface Listing {
  /** Card header, e.g. "2019 Volkswagen Tiguan 1.4 TSI" or a search label. */
  title: string
  /** Card body — price line / hint. */
  body: string
  /** Where "Browse" takes the buyer. */
  url: string
  /** Optional public image URL → rendered as the card's image header. */
  imageUrl?: string
}

export interface ListingProvider {
  readonly name: string
  search(q: ListingQuery): Promise<Listing[]>
}

const fmt = (n: number) => "R " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")

// ── deeplink provider (current production behaviour) ─────────────────────────
// Wraps the cars-alternatives edge function. No images — deep links only.

export class DeepLinkProvider implements ListingProvider {
  readonly name = "deeplink"
  constructor(private supaUrl: string) {}

  async search(q: ListingQuery): Promise<Listing[]> {
    const res = await fetch(`${this.supaUrl}/functions/v1/cars-alternatives`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    })
    if (!res.ok) return []
    const results: Array<{ label: string; url: string; hint: string }> = (await res.json()).results ?? []
    return results.map((r) => ({ title: r.label, body: r.hint, url: r.url }))
  }
}

// ── demo provider ─────────────────────────────────────────────────────────────
// Curated inventory with images we host ourselves (Supabase public storage).
// Clearly demo data: fixed cars, deterministic, DEMO-stamped in the body. Lets
// the WhatsApp card-with-photo experience be shown before a real feed exists.

interface DemoCar {
  make: string; model: string; year: number; price: number
  title: string; img: string
}

const DEMO_IMG_BASE =
  "https://sahvfsoclzgsuewbiiah.supabase.co/storage/v1/object/public/documents/demo-vehicles"

const DEMO_INVENTORY: DemoCar[] = [
  { make: "Volkswagen", model: "Golf",   year: 2018, price: 249900, title: "2018 Volkswagen Golf 7 GTI 2.0 TSI DSG", img: `${DEMO_IMG_BASE}/01-front.jpeg` },
  { make: "Volkswagen", model: "Tiguan", year: 2019, price: 265000, title: "2019 Volkswagen Tiguan 1.4 TSI Comfortline", img: `${DEMO_IMG_BASE}/03-driver_side.jpeg` },
  { make: "Volkswagen", model: "Polo",   year: 2021, price: 229500, title: "2021 Volkswagen Polo 1.0 TSI Life", img: `${DEMO_IMG_BASE}/02-rear.jpeg` },
  { make: "Toyota",     model: "Corolla",year: 2020, price: 259900, title: "2020 Toyota Corolla 1.8 XS Hybrid", img: `${DEMO_IMG_BASE}/01-front.jpeg` },
  { make: "Ford",       model: "Fiesta", year: 2019, price: 189900, title: "2019 Ford Fiesta 1.0 EcoBoost Trend", img: `${DEMO_IMG_BASE}/03-driver_side.jpeg` },
  { make: "Kia",        model: "Picanto",year: 2022, price: 179900, title: "2022 Kia Picanto 1.2 Street", img: `${DEMO_IMG_BASE}/02-rear.jpeg` },
]

export class DemoInventoryProvider implements ListingProvider {
  readonly name = "demo"

  search(q: ListingQuery): Promise<Listing[]> {
    // Band filter first; prefer same make, then top up with others.
    const inBand = DEMO_INVENTORY.filter((c) => c.price <= q.max_price && c.price >= Math.min(q.min_price, q.max_price * 0.4))
    const sameMake = inBand.filter((c) => q.make && c.make.toLowerCase() === q.make.toLowerCase())
    const others = inBand.filter((c) => !sameMake.includes(c))
    const picks = [...sameMake, ...others].slice(0, 3)

    return Promise.resolve(picks.map((c) => ({
      title: c.title,
      body: `${fmt(c.price)} · within your pre-qualified amount\n(demo listing)`,
      // Deep link to the real cars.co.za band for that model so the button still goes somewhere real.
      url: `https://www.cars.co.za/cars-for-sale/2/?Manufacturer=${encodeURIComponent(c.make)}&Model=${encodeURIComponent(c.model)}&PriceMax=${q.max_price}&Sorting=PriceAsc`,
      imageUrl: c.img,
    })))
  }
}

// ── AutoTrade provider ────────────────────────────────────────────────────────
// Real inventory from the Vehicle Sourcing API — actual listings with photos,
// prices and URLs. GET /api/vehicles filtered to the customer's band, mapped to
// our card shape. This is the production provider once a token is configured.
//   AUTOTRADE_API_URL   (default https://autotrade-api.nom-nom.workers.dev)
//   AUTOTRADE_API_TOKEN (bearer — required; without it the provider errors)

interface VehicleOut {
  id: number; year: number | null; make: string | null; model: string | null
  variant: string | null; price: number | null; mileage_km: number | null
  transmission: string | null; fuel_type: string | null; condition: string | null
  seller_type: string | null; province: string | null; city: string | null
  url: string; image_url: string | null
}

export class AutoTradeProvider implements ListingProvider {
  readonly name = "autotrade"
  private base: string
  private token: string

  constructor(getEnv: (k: string) => string | undefined) {
    this.base = (getEnv("AUTOTRADE_API_URL") ?? "https://autotrade-api.nom-nom.workers.dev").replace(/\/$/, "")
    this.token = getEnv("AUTOTRADE_API_TOKEN") ?? ""
    if (!this.token) throw new Error("AUTOTRADE_API_TOKEN not set — cannot query the vehicle source.")
  }

  async search(q: ListingQuery): Promise<Listing[]> {
    const params = new URLSearchParams({ active: "true", limit: "12" })
    if (q.make) params.set("make", q.make)
    if (q.model) params.set("model", q.model)
    if (q.max_price) params.set("max_price", String(Math.round(q.max_price)))

    const res = await fetch(`${this.base}/api/vehicles?${params}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) throw new Error(`AutoTrade API ${res.status}`)
    const vehicles = (await res.json()) as VehicleOut[]

    // Respect the band floor client-side (the API filters max, not min), prefer
    // same-make, and take the three best-value in band.
    const inBand = vehicles.filter((v) =>
      v.price != null && v.price <= q.max_price && v.price >= Math.min(q.min_price, q.max_price * 0.4))
    const sameMake = q.make ? inBand.filter((v) => v.make?.toLowerCase() === q.make!.toLowerCase()) : []
    const picks = [...sameMake, ...inBand.filter((v) => !sameMake.includes(v))].slice(0, 3)

    return picks.map((v) => {
      const title = [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ") || "Vehicle"
      const bits = [
        v.price != null ? fmt(v.price) : null,
        v.mileage_km != null ? `${v.mileage_km.toLocaleString()} km` : null,
        v.transmission, v.city,
      ].filter(Boolean)
      return { title, body: bits.join(" · "), url: v.url, imageUrl: v.image_url ?? undefined }
    })
  }
}

// ── selection ────────────────────────────────────────────────────────────────

export function getListingProvider(getEnv: (k: string) => string | undefined): ListingProvider {
  const name = (getEnv("LISTING_PROVIDER") ?? "deeplink").toLowerCase()
  switch (name) {
    case "deeplink":
    case "":
      return new DeepLinkProvider(getEnv("SUPABASE_URL") ?? "")
    case "demo":
      return new DemoInventoryProvider()
    case "autotrade":
      return new AutoTradeProvider(getEnv)
    default:
      throw new Error(
        `Listing provider "${name}" is not configured. Available: deeplink, demo, autotrade. ` +
        `Other inventory-feed adapters plug in once a partnership/API agreement lands.`,
      )
  }
}
