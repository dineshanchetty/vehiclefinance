import { Check } from 'lucide-react'
import { PHASES } from './PhaseTimeline'

/**
 * PhaseStrip — compact horizontal journey strip. 6px dots for non-current
 * phases, ~16px dot for the current one. Only the current phase shows a label
 * below the strip; everything else surfaces full phase name on hover.
 */
interface PhaseStripProps {
  currentPhase: string | null | undefined
  completedMilestones: string[] | null | undefined
  phaseState?: Record<string, unknown> | null | undefined
  onPhaseClick?: (phaseKey: string) => void
}

export function PhaseStrip({ currentPhase, completedMilestones, phaseState, onPhaseClick }: PhaseStripProps) {
  const milestones = completedMilestones ?? []
  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase)

  const isCompleted = (idx: number, key: string, milestoneList: string[]): boolean => {
    if (key === 'DONE') return currentPhase === 'DONE'
    if (milestoneList.some((m) => milestones.includes(m))) return true
    if (key === 'PRICE_GATE') {
      const price = (phaseState as { agreed_price?: number } | null | undefined)?.agreed_price
      if (typeof price === 'number' && price >= 30000) return true
    }
    if (currentIdx > -1 && idx < currentIdx) return true
    return false
  }

  const currentName = currentPhase
    ? PHASES.find((p) => p.key === currentPhase)?.name ?? currentPhase
    : null

  return (
    <ol className="flex items-center">
      {PHASES.map((p, idx) => {
        const completed = isCompleted(idx, p.key, p.milestones)
        const current = currentPhase === p.key
        const next = PHASES[idx + 1]
        const nextCompleted = next ? isCompleted(idx + 1, next.key, next.milestones) : false
        const clickable = !!onPhaseClick

        return (
          <li
            key={p.key}
            className={`flex items-center ${idx < PHASES.length - 1 ? 'flex-1' : ''}`}
            title={p.name}
          >
            <button
              type="button"
              onClick={clickable ? () => onPhaseClick?.(p.key) : undefined}
              disabled={!clickable}
              aria-label={p.name}
              className="relative flex flex-col items-center disabled:cursor-default group"
            >
              {current ? (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-claimtec-gold text-claimtec-forest ring-2 ring-claimtec-forest">
                  <span className="h-1.5 w-1.5 rounded-full bg-claimtec-forest" />
                </div>
              ) : completed ? (
                <div className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="h-2 w-2" strokeWidth={4} />
                </div>
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-gray-300 group-hover:bg-gray-400" />
              )}
              {current && currentName && (
                <span className="absolute top-full mt-1.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-claimtec-forest">
                  {currentName}
                </span>
              )}
            </button>
            {idx < PHASES.length - 1 && (
              <div className={`h-px flex-1 mx-1 ${
                completed && nextCompleted ? 'bg-claimtec-forest' : completed ? 'bg-gradient-to-r from-claimtec-forest to-gray-200' : 'bg-gray-200'
              }`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
