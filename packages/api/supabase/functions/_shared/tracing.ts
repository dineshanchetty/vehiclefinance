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
    // case "transunion": return new TransUnionProvider(getEnv)   // G5
    // case "xds":        return new XDSProvider(getEnv)          // G5
    // case "experian":   return new ExperianProvider(getEnv)     // G5
    default:
      throw new Error(
        `Trace provider "${name}" is not yet configured. Available: stub. ` +
        `Real bureau/tracing adapters plug in under scope gate G5.`,
      )
  }
}

/** Pick the highest-confidence candidate, or null. */
export function bestCandidate(candidates: TraceCandidate[]): TraceCandidate | null {
  if (!candidates.length) return null
  return candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a))
}
