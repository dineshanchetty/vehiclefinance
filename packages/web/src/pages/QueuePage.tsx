import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { User, ArrowUpCircle, CheckCircle2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { StatusBadge } from '../components/StatusBadge'
import { SLAIndicator } from '../components/SLAIndicator'
import { listTasks, claimTask, completeTask, escalateTask } from '../lib/queries'
import { useRealtimeTable } from '../lib/realtime'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/auth'
import type { Task, TaskWithDeal, TaskPriority } from '../types/database'

// Queue names used by the bot + web portal. Not an enum in the DB — queue is
// a free-text column on `tasks`.
type QueueName =
  | 'Q_BUYER_DOC_REVIEW' | 'Q_SELLER_DOC_REVIEW' | 'Q_SELLER_PHOTO_REVIEW'
  | 'Q_FNI_REVIEW' | 'Q_FNI_QUOTE_PREP' | 'Q_HARTCON_INSPECTION'
  | 'Q_SELLER_CONTRACT' | 'Q_BUYER_CONTRACT' | 'Q_DEAL_APPROVAL'
  | 'Q_NATIS_COLLECTION' | 'Q_NATIS_FULFILMENT' | 'Q_MISMATCH_REVIEW'
  | 'Q_HUMAN_ESCALATION' | 'Q_SELLER_FOLLOWUP'

// ─── Queue metadata ─────────────────────────────────────────────────────────

const QUEUE_META: Record<string, { label: string; description: string }> = {
  Q_BUYER_DOC_REVIEW:    { label: 'Buyer Document Review',    description: 'Review and verify uploaded buyer documents' },
  Q_SELLER_DOC_REVIEW:   { label: 'Seller Document Review',   description: 'Review and verify uploaded seller documents' },
  Q_SELLER_PHOTO_REVIEW: { label: 'Seller Photo Review',      description: 'Review vehicle photo sets submitted by sellers' },
  Q_FNI_REVIEW:          { label: 'F&I Review',               description: 'Finance & Insurance credit and deal review' },
  Q_FNI_QUOTE_PREP:      { label: 'F&I Quote Preparation',    description: 'Prepare and send financing quotes to buyers' },
  Q_HARTCON_INSPECTION:  { label: 'Hartcon Inspections',      description: 'Schedule and manage Hartcon vehicle inspections' },
  Q_SELLER_CONTRACT:     { label: 'Seller Contracts',         description: 'Generate and manage seller contracts' },
  Q_BUYER_CONTRACT:      { label: 'Buyer Contracts',          description: 'Generate and manage buyer contracts' },
  Q_DEAL_APPROVAL:       { label: 'Deal Approvals',           description: 'Final deal approval workflow' },
  Q_NATIS_COLLECTION:    { label: 'NATIS Collection',         description: 'Coordinate NATIS document collection' },
  Q_NATIS_FULFILMENT:    { label: 'NATIS Fulfilment',         description: 'Track and complete NATIS registration transfers' },
  Q_MISMATCH_REVIEW:     { label: 'Mismatch Review',          description: 'Review data mismatches flagged by AI' },
  Q_HUMAN_ESCALATION:    { label: 'Human Escalations',        description: 'Tasks escalated for human intervention' },
  Q_SELLER_FOLLOWUP:     { label: 'Seller Follow-up',         description: 'Follow up with sellers on outstanding items' },
}

// Real task_priority enum: LOW | NORMAL | HIGH | URGENT.
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3,
}

