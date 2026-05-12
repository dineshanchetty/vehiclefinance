import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { StickyNote, Plus, Send, Loader2, CheckCircle2 } from 'lucide-react'
import {
  listOpsNotes, createOpsNote, createTask, listTasks,
  type OpsNote, type TaskWriteInput,
} from '../lib/queries'
import type { TaskWithDeal } from '../types/database'
import { useProfile } from '../lib/auth'

/**
 * NotesAndTasksPanel — quick-action surface on the deal Overview tab.
 * Two side-by-side cards: free-form ops notes (logged to audit_events),
 * and a quick-task creator (writes to tasks table).
 */
export function NotesAndTasksPanel({ dealId }: { dealId: string }) {
  const profile = useProfile()
  const [notes, setNotes] = useState<OpsNote[]>([])
  const [tasks, setTasks] = useState<TaskWithDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [taskDraft, setTaskDraft] = useState<TaskWriteInput>({
    task_type: '', priority: 'NORMAL', notes: '', due_at: null,
  })
  const [savingTask, setSavingTask] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() {
    try {
      const [n, t] = await Promise.all([
        listOpsNotes(dealId),
        listTasks({ dealId, limit: 20, excludeCompleted: false }),
      ])
      setNotes(n)
      setTasks(t)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId])

  async function handleAddNote() {
    if (!noteDraft.trim() || savingNote) return
    setSavingNote(true)
    setErr(null)
    try {
      await createOpsNote(dealId, noteDraft.trim(), profile?.id ?? null)
      setNoteDraft('')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save note')
    } finally {
      setSavingNote(false)
    }
  }

  async function handleCreateTask() {
    if (!taskDraft.task_type.trim() || savingTask) return
    setSavingTask(true)
    setErr(null)
    try {
      await createTask(dealId, {
        ...taskDraft,
        task_type: taskDraft.task_type.trim(),
        notes: taskDraft.notes?.trim() || null,
        due_at: taskDraft.due_at || null,
        assigned_to: profile?.id ?? null,
      })
      setTaskDraft({ task_type: '', priority: 'NORMAL', notes: '', due_at: null })
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create task')
    } finally {
      setSavingTask(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Notes & Tasks</h3>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      </div>
      {err && (
        <div className="mb-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Notes column */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            <StickyNote className="h-3.5 w-3.5" /> Ops notes
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-2 max-h-56 overflow-y-auto space-y-2">
            {notes.length === 0 ? (
              <p className="text-xs text-gray-400 italic px-1 py-2">No notes yet.</p>
            ) : notes.map((n) => (
              <div key={n.id} className="rounded-md bg-white border border-gray-100 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-2 text-[10px] text-gray-400">
                  <span>{n.actor ? n.actor.slice(0, 8) : 'system'}</span>
                  <span>{format(new Date(n.created_at), 'dd MMM HH:mm')}</span>
                </div>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{n.details?.body ?? '—'}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note for the team…"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote()
              }}
              className="flex-1 text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 focus:border-wesbank-navy focus:outline-none resize-none"
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={!noteDraft.trim() || savingNote}
              title="⌘+Enter to send"
              className="inline-flex items-center gap-1 rounded-lg bg-gray-900 hover:bg-gray-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>
        </div>

        {/* Tasks column */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            <Plus className="h-3.5 w-3.5" /> Quick task
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-2 max-h-56 overflow-y-auto space-y-1.5">
            {tasks.length === 0 ? (
              <p className="text-xs text-gray-400 italic px-1 py-2">No tasks on this deal.</p>
            ) : tasks.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-baseline gap-2 rounded-md bg-white border border-gray-100 px-2.5 py-1.5 text-xs">
                {t.status === 'COMPLETED'
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  : <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                      t.priority === 'URGENT' ? 'bg-rose-500'
                      : t.priority === 'HIGH' ? 'bg-amber-500'
                      : 'bg-gray-300'
                    }`} />}
                <span className="flex-1 truncate text-gray-800">{t.task_type ?? 'Task'}</span>
                <span className="text-[10px] text-gray-400 uppercase">{t.status}</span>
                {t.due_at && (
                  <span className="text-[10px] text-gray-500">due {format(new Date(t.due_at), 'dd MMM')}</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            <input
              type="text"
              placeholder="Task type / title (e.g. CALL_BUYER, REVIEW_STATEMENTS)"
              value={taskDraft.task_type}
              onChange={(e) => setTaskDraft({ ...taskDraft, task_type: e.target.value })}
              className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 focus:border-wesbank-navy focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={taskDraft.priority}
                onChange={(e) => setTaskDraft({ ...taskDraft, priority: e.target.value as TaskWriteInput['priority'] })}
                className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:border-wesbank-navy focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <input
                type="date"
                value={taskDraft.due_at ?? ''}
                onChange={(e) => setTaskDraft({ ...taskDraft, due_at: e.target.value || null })}
                className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:border-wesbank-navy focus:outline-none"
              />
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={taskDraft.notes ?? ''}
              onChange={(e) => setTaskDraft({ ...taskDraft, notes: e.target.value })}
              rows={2}
              className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 focus:border-wesbank-navy focus:outline-none resize-none"
            />
            <button
              type="button"
              onClick={handleCreateTask}
              disabled={!taskDraft.task_type.trim() || savingTask}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-wesbank-navy hover:bg-wesbank-navy-dark px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {savingTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create task
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
