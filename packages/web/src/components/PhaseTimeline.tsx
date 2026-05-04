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
  milestone: string | null
  description: string
}

export const PHASES: PhaseDef[] = [
  { key: 'POPIA_CONSENT',     name: 'POPIA Consent',       milestone: 'popia_consent',           description: 'Buyer agrees to data processing' },
  { key: 'OFFER_TO_PURCHASE', name: 'Offer to Purchase',   milestone: 'otp_uploaded',            description: 'Signed OTP uploaded → vehicle, seller, price extracted' },
  { key: 'PRICE_GATE',        name: 'Price Gate',          milestone: 'price_captured',          description: 'Confirm vehicle price ≥ R30 000' },
  { key: 'ID_DOC',            name: 'ID Document',         milestone: 'id_verified',             description: "Buyer's SA ID verified" },
  { key: 'PROOF_OF_ADDRESS',  name: 'Proof of Address',    milestone: 'address_verified',        description: 'Recent address document (≤3 months)' },
  { key: 'BANK_STATEMENTS',   name: 'Bank Statements',     milestone: 'bank_statements_received', description: '3 months of personal bank statements' },
  { key: 'AFFORDABILITY',     name: 'Affordability',       milestone: 'affordability_assessed',  description: 'Income & expenses assessed' },
  { key: 'SELLER_NOTIFY',     name: 'Seller Notify',       milestone: 'seller_notified',         description: 'Seller invited to confirm details' },
  { key: 'CREDIT_DECISION',   name: 'Credit Decision',     milestone: 'credit_approved',         description: 'WesBank credit team reviews' },
  { key: 'INSPECTION_REVIEW', name: 'Inspection Review',   milestone: 'inspection_passed',       description: 'Roadworthy + technical inspection' },
  { key: 'QUOTE',             name: 'Quote',               milestone: 'quote_accepted',          description: 'Finance quote presented to buyer' },
  { key: 'CONTRACT',          name: 'Contract',            milestone: 'contract_signed',         description: 'Finance agreement signed' },
  { key: 'HANDOVER',          name: 'Handover',            milestone: 'handover_confirmed',      description: 'Buyer collects the vehicle' },
  { key: 'PAYOUT',            name: 'Payout',              milestone: 'paid_out',                description: 'WesBank pays the seller' },
  { key: 'DONE',              name: 'Done',                milestone: null,                      description: 'Deal closed' },
]

export function phaseDisplayName(phaseKey: string | null | undefined): string {
  if (!phaseKey) return '—'
  const match = PHASES.find((p) => p.key === phaseKey)
  return match ? match.name : phaseKey
}

interface PhaseTimelineProps {
  currentPhase: string | null | undefined
  completedMilestones: string[] | null | undefined
  onPhaseClick?: (phase: string) => void
}

export function PhaseTimeline({ currentPhase, completedMilestones, onPhaseClick }: PhaseTimelineProps) {
  const milestones = completedMilestones ?? []

  const isCompleted = (p: PhaseDef): boolean => {
    if (p.key === 'DONE') return currentPhase === 'DONE'
    return p.milestone ? milestones.includes(p.milestone) : false
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Deal Journey</h3>
      <ol className="relative">
        {PHASES.map((phase, idx) => {
          const completed = isCompleted(phase)
          const current = currentPhase === phase.key
          const next = PHASES[idx + 1]
          const nextCompleted = next ? isCompleted(next) : false
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
                      ? 'bg-blue-600 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {completed ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
              </div>

              {/* Right column */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm ${current ? 'font-bold text-gray-900' : 'font-medium text-gray-800'} ${clickable ? 'group-hover:text-blue-700' : ''}`}>
                    {phase.name}
                  </p>
                  {current && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">
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
