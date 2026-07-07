// recovery.ts — Workstream A (affordability-decline upsell) core logic.
//
// Pure, dependency-free functions so they are trivially unit-testable and can
// run identically in an edge function or a test harness. No I/O here.
//
// The model, in one line: from a buyer's disposable income, work out the
// biggest instalment they can safely carry, convert that to a loan via standard
// amortisation, add their deposit — that's the vehicle price they qualify for.

// ── Rate / term configuration ────────────────────────────────────────────────
// Defaults are indicative. Absa supplies the real per-band matrix (gate: rate
// & term matrix in §06 of the scope); until then these are configurable via
// edge-function env so nothing is hard-coded to a guess.

export interface RateConfig {
  /** Fraction of DISPOSABLE income treated as a safe instalment. 0.30 per the
   *  NCR-aligned model used elsewhere in the platform (disposable R4 747 →
   *  safe instalment ≈ R1 400). */
  instalmentToDisposable: number
  /** Nominal annual interest rate as a fraction, e.g. 0.135 = 13.5%. */
  annualRate: number
  /** Loan term in months, e.g. 72. */
  termMonths: number
  /** Minimum vehicle price the bank will finance (Private Deal floor). */
  minVehiclePrice: number
}

export const DEFAULT_RATE_CONFIG: RateConfig = {
  instalmentToDisposable: 0.30,
  annualRate: 0.135,
  termMonths: 72,
  minVehiclePrice: 30000,
}

/** Read a RateConfig from env, falling back to DEFAULT_RATE_CONFIG per field.
 *  Env keys: RECOVERY_INSTALMENT_RATIO, RECOVERY_ANNUAL_RATE,
 *  RECOVERY_TERM_MONTHS, RECOVERY_MIN_VEHICLE_PRICE. */
export function rateConfigFromEnv(
  getEnv: (k: string) => string | undefined,
): RateConfig {
  const n = (k: string, d: number) => {
    const v = getEnv(k)
    if (v === undefined || v === "") return d
    const parsed = Number(v)
    return Number.isFinite(parsed) ? parsed : d
  }
  return {
    instalmentToDisposable: n("RECOVERY_INSTALMENT_RATIO", DEFAULT_RATE_CONFIG.instalmentToDisposable),
    annualRate:             n("RECOVERY_ANNUAL_RATE",      DEFAULT_RATE_CONFIG.annualRate),
    termMonths:             n("RECOVERY_TERM_MONTHS",      DEFAULT_RATE_CONFIG.termMonths),
    minVehiclePrice:        n("RECOVERY_MIN_VEHICLE_PRICE", DEFAULT_RATE_CONFIG.minVehiclePrice),
  }
}

// ── Amortisation ─────────────────────────────────────────────────────────────

/** Present value of a level monthly instalment (an ordinary annuity).
 *  loan = P · (1 − (1+r)^−n) / r ;  handles r = 0 (interest-free) safely. */
export function loanFromInstalment(instalment: number, annualRate: number, termMonths: number): number {
  if (instalment <= 0 || termMonths <= 0) return 0
  const r = annualRate / 12
  if (r === 0) return instalment * termMonths
  return instalment * (1 - Math.pow(1 + r, -termMonths)) / r
}

// ── Qualifying ceiling ───────────────────────────────────────────────────────

export interface CeilingInput {
  /** Monthly disposable income (income − expenses). Preferred input. */
  disposableIncome?: number | null
  /** Monthly gross income — used only as a fallback if disposable is absent
   *  (we then assume a conservative 15% of gross is available for an instalment). */
  monthlyIncome?: number | null
  /** The buyer's deposit, if known. Added on top of the financeable loan. */
  deposit?: number | null
}

export interface CeilingResult {
  qualifies: boolean
  /** Max vehicle price the buyer qualifies for (loan + deposit), rounded down
   *  to the nearest R1 000. null when there is no usable income signal. */
  qualifyingCeiling: number | null
  safeInstalment: number | null
  maxLoan: number | null
  reason: string
}

