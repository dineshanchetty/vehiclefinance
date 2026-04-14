import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow, isPast, differenceInHours } from 'date-fns'

interface SLAIndicatorProps {
  dueAt: string | null
  compact?: boolean
}

type SLAState = 'ok' | 'warning' | 'overdue'

function getSLAState(dueAt: string | null): SLAState {
  if (!dueAt) return 'ok'
  const due = new Date(dueAt)
  if (isPast(due)) return 'overdue'
  const hoursUntilDue = differenceInHours(due, new Date())
  if (hoursUntilDue <= 4) return 'warning'
  return 'ok'
}

export function SLAIndicator({ dueAt, compact = false }: SLAIndicatorProps) {
  const state = getSLAState(dueAt)

  const config = {
    ok: {
      dot: 'bg-green-500',
      text: 'text-green-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      bg: 'bg-green-50',
      border: 'border-green-200',
    },
    warning: {
      dot: 'bg-amber-500',
      text: 'text-amber-700',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
    overdue: {
      dot: 'bg-red-500',
      text: 'text-red-700',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
  }[state]

  if (compact) {
    return (
      <span
        title={dueAt ? `SLA due: ${new Date(dueAt).toLocaleString()}` : 'No SLA set'}
        className={`inline-block h-2.5 w-2.5 rounded-full ${config.dot}`}
      />
    )
  }

  if (!dueAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Clock className="h-3.5 w-3.5" />
        No SLA
      </span>
    )
  }

  const due = new Date(dueAt)
  const label = isPast(due)
    ? `Overdue by ${formatDistanceToNow(due)}`
    : `Due in ${formatDistanceToNow(due)}`

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.text} ${config.bg} ${config.border}`}
    >
      {config.icon}
      {label}
    </span>
  )
}
