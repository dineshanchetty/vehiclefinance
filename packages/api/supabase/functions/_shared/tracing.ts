// tracing.ts — Workstream B contact-tracing / enrichment (B2).
//
// When Absa's number on a declined applicant is dead, we trace fresh contact
// details from external data sources before attempting contact. This module
// defines the provider INTERFACE and a stub implementation; the real adapters
// (credit bureaus — TransUnion, Experian, XDS, VeriCred — and consumer-data /
// tracing providers) plug in behind the same interface once access is granted
// (scope gate G5). Nothing here contacts anyone — it only returns candidate
// details for the (gated) outbound step to use.

export interface TraceIdentity {
  fullName?: string | null
  idNumber?: string | null
  /** The dead number on file — passed for provider context / matching. */
  knownPhone?: string | null
  knownEmail?: string | null
}

export interface TraceCandidate {
  phone?: string
  email?: string
  address?: string
  /** Which data source supplied this — recorded on the lead for audit. */
  source: string
  /** 0.000–1.000 confidence the detail is current + correct. */
  confidence: number
}

export interface TraceProvider {
  readonly name: string
  /** Returns candidate contact details, best-first. Empty array = not found. */
  trace(id: TraceIdentity): Promise<TraceCandidate[]>
}

// ── Stub provider ─────────────────────────────────────────────────────────────
// Deterministic, offline. Lets the whole reactivation pipeline be built + tested
// without live bureau credentials. It NEVER contacts anyone (outbound is gated),
// and every candidate is stamped source: "stub" so it can't be mistaken for real
// bureau data. Only produces a candidate when there is an ID number to key on —
// mirroring how a real bureau trace needs a strong identifier.

export class StubTraceProvider implements TraceProvider {
  readonly name = "stub"

  // Deterministic hash → digits, so the same identity always yields the same
  // synthetic candidate (idempotent, testable). Not random (Math.random is also
  // unavailable in this runtime).
  private hash(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
    return Math.abs(h)
  }

  trace(id: TraceIdentity): Promise<TraceCandidate[]> {
    const key = (id.idNumber ?? "").replace(/\D/g, "")
    if (key.length < 6) return Promise.resolve([]) // no strong identifier → no trace
    const h = this.hash(key)
    // Synthetic SA-shaped mobile, clearly stub (source makes it unmistakable).
    const suffix = (h % 10_000_000).toString().padStart(7, "0")
    const phone = `2773${suffix}`
    const confidence = 0.60 + (h % 35) / 100 // 0.60–0.94, deterministic
    return Promise.resolve([
      { phone, source: "stub", confidence: Number(confidence.toFixed(3)) },
    ])
  }
}

// ── VerifyNow provider ────────────────────────────────────────────────────────
// Real bureau trace via VerifyNow's Consumer/Person Trace.
//   POST {base}/verify   header x-api-key: vn_live_…
//   body { reportType:"consumer_trace", idNumber, mode }
//   returns ContactData (cell/landline), AddressData, EmploymentData, …
//
// The exact field names inside ContactData aren't in the public docs, so we
// scan the response defensively for SA phone / email / address values rather
// than hard-coding a shape that might drift. Env:
//   VERIFYNOW_API_KEY  (required)   VERIFYNOW_API_URL  (optional override)
//   VERIFYNOW_MODE     (test | production, default "test" — test avoids
//                       per-trace cost + real PII while wiring it up)

export class VerifyNowProvider implements TraceProvider {
  readonly name = "verifynow"
  private base: string
  private key: string
  private mode: string

  constructor(getEnv: (k: string) => string | undefined) {
    this.base = (getEnv("VERIFYNOW_API_URL") ?? "https://www.verifynow.co.za/api/external").replace(/\/$/, "")
    this.key = getEnv("VERIFYNOW_API_KEY") ?? ""
    // "sandbox" = free test data; "production" = real, billed traces.
    this.mode = (getEnv("VERIFYNOW_MODE") ?? "sandbox").toLowerCase()
    if (!this.key) throw new Error("VERIFYNOW_API_KEY not set — cannot run a bureau trace.")
  }

  private normPhone(s: string): string | null {
    const d = (s ?? "").replace(/[^\d]/g, "")
    if (/^0[6-8]\d{8}$/.test(d)) return "27" + d.slice(1)   // 0XX… mobile → 27XX…
    if (/^27[6-8]\d{8}$/.test(d)) return d
    return null
  }

  async trace(id: TraceIdentity): Promise<TraceCandidate[]> {
    const idNumber = (id.idNumber ?? "").replace(/\D/g, "")
    if (idNumber.length < 6) return [] // needs a strong identifier

    const res = await fetch(`${this.base}/verify`, {
      method: "POST",
      headers: {
        "x-api-key": this.key,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ reportType: "consumer_trace", idNumber, mode: this.mode }),
    })
    if (!res.ok) throw new Error(`VerifyNow ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json() as {
      results?: { consumer_trace?: {
        deceased?: string
        contact_numbers?: Array<{ type?: string; number?: string }>
        addresses?: Array<{ type?: string; address_line_1?: string; postal_code?: string }>
      } }
    }
    const t = data.results?.consumer_trace
    if (!t) return []
    if ((t.deceased ?? "").toUpperCase() === "Y") return [] // don't contact a deceased consumer

    const nums = t.contact_numbers ?? []
    // Prefer a CELL number, then any other mobile-shaped number.
    const cell = nums.find((n) => (n.type ?? "").toUpperCase() === "CELL" && this.normPhone(n.number ?? ""))
    const anyMobile = nums.map((n) => this.normPhone(n.number ?? "")).find((p): p is string => !!p)
    const phone = (cell ? this.normPhone(cell.number ?? "") : null) ?? anyMobile ?? undefined

    const resi = (t.addresses ?? []).find((a) => (a.type ?? "").toUpperCase() === "RESIDENTIAL") ?? (t.addresses ?? [])[0]
    const address = resi
      ? [resi.address_line_1, resi.postal_code].filter(Boolean).join(", ")
      : undefined

    if (!phone && !address) return []
    return [{
      phone,
      address,
      source: this.mode === "production" ? "verifynow" : "verifynow-sandbox",
      confidence: 0.92, // bureau match on a strong identifier
    }]
  }
}

// ── Provider selection ────────────────────────────────────────────────────────
// TRACE_PROVIDER env picks the adapter. Real providers register here as their
// adapters + credentials land (gate G5). Until then only "stub" is available;
// asking for a real provider fails loudly rather than silently doing nothing.

export function getTraceProvider(getEnv: (k: string) => string | undefined): TraceProvider {
  const name = (getEnv("TRACE_PROVIDER") ?? "stub").toLowerCase()
  switch (name) {
    case "stub":
    case "":
      return new StubTraceProvider()
    case "verifynow":
      return new VerifyNowProvider(getEnv)
    default:
      throw new Error(
        `Trace provider "${name}" is not configured. Available: stub, verifynow. ` +
        `Other bureau adapters plug in behind this same interface.`,
      )
  }
}

/** Pick the highest-confidence candidate, or null. */
export function bestCandidate(candidates: TraceCandidate[]): TraceCandidate | null {
  if (!candidates.length) return null
  return candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a))
}