const priorityColor: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600', NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-800', URGENT: 'bg-red-100 text-red-800',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QueuePage() {
  const { queueName } = useParams<{ queueName: string }>()
  const navigate = useNavigate()
  const queue = queueName ?? 'Q_BUYER_DOC_REVIEW'
  const meta = QUEUE_META[queue] ?? { label: queue.replace(/^Q_/, '').replace(/_/g, ' '), description: '' }
  const profile = useProfile()

  const [tasks, setTasks] = useState<TaskWithDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listTasks({
        queue: queue as QueueName,
        excludeCompleted: true,
        limit: 100,
      })
      setTasks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [queue])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Realtime: append new tasks for this queue. The realtime payload is a
  // plain `tasks` row (no deal join), so widen to TaskWithDeal with deal=null.
  useRealtimeTable<Task>(
    'tasks',
    { column: 'queue', value: queue },
    (newTask) => {
      setTasks((prev) => {
        // Avoid duplicates
        if (prev.some((t) => t.id === newTask.id)) return prev
        return [{ ...newTask, deal: null } as TaskWithDeal, ...prev]
      })
    },
  )

  const handleClaim = async (id: string) => {
    try {
      // Real user UUID is required — the tasks.assigned_to column is uuid.
      let agentId = profile?.id ?? null
      if (!agentId) {
        const { data } = await supabase.auth.getUser()
        agentId = data.user?.id ?? null
      }
      if (!agentId) {
        alert('No authenticated user — cannot claim task')
        return
      }
      const updated = await claimTask(id, agentId)
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updated } : t))
    } catch { alert('Failed to claim task') }
  }

  const handleComplete = async (id: string) => {
    try {
      await completeTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    } catch { alert('Failed to complete task') }
  }

  const handleEscalate = async (id: string) => {
    try {
      const updated = await escalateTask(id)
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updated } : t))
    } catch { alert('Failed to escalate task') }
  }

  const filtered = tasks
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) => !priorityFilter || t.priority === priorityFilter)
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 9
      const pb = PRIORITY_ORDER[b.priority] ?? 9
      if (pa !== pb) return pa - pb
      const da = a.due_at ? new Date(a.due_at).getTime() : Infinity
      const db = b.due_at ? new Date(b.due_at).getTime() : Infinity
      return da - db
    })

  const counts = {
    total: tasks.length,
    escalated: tasks.filter((t) => t.status === 'ESCALATED').length,
    overdue: tasks.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{meta.label}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{meta.description}</p>
          </div>
          <button
            onClick={fetchTasks}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="mt-3 flex flex-wrap gap-3">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {counts.total} total
          </span>
          {counts.overdue > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              {counts.overdue} overdue
            </span>
          )}
          {counts.escalated > 0 && (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
              {counts.escalated} escalated
            </span>
          )}
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
            Live
          </span>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-6 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ESCALATED">Escalated</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-6 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={fetchTasks} className="ml-auto text-sm font-medium text-red-700 underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deal #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Task</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">SLA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned To</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-gray-300" />
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    No tasks in this queue.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((task) => (
                <tr
                  key={task.id}
                  className={`hover:bg-gray-50/50 transition-colors ${
                    task.status === 'ESCALATED' ? 'bg-red-50/30' : ''
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => navigate(`/deals/${task.deal_id}`)}
                      className="flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900"
                    >
                      {task.deal?.deal_number ?? task.deal_id}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </button>
                    {task.deal?.buyer && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {task.deal.buyer.full_name ?? '—'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-gray-900">{task.task_type}</p>
                    {task.status === 'ESCALATED' && task.notes && (
                      <p className="mt-0.5 text-xs text-red-600">{task.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor[task.priority]}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={task.status} variant="sm" />
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {format(new Date(task.created_at), 'dd MMM HH:mm')}
                  </td>
                  <td className="px-4 py-3.5">
                    <SLAIndicator dueAt={task.due_at ?? null} />
                  </td>
                  <td className="px-4 py-3.5">
                    {task.assigned_to
                      ? <span className="flex items-center gap-1 text-xs text-gray-700">
                          <User className="h-3.5 w-3.5 text-gray-400" />
                          {task.assigned_to}
                        </span>
                      : <span className="text-xs text-gray-400">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      {task.status === 'PENDING' && (
                        <button
                          onClick={() => handleClaim(task.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          <User className="h-3.5 w-3.5" /> Claim
                        </button>
                      )}
                      {task.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => handleComplete(task.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                        </button>
                      )}
                      {task.status !== 'ESCALATED' && (
                        <button
                          onClick={() => handleEscalate(task.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <ArrowUpCircle className="h-3.5 w-3.5" /> Escalate
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/deals/${task.deal_id}`)}
                        className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        View Deal
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
