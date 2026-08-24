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
    this.mode = (getEnv("VERIFYNOW_MODE") ?? "test").toLowerCase()
    if (!this.key) throw new Error("VERIFYNOW_API_KEY not set — cannot run a bureau trace.")
  }

  // Recursively collect string values from the response, so we find contact
  // details regardless of the exact key names VerifyNow uses.
  private collectStrings(o: unknown, out: string[] = []): string[] {
    if (o == null) return out
    if (typeof o === "string") { out.push(o); return out }
    if (Array.isArray(o)) { for (const x of o) this.collectStrings(x, out); return out }
    if (typeof o === "object") { for (const v of Object.values(o)) this.collectStrings(v, out); return out }
    return out
  }

  private normPhone(s: string): string | null {
    const d = s.replace(/[^\d]/g, "")
    if (/^0[6-8]\d{8}$/.test(d)) return "27" + d.slice(1)        // 0XX… → 27XX…
    if (/^27[6-8]\d{8}$/.test(d)) return d                        // already E.164-ish
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
    const data = await res.json()

    // Prefer the ContactData block if present; else scan the whole payload.
    const contactBlock = (data?.ContactData ?? data?.contactData ?? data?.data?.ContactData ?? data)
    const strings = this.collectStrings(contactBlock)

    const phones = [...new Set(strings.map((s) => this.normPhone(s)).filter((p): p is string => !!p))]
    const emails = [...new Set(strings.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))]
    // Address: pull a plausible one from the full payload's AddressData if present.
    const addrStrings = this.collectStrings(data?.AddressData ?? data?.addressData ?? [])
    const address = addrStrings.find((s) => s.length > 12 && /\d/.test(s) && /[a-z]/i.test(s))

    // A trace with a phone is a strong hit; VerifyNow is a bureau, so confidence
    // is high. If a match-score field exists, prefer it.
    const scoreStr = this.collectStrings(data?.DefiniteMatchData ?? {}).find((s) => /^\d{1,3}(\.\d+)?$/.test(s))
    const score = scoreStr ? Math.min(1, Number(scoreStr) / 100) : null

    if (!phones.length && !emails.length) return []
    return [{
      phone: phones[0],
      email: emails[0],
      address,
      source: `verifynow${this.mode === "test" ? "-test" : ""}`,
      confidence: score ?? 0.92,
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
