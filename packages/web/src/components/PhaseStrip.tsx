import { Check } from 'lucide-react'
import { PHASES } from './PhaseTimeline'

/**
 * PhaseStrip — horizontal compact version of PhaseTimeline. Shows the same 15
 * phases as a single-row strip, sized to fit at the top of a deal detail page.
 * Same source-of-truth logic: completed_milestones (with aliases) plus
 * "current phase implies prior phases done".
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Deal Journey</h3>
        <span className="text-xs text-gray-500">{currentPhase ? `Now: ${PHASES.find(p => p.key === currentPhase)?.name ?? currentPhase}` : '—'}</span>
      </div>
      <ol className="flex items-center overflow-x-auto pb-1">
        {PHASES.map((p, idx) => {
          const completed = isCompleted(idx, p.key, p.milestones)
          const current = currentPhase === p.key
          const next = PHASES[idx + 1]
          const nextCompleted = next ? isCompleted(idx + 1, next.key, next.milestones) : false
          const clickable = !!onPhaseClick

          return (
            <li
              key={p.key}
              className={`flex items-center ${idx < PHASES.length - 1 ? 'flex-1' : ''} min-w-[64px]`}
              title={p.description}
            >
              <button
                type="button"
                onClick={clickable ? () => onPhaseClick?.(p.key) : undefined}
                disabled={!clickable}
                className="flex flex-col items-center gap-1 disabled:cursor-default"
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold transition ${
                    completed
                      ? 'bg-green-500 text-white'
                      : current
                      ? 'bg-indigo-600 text-white animate-pulse ring-4 ring-indigo-100'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <span className={`text-[10px] font-medium leading-tight text-center max-w-[72px] truncate ${
                  current ? 'text-indigo-700' : completed ? 'text-gray-700' : 'text-gray-400'
                }`}>
                  {p.name}
                </span>
              </button>
              {idx < PHASES.length - 1 && (
                <div className={`h-0.5 mx-1 mb-4 flex-1 ${
                  completed && nextCompleted ? 'bg-green-400' : completed ? 'bg-gradient-to-r from-green-400 to-gray-200' : 'bg-gray-200'
                }`} />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
