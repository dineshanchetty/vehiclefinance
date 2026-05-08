import { Check } from 'lucide-react'

/**
 * PhaseTimeline — vertical, journey-style view of the 15 WesBank Private Deal
 * phases. Renders one row per phase with a status circle (completed / current
 * / pending), a connector line, and the phase name + description.
 *
 * Source of truth for "is phase X done?" is `completedMilestones` (text[] on
 * `deals.completed_milestones`); the current phase comes from
 * `deals.current_phase` (free-form text). Both are passed in to keep the
 * component pure and easily testable.
 */

interface PhaseDef {
  key: string
  name: string
  /** Any one of these milestone names in completed_milestones marks the phase done. */
  milestones: string[]
  description: string
}

// We accept multiple milestone aliases per phase because (a) the bot has
// historically used different verb tenses (uploaded / received / assessed /
// confirmed) and (b) Price Gate has no milestone written — it's derived from
// phase_state.agreed_price by the parent component before passing in.
export const PHASES: PhaseDef[] = [
  { key: 'POPIA_CONSENT',     name: 'POPIA Consent',     milestones: ['popia_consent'],                                          description: 'Buyer agrees to data processing' },
  { key: 'OFFER_TO_PURCHASE', name: 'Offer to Purchase', milestones: ['otp_uploaded', 'otp_confirmed'],                          description: 'Signed OTP uploaded → vehicle, seller, price extracted' },
  { key: 'PRICE_GATE',        name: 'Price Gate',        milestones: ['price_captured', 'price_confirmed', 'price_gate_passed'], description: 'Confirm vehicle price ≥ R30 000' },
  { key: 'ID_DOC',            name: 'ID Document',       milestones: ['id_verified', 'id_confirmed'],                            description: "Buyer's SA ID verified" },
  { key: 'PROOF_OF_ADDRESS',  name: 'Proof of Address',  milestones: ['address_verified', 'poa_verified', 'address_confirmed'],  description: 'Recent address document (≤3 months)' },
  { key: 'BANK_STATEMENTS',   name: 'Bank Statements',   milestones: ['bank_statements_uploaded', 'bank_statements_received', 'bank_statements_verified'], description: '3 months of personal bank statements' },
  { key: 'AFFORDABILITY',     name: 'Affordability',     milestones: ['affordability_confirmed', 'affordability_assessed'],      description: 'Income & expenses assessed' },
  { key: 'SELLER_NOTIFY',     name: 'Seller Notify',     milestones: ['seller_notified', 'seller_invited'],                      description: 'Seller invited to confirm details' },
  { key: 'CREDIT_DECISION',   name: 'Credit Decision',   milestones: ['credit_approved', 'credit_decision_received'],            description: 'WesBank credit team reviews' },
  { key: 'INSPECTION_REVIEW', name: 'Inspection Review', milestones: ['inspection_passed', 'inspection_reviewed'],               description: 'Roadworthy + technical inspection' },
  { key: 'QUOTE',             name: 'Quote',             milestones: ['quote_accepted'],                                         description: 'Finance quote presented to buyer' },
  { key: 'CONTRACT',          name: 'Contract',          milestones: ['contract_signed'],                                        description: 'Finance agreement signed' },
  { key: 'HANDOVER',          name: 'Handover',          milestones: ['handover_confirmed'],                                     description: 'Buyer collects the vehicle' },
  { key: 'PAYOUT',            name: 'Payout',            milestones: ['paid_out'],                                               description: 'WesBank pays the seller' },
  { key: 'DONE',              name: 'Done',              milestones: [],                                                         description: 'Deal closed' },
]

export function phaseDisplayName(phaseKey: string | null | undefined): string {
  if (!phaseKey) return '—'
  const match = PHASES.find((p) => p.key === phaseKey)
  return match ? match.name : phaseKey
}

interface PhaseTimelineProps {
  currentPhase: string | null | undefined
  completedMilestones: string[] | null | undefined
  /** Optional phase_state — used to derive PRICE_GATE done from agreed_price. */
  phaseState?: Record<string, unknown> | null | undefined
  onPhaseClick?: (phase: string) => void
}

export function PhaseTimeline({ currentPhase, completedMilestones, phaseState, onPhaseClick }: PhaseTimelineProps) {
  const milestones = completedMilestones ?? []

  // The "current phase" is also a strong implicit signal: every phase listed
  // BEFORE it in PHASES must already be complete (state machine moves forward
  // only). So we treat any phase whose index is less than the current as done,
  // even if the bot didn't write a milestone string.
  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase)

  const isCompleted = (p: PhaseDef, idx: number): boolean => {
    if (p.key === 'DONE') return currentPhase === 'DONE'
    if (p.milestones.some((m) => milestones.includes(m))) return true
    // PRICE_GATE: derive from phase_state.agreed_price if no milestone was written
    if (p.key === 'PRICE_GATE') {
      const price = (phaseState as { agreed_price?: number } | null | undefined)?.agreed_price
      if (typeof price === 'number' && price >= 30000) return true
    }
    // If we've already moved past this phase, it must be complete
    if (currentIdx > -1 && idx < currentIdx) return true
    return false
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Deal Journey</h3>
      <ol className="relative">
        {PHASES.map((phase, idx) => {
          const completed = isCompleted(phase, idx)
          const current = currentPhase === phase.key
          const next = PHASES[idx + 1]
          const nextCompleted = next ? isCompleted(next, idx + 1) : false
          const connectorGreen = completed && nextCompleted
          const clickable = !!onPhaseClick

          return (
            <li
              key={phase.key}
              className={`relative flex gap-3 pb-5 last:pb-0 ${clickable ? 'cursor-pointer group' : ''}`}
              onClick={clickable ? () => onPhaseClick?.(phase.key) : undefined}
            >
              {/* Connector line */}
              {idx < PHASES.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute left-4 top-8 -ml-px h-full w-0.5 ${connectorGreen ? 'bg-green-400' : 'bg-gray-200'}`}
                />
              )}

              {/* Status circle */}
              <div className="relative flex-shrink-0">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    completed
                      ? 'bg-green-500 text-white'
                      : current
                      ? 'bg-indigo-600 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {completed ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
              </div>

              {/* Right column */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm ${current ? 'font-bold text-gray-900' : 'font-medium text-gray-800'} ${clickable ? 'group-hover:text-indigo-700' : ''}`}>
                    {phase.name}
                  </p>
                  {current && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700">
                      In progress
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-600">{phase.description}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