/** Compute the maximum affordable vehicle price. Rounds the ceiling DOWN to the
 *  nearest R1 000 so the offer is never optimistic. */
export function computeQualifyingCeiling(input: CeilingInput, cfg: RateConfig = DEFAULT_RATE_CONFIG): CeilingResult {
  const disposable = numOrNull(input.disposableIncome)
  const gross = numOrNull(input.monthlyIncome)
  const deposit = Math.max(0, numOrNull(input.deposit) ?? 0)

  // Establish a safe monthly instalment.
  let safeInstalment: number | null = null
  if (disposable !== null && disposable > 0) {
    safeInstalment = disposable * cfg.instalmentToDisposable
  } else if (gross !== null && gross > 0) {
    // Fallback when only gross income is on the declined record: assume 15% of
    // gross is a safe instalment ceiling. Conservative on purpose.
    safeInstalment = gross * 0.15
  }

  if (safeInstalment === null || safeInstalment <= 0) {
    return { qualifies: false, qualifyingCeiling: null, safeInstalment: null, maxLoan: null,
      reason: "No usable income signal on the declined record." }
  }

  const maxLoan = loanFromInstalment(safeInstalment, cfg.annualRate, cfg.termMonths)
  const rawCeiling = maxLoan + deposit
  const ceiling = Math.floor(rawCeiling / 1000) * 1000

  if (ceiling < cfg.minVehiclePrice) {
    return { qualifies: false, qualifyingCeiling: ceiling, safeInstalment, maxLoan,
      reason: `Qualifying amount (R${fmt(ceiling)}) is below the R${fmt(cfg.minVehiclePrice)} finance floor.` }
  }

  return { qualifies: true, qualifyingCeiling: ceiling, safeInstalment, maxLoan,
    reason: `Qualifies for up to R${fmt(ceiling)} at ${(cfg.annualRate * 100).toFixed(1)}% over ${cfg.termMonths} months.` }
}

// ── Upsell offer composition (A2) ────────────────────────────────────────────
// Compose the WhatsApp re-engagement message. Sending is a separate concern
// (outbound requires an approved template — gate G2); this only builds the text
// and the affordable-band search parameters.

export interface OfferInput {
  fullName?: string | null
  originalPrice?: number | null
  qualifyingCeiling: number
  make?: string | null
  model?: string | null
}

export interface UpsellOffer {
  message: string
  /** Params to hand to the cars-alternatives function for band-correct links. */
  searchParams: { make?: string; model?: string; max_price: number; min_price: number }
}

export function composeUpsellOffer(input: OfferInput): UpsellOffer {
  const first = (input.fullName ?? "").trim().split(/\s+/)[0] || "there"
  const ceiling = input.qualifyingCeiling
  const orig = numOrNull(input.originalPrice)

  const opener = orig && orig > ceiling
    ? `Hi ${first} — your recent vehicle finance application for R${fmt(orig)} wasn't approved at that amount, but there's good news: you pre-qualify for up to *R${fmt(ceiling)}*.`
    : `Hi ${first} — good news on your vehicle finance: you pre-qualify for up to *R${fmt(ceiling)}*.`

  const message =
    `${opener}\n\n` +
    `Here are vehicles in your range on cars.co.za 🚗 — pick one and we'll take your new application straight back to the bank.`

  return {
    message,
    searchParams: {
      make: input.make ?? undefined,
      model: input.model ?? undefined,
      min_price: Math.max(0, Math.floor(ceiling * 0.55 / 1000) * 1000), // sensible band floor
      max_price: ceiling,
    },
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function numOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return Number.isFinite(v) ? v : null
}
function fmt(n: number): string {
  // Deterministic thousands grouping with a regular space (no locale — avoids
  // non-breaking-space surprises across runtimes).
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}
