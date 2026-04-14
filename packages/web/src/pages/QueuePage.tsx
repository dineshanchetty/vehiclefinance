import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { User, ArrowUpCircle, CheckCircle2, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { StatusBadge } from '../components/StatusBadge'
import { SLAIndicator } from '../components/SLAIndicator'
import type { Task, QueueName, TaskPriority } from '../types/database'

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

// ─── Mock data ───────────────────────────────────────────────────────────────

function makeMockTasks(queue: string): Task[] {
  const base = [
    { id: '1', deal_number: 'VF-2024-001', buyer: 'Sipho Dlamini',    title: 'Review ID document',         priority: 'HIGH' as TaskPriority,   due_offset: 2_700_000 },
    { id: '2', deal_number: 'VF-2024-002', buyer: 'Naledi Mokoena',   title: 'Verify payslip income',      priority: 'URGENT' as TaskPriority,  due_offset: -1_800_000 },
    { id: '3', deal_number: 'VF-2024-006', buyer: 'Mpho Radebe',      title: 'Check proof of address',     priority: 'MEDIUM' as TaskPriority,  due_offset: 86_400_000 },
    { id: '4', deal_number: 'VF-2024-009', buyer: 'Zanele Moyo',      title: 'Review bank statement',      priority: 'LOW' as TaskPriority,     due_offset: 172_800_000 },
    { id: '5', deal_number: 'VF-2024-011', buyer: 'Thabo Sithole',    title: 'Income verification flag',   priority: 'CRITICAL' as TaskPriority, due_offset: -7_200_000 },
  ]

  return base.map((b) => ({
    id: `${queue}-${b.id}`,
    deal_id: b.id,
    queue: queue as QueueName,
    status: b.priority === 'CRITICAL' ? 'ESCALATED' : b.priority === 'URGENT' ? 'IN_PROGRESS' : 'PENDING',
    priority: b.priority,
    title: b.title,
    description: null,
    assigned_to: b.priority === 'URGENT' || b.priority === 'CRITICAL' ? 'agent1' : null,
    assigned_at: b.priority === 'URGENT' ? new Date(Date.now() - 3_600_000).toISOString() : null,
    due_at: new Date(Date.now() + b.due_offset).toISOString(),
    completed_at: null,
    escalated_at: b.priority === 'CRITICAL' ? new Date(Date.now() - 1_800_000).toISOString() : null,
    escalation_reason: b.priority === 'CRITICAL' ? 'Credit score mismatch detected' : null,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 3_600_000).toISOString(),
    deal: {
      deal_number: b.deal_number,
      status: 'DOCS_REVIEW',
      buyer: { id: b.id, first_name: b.buyer.split(' ')[0], last_name: b.buyer.split(' ')[1] ?? '', id_number: '', phone: '', email: null, date_of_birth: null, employment_type: null, employer_name: null, monthly_income: null, monthly_expenses: null, credit_score: null, address: null, created_at: '', updated_at: '' },
      vehicle: { id: 'v', make: 'Toyota', model: 'Corolla', year: 2019, colour: null, vin: null, registration_number: null, odometer_km: null, engine_number: null, transmission: null, fuel_type: null, asking_price: null, agreed_price: null, created_at: '', updated_at: '' },
    },
  }))
}

// ─── Priority ordering ───────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  CRITICAL: 0, URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4,
}

const priorityColor: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600', MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-800', URGENT: 'bg-red-100 text-red-800',
  CRITICAL: 'bg-red-200 text-red-900 font-semibold',
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QueuePage() {
  const { queueName } = useParams<{ queueName: string }>()
  const navigate = useNavigate()
  const queue = queueName ?? 'Q_BUYER_DOC_REVIEW'
  const meta = QUEUE_META[queue] ?? { label: queue.replace(/^Q_/, '').replace(/_/g, ' '), description: '' }

  const [tasks, setTasks] = useState<Task[]>(() => makeMockTasks(queue))
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')

  useEffect(() => {
    setTasks(makeMockTasks(queue))
    setLoading(true)

    const run = async () => {
      try {
        const { data } = await supabase
          .from('tasks')
          .select('*, deal:deals(deal_number, status, buyer:buyers(*), vehicle:vehicles(*))')
          .eq('queue', queue)
          .neq('status', 'COMPLETED')
          .order('created_at', { ascending: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data && data.length > 0) setTasks(data as any as Task[])
      } catch { /* stay on mock */ } finally {
        setLoading(false)
      }
    }
    run()
  }, [queue])

  const claim = (id: string) => {
    setTasks((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: 'IN_PROGRESS', assigned_to: 'me', assigned_at: new Date().toISOString() } : t
    ))
  }

  const complete = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const escalate = (id: string) => {
    setTasks((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: 'ESCALATED', escalated_at: new Date().toISOString() } : t
    ))
  }

  const filtered = tasks
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) => !priorityFilter || t.priority === priorityFilter)
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 9
      const pb = PRIORITY_ORDER[b.priority] ?? 9
      if (pa !== pb) return pa - pb
      // SLA ascending
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
        <h1 className="text-xl font-bold text-gray-900">{meta.label}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{meta.description}</p>

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
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">Loading…</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
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
                        {task.deal.buyer.first_name} {task.deal.buyer.last_name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-gray-900">{task.title}</p>
                    {task.escalation_reason && (
                      <p className="mt-0.5 text-xs text-red-600">{task.escalation_reason}</p>
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
                          onClick={() => claim(task.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          <User className="h-3.5 w-3.5" /> Claim
                        </button>
                      )}
                      {task.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => complete(task.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                        </button>
                      )}
                      {task.status !== 'ESCALATED' && (
                        <button
                          onClick={() => escalate(task.id)}
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
