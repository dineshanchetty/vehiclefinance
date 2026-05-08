import { useState } from 'react'
import { format } from 'date-fns'
import {
  User, Car, FileText, DollarSign, FileSignature, Wrench, MapPin,
  ClipboardList, MessageSquare, Wallet, ArrowRight, AlertCircle,
  CheckCircle2, Users, Calculator, Package,
} from 'lucide-react'
// NotesAndTasksPanel moved out of the Overview — lives inside the Tasks tab
// (sub-tabs: Open / Completed / Notes) where it belongs alongside the
// per-deal task list.
import type {
  DealWithRelations, Document, Quote, Contract, Inspection, NatisFulfilment,
  TaskWithDeal,
} from '../types/database'

/**
 * DealOverviewDashboard — at-a-glance summary on a deal's Overview tab.
 * Three sections (Application / Decisioning / Fulfilment), each rendered as a
 * tabbed panel: pick a sub-area (Buyer, Seller, Vehicle…) and only that pane
 * is shown — no more long vertical grids of cards.
 */
interface Props {
  deal: DealWithRelations
  docs: Document[]
  quotes: Quote[]
  contracts: Contract[]
  inspection: Inspection | null
  natis: NatisFulfilment | null
  tasks: TaskWithDeal[]
  onTabChange: (tab: string) => void
}

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue'
interface PaneStatus { label: string; tone: Tone }
interface Pane {
  id: string
  label: string
  icon: React.ReactNode
  status?: PaneStatus
  onOpen: () => void
  body: React.ReactNode
}

const TONE_PILL: Record<Tone, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red:   'bg-red-100 text-red-700',
  blue:  'bg-indigo-100 text-indigo-700',
  gray:  'bg-gray-100 text-gray-600',
}
const TONE_DOT: Record<Tone, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red:   'bg-red-500',
  blue:  'bg-indigo-500',
  gray:  'bg-gray-300',
}

const fmtMoney = (n: number | string | null | undefined) => {
  if (n == null || n === '') return '—'
  const v = typeof n === 'number' ? n : parseFloat(String(n))
  if (Number.isNaN(v)) return '—'
  return `R ${v.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}

const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), 'dd MMM yyyy') : '—'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right truncate">{value}</span>
    </div>
  )
}

interface TabbedSectionProps {
  title: string
  subtitle?: string
  icon: React.ReactNode
  panes: Pane[]
}

/**
 * Section with a horizontal tab bar — each pane has a status pill so ops can
 * scan completion at a glance without expanding the section.
 */
function TabbedSection({ title, subtitle, icon, panes }: TabbedSectionProps) {
  const [activeId, setActiveId] = useState(panes[0]?.id ?? '')
  const active = panes.find((p) => p.id === activeId) ?? panes[0]
  if (!active) return null

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{icon}</span>
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {subtitle && <span className="text-xs text-gray-400">· {subtitle}</span>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
        {panes.map((p) => {
          const isActive = p.id === activeId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-indigo-600 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className={isActive ? 'text-indigo-600' : 'text-gray-400'}>{p.icon}</span>
              {p.label}
              {p.status && (
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[p.status.tone]}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Active pane */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <span className="text-gray-400">{active.icon}</span>
            {active.label}
          </div>
          {active.status && (
            <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${TONE_PILL[active.status.tone]}`}>
              {active.status.label}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-700">{active.body}</div>
        <button
          type="button"
          onClick={active.onOpen}
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          Open full {active.label.toLowerCase()} tab <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </section>
  )
}

