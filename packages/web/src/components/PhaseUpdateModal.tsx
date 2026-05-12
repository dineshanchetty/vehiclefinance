import { useState } from 'react'
import { X, Check, Loader2, AlertCircle } from 'lucide-react'
import { PHASES } from './PhaseTimeline'
import { supabase } from '../lib/supabase'

/**
 * PhaseUpdateModal — set a deal's current_phase + manage completed_milestones.
 * Clicking a phase name jumps the deal to that phase. Clicking the milestone
 * row toggles whether it's marked done. All writes audit-log.
 */
export function PhaseUpdateModal({
  dealId,
  currentPhase,
  completedMilestones,
  onClose,
  onChanged,
}: {
  dealId: string
  currentPhase: string | null
  completedMilestones: string[]
  onClose: () => void
  onChanged: (next: { current_phase: string | null; completed_milestones: string[] }) => void
}) {
  const [busy, setBusy] = useState<string | null>(null) // action key
  const [err, setErr] = useState<string | null>(null)
  const [phase, setPhase] = useState<string | null>(currentPhase)
  const [milestones, setMilestones] = useState<string[]>(completedMilestones)

  async function commit(next: { phase?: string | null; milestones?: string[] }, key: string) {
    setBusy(key); setErr(null)
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (next.phase !== undefined) patch.current_phase = next.phase
      if (next.milestones !== undefined) patch.completed_milestones = next.milestones
      const { error } = await supabase.from('deals').update(patch as never).eq('id', dealId)
      if (error) throw error

      // Audit
      await supabase.from('audit_events').insert({
        deal_id: dealId,
        event_type: 'ops_phase_changed',
        actor_type: 'ops_user',
        details: {
          from_phase: currentPhase,
          to_phase: next.phase ?? phase,
          milestones: next.milestones ?? milestones,
        },
      } as never)

      const newState = {
        current_phase: next.phase !== undefined ? next.phase : phase,
        completed_milestones: next.milestones !== undefined ? next.milestones : milestones,
      }
      onChanged(newState)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed')
    } finally { setBusy(null) }
  }

  async function handleSetPhase(phaseKey: string) {
    setPhase(phaseKey)
    await commit({ phase: phaseKey }, `phase:${phaseKey}`)
  }

  async function handleToggleMilestone(milestone: string) {
    if (!milestone) return
    const isOn = milestones.includes(milestone)
    const next = isOn
      ? milestones.filter((m) => m !== milestone)
      : [...milestones, milestone]
    setMilestones(next)
    await commit({ milestones: next }, `ms:${milestone}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Update phase</h3>
            <p className="text-xs text-gray-500 mt-0.5">Click a phase to make it current. Tick milestones individually.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        {err && (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <ol className="space-y-1">
            {PHASES.map((p, idx) => {
              const isCurrent = phase === p.key
              const matchesMilestone = p.milestones.find((m) => milestones.includes(m))
              const isDone = !!matchesMilestone
              const phaseBusy = busy === `phase:${p.key}`
              const msBusy = !!p.milestones.find((m) => busy === `ms:${m}`)
              const primaryMilestone = p.milestones[0]
              return (
                <li
                  key={p.key}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    isCurrent ? 'border-wesbank-navy/30 bg-wesbank-navy/5/40' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {/* Step number / checkmark */}
                  <button
                    type="button"
                    onClick={() => primaryMilestone && handleToggleMilestone(matchesMilestone ?? primaryMilestone)}
                    disabled={!primaryMilestone || msBusy}
                    title={primaryMilestone ? (isDone ? 'Click to un-mark milestone' : 'Click to mark milestone done') : 'No milestone for this phase'}
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition ${
                      isDone ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : isCurrent ? 'bg-wesbank-navy text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {msBusy ? <Loader2 className="h-3 w-3 animate-spin" />
                      : isDone ? <Check className="h-3.5 w-3.5" />
                      : idx + 1}
                  </button>

                  {/* Phase name + description */}
                  <button
                    type="button"
                    onClick={() => handleSetPhase(p.key)}
                    disabled={isCurrent || phaseBusy}
                    className="flex-1 text-left disabled:cursor-default"
                  >
                    <p className={`text-sm font-medium ${isCurrent ? 'text-wesbank-navy-darker' : 'text-gray-900'}`}>
                      {p.name}
                      {isCurrent && <span className="ml-2 text-[10px] uppercase tracking-wide rounded-full bg-wesbank-navy/20 text-wesbank-navy-dark px-1.5 py-0.5">current</span>}
                      {isDone && !isCurrent && <span className="ml-2 text-[10px] uppercase tracking-wide rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5">done</span>}
                    </p>
                    <p className="text-[11px] text-gray-500">{p.description}</p>
                  </button>

                  {/* Set-current shortcut button (visible when not current) */}
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleSetPhase(p.key)}
                      disabled={phaseBusy}
                      className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-white"
                    >
                      {phaseBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Jump here'}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-3 rounded-b-xl">
          <p className="text-[10px] text-gray-500">
            {milestones.length}/{PHASES.length - 1} milestones complete
          </p>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
