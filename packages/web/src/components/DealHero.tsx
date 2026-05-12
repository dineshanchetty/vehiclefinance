import { formatDistanceToNow } from 'date-fns'
import { Clock } from 'lucide-react'
import type { DealWithRelations } from '../types/database'

/**
 * DealHero — single thin status bar between the title row and phase strip.
 * Replaces the older 4-stat card. Surfaces the only facts an agent actually
 * scans at a glance: vehicle, buyer, agreed price, time elapsed.
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

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm text-gray-700">
      <Field label="Vehicle" value={vehicle} />
      <span className="h-3 w-px bg-gray-300" aria-hidden="true" />
      <Field label="Buyer" value={buyerName} />
      <span className="h-3 w-px bg-gray-300" aria-hidden="true" />
      <Field label="Price" value={agreedPrice} />
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
        <Clock className="h-3 w-3" /> {elapsed}
      </span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <span className="truncate font-medium text-gray-900" title={value}>{value}</span>
    </span>
  )
}