export function DealOverviewDashboard({
  deal, docs, quotes, contracts, inspection, natis, tasks, onTabChange,
}: Props) {
  const buyer = deal.buyer
  const seller = deal.seller
  const vehicle = deal.vehicle
  const phaseState = ((deal as unknown as { phase_state?: Record<string, unknown> }).phase_state ?? {}) as Record<string, unknown>
  const agreedPrice = typeof phaseState.agreed_price === 'number' ? phaseState.agreed_price : null

  // Document type counts
  const docByType = (t: string) => docs.filter((d) => d.doc_type === t)
  const otpDocs = docByType('OFFER_TO_PURCHASE')
  const idDocs = [...docByType('SA_ID_SMART_CARD'), ...docByType('SA_ID_GREEN_BOOK')]
  const poaDocs = docByType('PROOF_OF_ADDRESS')
  const bsDocs = docByType('BANK_STATEMENT')
  const bsCount = bsDocs.filter((d) => d.status === 'extracted').length

  // Quotes
  const latestQuote = quotes.length > 0 ? quotes[0] : null
  const acceptedQuote = quotes.find((q) => q.status === 'ACCEPTED')

  // Contracts
  const buyerFinanceContract = contracts.find((c) => c.contract_type === 'BUYER_FINANCE_AGREEMENT')
  const sellerAgreement = contracts.find((c) => c.contract_type === 'SELLER_AGREEMENT')

  // Tasks
  const openTasks = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS' || t.status === 'ESCALATED')

  const applicationPanes: Pane[] = [
    {
      id: 'buyer',
      label: 'Buyer',
      icon: <User className="h-4 w-4" />,
      status: buyer ? { label: 'Captured', tone: 'green' } : { label: 'Missing', tone: 'red' },
      onOpen: () => onTabChange('buyer'),
      body: (
        <>
          <Row label="Name"  value={buyer?.full_name ?? '—'} />
          <Row label="ID"    value={buyer?.id_number ?? '—'} />
          <Row label="Phone" value={buyer?.phone ?? '—'} />
          <Row label="Email" value={buyer?.email ?? '—'} />
        </>
      ),
    },
    {
      id: 'seller',
      label: 'Seller',
      icon: <User className="h-4 w-4" />,
      status: !seller ? { label: 'Not yet', tone: 'gray' }
            : seller.consent_status === true ? { label: 'Consented', tone: 'green' }
            : { label: 'Awaiting consent', tone: 'amber' },
      onOpen: () => onTabChange('seller'),
      body: (
        <>
          <Row label="Name"  value={seller?.full_name ?? '—'} />
          <Row label="ID"    value={seller?.id_number ?? '—'} />
          <Row label="Phone" value={seller?.phone ?? '—'} />
        </>
      ),
    },
    {
      id: 'vehicle',
      label: 'Vehicle',
      icon: <Car className="h-4 w-4" />,
      status: vehicle ? { label: 'Captured', tone: 'green' } : { label: 'Missing', tone: 'red' },
      onOpen: () => onTabChange('vehicle'),
      body: (
        <>
          <Row label="Make/model" value={vehicle ? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || '—' : '—'} />
          <Row label="Year"       value={vehicle?.year ?? '—'} />
          <Row label="VIN"        value={vehicle?.vin ?? '—'} />
          <Row label="Reg"        value={vehicle?.registration_number ?? '—'} />
          <Row label="Price"      value={fmtMoney(agreedPrice)} />
        </>
      ),
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: <FileText className="h-4 w-4" />,
      status: { label: `${docs.length} files`, tone: docs.length > 0 ? 'blue' : 'gray' },
      onOpen: () => onTabChange('buyer'),
      body: (
        <>
          <Row label="OTP"        value={otpDocs.length > 0 ? <CheckCircle2 className="inline h-3.5 w-3.5 text-green-500" /> : '—'} />
          <Row label="ID"         value={idDocs.length > 0 ? <CheckCircle2 className="inline h-3.5 w-3.5 text-green-500" /> : '—'} />
          <Row label="POA"        value={poaDocs.length > 0 ? <CheckCircle2 className="inline h-3.5 w-3.5 text-green-500" /> : '—'} />
          <Row label="Bank stmts" value={`${bsCount}/3`} />
        </>
      ),
    },
  ]

  const decisioningPanes: Pane[] = [
    {
      id: 'affordability',
      label: 'Affordability',
      icon: <Wallet className="h-4 w-4" />,
      status: bsCount === 0 ? { label: 'Pending', tone: 'gray' }
            : bsCount < 3 ? { label: `${bsCount}/3 stmts`, tone: 'amber' }
            : { label: 'Ready', tone: 'green' },
      onOpen: () => onTabChange('affordability'),
      body: (
        <>
          <Row label="Statements processed" value={`${bsCount} of 3`} />
          <Row label="Vehicle price"        value={fmtMoney(agreedPrice)} />
          <Row label="Detail"               value={<span className="text-indigo-600">Open Affordability →</span>} />
        </>
      ),
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: <DollarSign className="h-4 w-4" />,
      status: acceptedQuote ? { label: 'Accepted', tone: 'green' }
            : latestQuote ? { label: latestQuote.status ?? 'Draft', tone: 'amber' }
            : { label: 'None', tone: 'gray' },
      onOpen: () => onTabChange('quote'),
      body: latestQuote ? (
        <>
          <Row label="Monthly" value={fmtMoney(latestQuote.monthly_instalment)} />
          <Row label="Term"    value={latestQuote.term_months ? `${latestQuote.term_months} months` : '—'} />
          <Row label="Rate"    value={latestQuote.interest_rate != null ? `${latestQuote.interest_rate}%` : '—'} />
          <Row label="Total"   value={fmtMoney((latestQuote as { total_credit_cost?: number | null }).total_credit_cost)} />
        </>
      ) : <p className="text-xs text-gray-500 italic">No quote prepared yet.</p>,
    },
    {
      id: 'contracts',
      label: 'Contracts',
      icon: <FileSignature className="h-4 w-4" />,
      status: buyerFinanceContract?.signature_status === 'SIGNED' && sellerAgreement
        ? { label: 'Both done', tone: 'green' }
        : contracts.length > 0
        ? { label: `${contracts.length} on file`, tone: 'amber' }
        : { label: 'None', tone: 'gray' },
      onOpen: () => onTabChange('contracts'),
      body: (
        <>
          <Row
            label="Buyer finance"
            value={buyerFinanceContract
              ? <span className={buyerFinanceContract.signature_status === 'SIGNED' ? 'text-green-600' : 'text-amber-600'}>
                  {buyerFinanceContract.signature_status ?? 'PENDING'}
                </span>
              : '—'}
          />
          <Row
            label="Seller agreement"
            value={sellerAgreement
              ? <span className={sellerAgreement.signature_status === 'SIGNED' ? 'text-green-600' : 'text-amber-600'}>
                  {sellerAgreement.signature_status ?? 'PENDING'}
                </span>
              : '—'}
          />
        </>
      ),
    },
  ]

  const fulfilmentPanes: Pane[] = [
    {
      id: 'inspection',
      label: 'Inspection',
      icon: <Wrench className="h-4 w-4" />,
      status: !inspection ? { label: 'Not scheduled', tone: 'gray' }
            : inspection.status === 'COMPLETE' ? { label: 'Passed', tone: 'green' }
            : inspection.status === 'FAILED' ? { label: 'Failed', tone: 'red' }
            : { label: 'Scheduled', tone: 'amber' },
      onOpen: () => onTabChange('inspection'),
      body: inspection ? (
        <>
          <Row label="Status"     value={inspection.status ?? '—'} />
          <Row label="Inspector"  value={inspection.inspector_name ?? '—'} />
          <Row label="Scheduled"  value={fmtDate(inspection.scheduled_date)} />
          <Row label="Completed"  value={fmtDate(inspection.completed_date)} />
        </>
      ) : <p className="text-xs text-gray-500 italic">Inspection not scheduled yet.</p>,
    },
    {
      id: 'natis',
      label: 'NATIS',
      icon: <MapPin className="h-4 w-4" />,
      status: !natis ? { label: 'Not started', tone: 'gray' }
            : natis.transfer_status === 'COMPLETE' || natis.transfer_status === 'TRANSFERRED' ? { label: 'Done', tone: 'green' }
            : { label: natis.transfer_status ?? 'In progress', tone: 'blue' },
      onOpen: () => onTabChange('natis'),
      body: natis ? (
        <>
          <Row label="Collection"  value={natis.collection_status ?? '—'} />
          <Row label="Transfer"    value={natis.transfer_status ?? '—'} />
          <Row label="Collected"   value={fmtDate(natis.collection_date)} />
          <Row label="Transferred" value={fmtDate(natis.transfer_date)} />
        </>
      ) : <p className="text-xs text-gray-500 italic">Title transfer not started.</p>,
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: <ClipboardList className="h-4 w-4" />,
      status: openTasks.length === 0 ? { label: 'Clear', tone: 'green' }
            : openTasks.length > 3 ? { label: `${openTasks.length} open`, tone: 'red' }
            : { label: `${openTasks.length} open`, tone: 'amber' },
      onOpen: () => onTabChange('tasks'),
      body: openTasks.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No open tasks.</p>
      ) : (
        <div className="space-y-1.5">
          {openTasks.slice(0, 5).map((t) => (
            <div key={t.id} className="flex items-start gap-1.5 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <span className="truncate">{t.task_type ?? 'Task'}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'conversation',
      label: 'Conversation',
      icon: <MessageSquare className="h-4 w-4" />,
      status: { label: 'WhatsApp', tone: 'blue' },
      onOpen: () => onTabChange('conversation'),
      body: (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Live thread with buyer{seller?.phone ? ' & seller' : ''}. Compose & send messages there.
          </p>
          <Row label="Buyer phone"  value={buyer?.phone ?? '—'} />
          <Row label="Seller phone" value={seller?.phone ?? '—'} />
        </>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <TabbedSection
        title="Application"
        subtitle="Who & what"
        icon={<Users className="h-4 w-4" />}
        panes={applicationPanes}
      />
      <TabbedSection
        title="Decisioning"
        subtitle="Income, finance & contracts"
        icon={<Calculator className="h-4 w-4" />}
        panes={decisioningPanes}
      />
      <TabbedSection
        title="Fulfilment"
        subtitle="Inspection, transfer & ops"
        icon={<Package className="h-4 w-4" />}
        panes={fulfilmentPanes}
      />
    </div>
  )
}
