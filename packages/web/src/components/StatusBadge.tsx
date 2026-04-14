import type { DealStatus, TaskStatus, TaskPriority, ContractStatus, QuoteStatus, InspectionStatus, NATISStatus, PhotoStatus } from '../types/database'

type BadgeVariant = 'default' | 'sm'

type StatusValue =
  | DealStatus
  | TaskStatus
  | TaskPriority
  | ContractStatus
  | QuoteStatus
  | InspectionStatus
  | NATISStatus
  | PhotoStatus
  | string

const colorMap: Record<string, string> = {
  // Deal statuses
  LEAD:                 'bg-slate-100 text-slate-700',
  DOCS_PENDING:         'bg-yellow-100 text-yellow-800',
  DOCS_REVIEW:          'bg-blue-100 text-blue-800',
  FNI_REVIEW:           'bg-indigo-100 text-indigo-800',
  QUOTE_PENDING:        'bg-purple-100 text-purple-800',
  QUOTE_SENT:           'bg-violet-100 text-violet-800',
  QUOTE_ACCEPTED:       'bg-teal-100 text-teal-800',
  INSPECTION_PENDING:   'bg-orange-100 text-orange-800',
  INSPECTION_COMPLETE:  'bg-cyan-100 text-cyan-800',
  CONTRACT_PENDING:     'bg-amber-100 text-amber-800',
  CONTRACT_SIGNED:      'bg-emerald-100 text-emerald-800',
  NATIS_PENDING:        'bg-sky-100 text-sky-800',
  NATIS_COMPLETE:       'bg-green-100 text-green-800',
  SETTLED:              'bg-green-200 text-green-900',
  CANCELLED:            'bg-gray-200 text-gray-600',
  DECLINED:             'bg-red-100 text-red-800',

  // Generic
  PENDING:              'bg-yellow-100 text-yellow-800',
  IN_PROGRESS:          'bg-blue-100 text-blue-800',
  COMPLETED:            'bg-green-100 text-green-800',
  ESCALATED:            'bg-red-100 text-red-800',
  APPROVED:             'bg-green-100 text-green-800',
  REJECTED:             'bg-red-100 text-red-800',
  UPLOADED:             'bg-blue-100 text-blue-800',
  UNDER_REVIEW:         'bg-indigo-100 text-indigo-800',
  EXPIRED:              'bg-gray-200 text-gray-600',
  RE_UPLOAD_REQUESTED:  'bg-orange-100 text-orange-800',

  // Contract / Quote
  DRAFT:                'bg-slate-100 text-slate-700',
  SENT:                 'bg-blue-100 text-blue-800',
  VIEWED:               'bg-indigo-100 text-indigo-800',
  SIGNED:               'bg-green-100 text-green-800',

  // Inspection / NATIS
  SCHEDULED:            'bg-sky-100 text-sky-800',
  FAILED:               'bg-red-200 text-red-900',
  SUBMITTED:            'bg-blue-100 text-blue-800',
  PROCESSING:           'bg-indigo-100 text-indigo-800',
  COMPLETE:             'bg-green-100 text-green-800',

  // Priority
  LOW:                  'bg-slate-100 text-slate-600',
  MEDIUM:               'bg-blue-100 text-blue-700',
  HIGH:                 'bg-orange-100 text-orange-800',
  URGENT:               'bg-red-100 text-red-800',
  CRITICAL:             'bg-red-200 text-red-900 font-semibold',
}

const labelMap: Record<string, string> = {
  DOCS_PENDING:        'Docs Pending',
  DOCS_REVIEW:         'Docs Review',
  FNI_REVIEW:          'F&I Review',
  QUOTE_PENDING:       'Quote Pending',
  QUOTE_SENT:          'Quote Sent',
  QUOTE_ACCEPTED:      'Quote Accepted',
  INSPECTION_PENDING:  'Inspection Pending',
  INSPECTION_COMPLETE: 'Inspection Complete',
  CONTRACT_PENDING:    'Contract Pending',
  CONTRACT_SIGNED:     'Contract Signed',
  NATIS_PENDING:       'NATIS Pending',
  NATIS_COMPLETE:      'NATIS Complete',
  IN_PROGRESS:         'In Progress',
  RE_UPLOAD_REQUESTED: 'Re-upload Needed',
  UNDER_REVIEW:        'Under Review',
}

interface StatusBadgeProps {
  status: StatusValue
  variant?: BadgeVariant
}

export function StatusBadge({ status, variant = 'default' }: StatusBadgeProps) {
  const colorClass = colorMap[status] ?? 'bg-gray-100 text-gray-700'
  const label = labelMap[status] ?? status.replace(/_/g, ' ')
  const sizeClass = variant === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${colorClass}`}>
      {label}
    </span>
  )
}
