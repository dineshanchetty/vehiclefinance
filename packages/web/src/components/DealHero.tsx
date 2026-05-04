import { formatDistanceToNow } from 'date-fns'
import { DollarSign, Car, User, Handshake, Hash, Activity, Clock } from 'lucide-react'
import type { DealWithRelations } from '../types/database'
import { phaseDisplayName, PHASES } from './PhaseTimeline'

/**
 * DealHero — single horizontal hero card at the top of the deal detail page.
 *
 * Reads the new phase-tracking columns (`current_phase`, `phase_state`,
 * `completed_milestones`) which aren't yet in the generated Supabase types,
 * so the deal is widened with a local intersection type for safe access.
 */
type DealWithPhase = DealWithRelations & {
  current_phase?: string | null
  phase_state?: Record<string, unknown> | null
  completed_milestones?: string[] | null
}

interface DealHeroProps {
  deal: DealWithPhase
}

export function DealHero({ deal }: DealHeroProps) {
  const milestones = deal.completed_milestones ?? []
  // 14 phases count toward progress (DONE doesn't add to the bar).
  const TOTAL = PHASES.length - 1
  const completedCount = Math.min(milestones.length, TOTAL)
  const pct = Math.round((completedCount / TOTAL) * 100)

  const elapsed = deal.created_at
    ? formatDistanceToNow(new Date(deal.created_at), { addSuffix: false })
    : '—'

  const phaseState = (deal.phase_state ?? {}) as Record<string, unknown>
  const agreedPriceRaw = phaseState.agreed_price
  const agreedPrice =
    typeof agreedPriceRaw === 'number'
      ? `R ${agreedPriceRaw.toLocaleString()}`
      : '—'

  const v = deal.vehicle
  const vehicle = v
    ? [v.year, v.make, v.model].filter(Boolean).join(' ') || '—'
    : '—'
  const buyerName = deal.buyer?.full_name ?? '—'
  const sellerName = deal.seller?.full_name ?? '—'
  const phaseName = phaseDisplayName(deal.current_phase)
  const isInProgress = !!deal.current_phase && deal.current_phase !== 'DONE'

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-5">
      {/* Top row: progress + columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Progress */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Progress</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{completedCount}</span>
            <span className="text-sm text-gray-500">of {TOTAL}</span>
            <span className="text-xs font-semibold text-blue-600">{pct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Deal id */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            <Hash className="mr-1 inline h-3 w-3" /> Deal
          </p>
          <p className="mt-1 truncate text-base font-semibold text-gray-900">
            #{deal.deal_number ?? deal.id.slice(0, 8)}
          </p>
        </div>

        {/* Current phase */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            <Activity className="mr-1 inline h-3 w-3" /> Current phase
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-gray-900">{phaseName}</p>
            {isInProgress && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">
                In progress
              </span>
            )}
          </div>
        </div>

        {/* Time elapsed */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            <Clock className="mr-1 inline h-3 w-3" /> Time elapsed
          </p>
          <p className="mt-1 text-base font-semibold text-gray-900">{elapsed}</p>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 lg:grid-cols-4">
        <Stat icon={<DollarSign className="h-4 w-4 text-gray-400" />} label="Agreed price" value={agreedPrice} />
        <Stat icon={<Car className="h-4 w-4 text-gray-400" />} label="Vehicle" value={vehicle} />
        <Stat icon={<User className="h-4 w-4 text-gray-400" />} label="Buyer" value={buyerName} />
        <Stat icon={<Handshake className="h-4 w-4 text-gray-400" />} label="Seller" value={sellerName} />
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-900" title={value}>{value}</p>
      </div>
    </div>
  )
}
