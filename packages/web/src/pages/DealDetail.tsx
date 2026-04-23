import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, User, Car, FileText, DollarSign,
  FileSignature, Wrench, MapPin, ClipboardList, ScrollText,
  CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, AlertCircle,
} from 'lucide-react'
import { StatusBadge } from '../components/StatusBadge'
import { SLAIndicator } from '../components/SLAIndicator'
import { VehiclePhotoPanel } from '../components/VehiclePhotoPanel'
import { ExtractionConfidencePanel } from '../components/ExtractionConfidencePanel'
import {
  getDeal,
  listDocuments,
  listQuotes,
  listContracts,
  listTasks,
  listAuditEvents,
  getInspection,
  getNatisFulfilment,
  updateDealStatus,
  claimTask,
  completeTask,
  escalateTask,
} from '../lib/queries'
import type {
  Deal, Quote, Inspection, Contract, Task, AuditEvent,
  NATISFulfilment, Document, DealStatus,
} from '../types/database'

// ─── Deal timeline stages ─────────────────────────────────────────────────────

const STAGES = [
  { key: 'DOCS_PENDING',          label: 'Documents',      icon: <FileText className="h-4 w-4" /> },
  { key: 'FNI_REVIEW',            label: 'F&I Review',     icon: <DollarSign className="h-4 w-4" /> },
  { key: 'QUOTE_ACCEPTED',        label: 'Quote',          icon: <CheckCircle2 className="h-4 w-4" /> },
  { key: 'INSPECTION_COMPLETE',   label: 'Inspection',     icon: <Wrench className="h-4 w-4" /> },
  { key: 'CONTRACT_SIGNED',       label: 'Contracts',      icon: <FileSignature className="h-4 w-4" /> },
  { key: 'NATIS_COMPLETE',        label: 'NATIS',          icon: <MapPin className="h-4 w-4" /> },
  { key: 'SETTLED',               label: 'Settled',        icon: <CheckCircle2 className="h-4 w-4" /> },
]

const STATUS_ORDER = [
  'LEAD','DOCS_PENDING','DOCS_REVIEW','FNI_REVIEW','QUOTE_PENDING','QUOTE_SENT','QUOTE_ACCEPTED',
  'INSPECTION_PENDING','INSPECTION_COMPLETE','CONTRACT_PENDING','CONTRACT_SIGNED',
  'NATIS_PENDING','NATIS_COMPLETE','SETTLED',
]

function stageIndex(status: string) {
  return STATUS_ORDER.indexOf(status)
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'overview'|'buyer'|'seller'|'vehicle'|'quote'|'contracts'|'inspection'|'natis'|'tasks'|'audit'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'buyer',       label: 'Buyer',       icon: <User className="h-4 w-4" /> },
  { id: 'seller',      label: 'Seller',      icon: <User className="h-4 w-4" /> },
  { id: 'vehicle',     label: 'Vehicle',     icon: <Car className="h-4 w-4" /> },
  { id: 'quote',       label: 'Quote',       icon: <DollarSign className="h-4 w-4" /> },
  { id: 'contracts',   label: 'Contracts',   icon: <FileSignature className="h-4 w-4" /> },
  { id: 'inspection',  label: 'Inspection',  icon: <Wrench className="h-4 w-4" /> },
  { id: 'natis',       label: 'NATIS',       icon: <MapPin className="h-4 w-4" /> },
  { id: 'tasks',       label: 'Tasks',       icon: <ClipboardList className="h-4 w-4" /> },
  { id: 'audit',       label: 'Audit',       icon: <ScrollText className="h-4 w-4" /> },
]

function LayoutGrid({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-start py-2.5 border-b border-gray-50 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-900">{value ?? <span className="text-gray-400 italic">—</span>}</span>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ deal, onStatusChange }: { deal: Deal; onStatusChange: (s: DealStatus) => void }) {
  const currentIdx = stageIndex(deal.status)
  const [changing, setChanging] = useState(false)

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as DealStatus
    if (!newStatus || newStatus === deal.status) return
    setChanging(true)
    try {
      await updateDealStatus(deal.id, newStatus)
      onStatusChange(newStatus)
    } catch {
      alert('Failed to update status')
    } finally {
      setChanging(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stage Progress */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Deal Progress</h3>
        <div className="flex items-center gap-0">
          {STAGES.map((stage, i) => {
            const stageIdx = stageIndex(stage.key)
            const done = stageIdx <= currentIdx
            const active = Math.abs(stageIdx - currentIdx) <= 1 && !done
            return (
              <div key={stage.key} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                    done ? 'border-blue-600 bg-blue-600 text-white' :
                    active ? 'border-blue-400 bg-blue-50 text-blue-600' :
                    'border-gray-200 bg-white text-gray-400'
                  }`}>
                    {stage.icon}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight ${done ? 'text-blue-700' : 'text-gray-400'}`}>
                    {stage.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-5 mx-1 ${stageIdx < currentIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Key Dates</h3>
          <InfoRow label="Deal Created"   value={format(new Date(deal.created_at), 'dd MMM yyyy HH:mm')} />
          <InfoRow label="Last Updated"   value={format(new Date(deal.updated_at), 'dd MMM yyyy HH:mm')} />
          <InfoRow label="SLA Due"        value={deal.sla_due_at ? format(new Date(deal.sla_due_at), 'dd MMM yyyy HH:mm') : null} />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Assigned Agents</h3>
          <InfoRow label="F&I Agent"  value={deal.assigned_fni_agent_id ?? null} />
          <InfoRow label="Ops Agent"  value={deal.assigned_ops_agent_id ?? null} />
          <div className="mt-3">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Update Status</label>
            <select
              onChange={handleStatusChange}
              disabled={changing}
              defaultValue=""
              className="mt-1 block w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            >
              <option value="" disabled>Change status…</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s} disabled={s === deal.status}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {deal.current_blockers && deal.current_blockers.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">Current Blockers</h3>
          </div>
          <ul className="space-y-1">
            {deal.current_blockers.map((b, i) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function BuyerTab({ deal, docs }: { deal: Deal; docs: Document[] }) {
  const buyer = deal.buyer!
  const buyerDocs = docs.filter((d) => d.owner_type === 'BUYER')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Buyer Profile</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <InfoRow label="Full Name"       value={`${buyer.first_name} ${buyer.last_name}`} />
            <InfoRow label="ID Number"       value={buyer.id_number} />
            <InfoRow label="Date of Birth"   value={buyer.date_of_birth} />
            <InfoRow label="Phone"           value={buyer.phone} />
            <InfoRow label="Email"           value={buyer.email} />
          </div>
          <div>
            <InfoRow label="Employment"      value={buyer.employment_type} />
            <InfoRow label="Employer"        value={buyer.employer_name} />
            <InfoRow label="Monthly Income"  value={buyer.monthly_income ? `R ${buyer.monthly_income.toLocaleString()}` : null} />
            <InfoRow label="Monthly Expenses" value={buyer.monthly_expenses ? `R ${buyer.monthly_expenses.toLocaleString()}` : null} />
            <InfoRow label="Credit Score"    value={buyer.credit_score?.toString()} />
            <InfoRow label="Address"         value={buyer.address} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
        <div className="space-y-2">
          {buyerDocs.length === 0 && <p className="text-sm text-gray-400">No documents uploaded yet.</p>}
          {buyerDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
              <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name ?? doc.document_type.replace(/_/g, ' ')}</p>
                {doc.uploaded_at && <p className="text-xs text-gray-400">Uploaded {format(new Date(doc.uploaded_at), 'dd MMM HH:mm')}</p>}
              </div>
              <StatusBadge status={doc.status} variant="sm" />
              {doc.file_url && (
                <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Extraction Results</h3>
        <ExtractionConfidencePanel results={[]} />
      </div>
    </div>
  )
}

function SellerTab({ deal, docs }: { deal: Deal; docs: Document[] }) {
  const seller = deal.seller!
  const sellerDocs = docs.filter((d) => d.owner_type === 'SELLER')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Seller Profile</h3>
        <InfoRow label="Full Name"         value={`${seller.first_name} ${seller.last_name}`} />
        <InfoRow label="ID Number"         value={seller.id_number} />
        <InfoRow label="Phone"             value={seller.phone} />
        <InfoRow label="Email"             value={seller.email} />
        <InfoRow label="Bank"              value={seller.bank_name} />
        <InfoRow label="Account Number"    value={seller.bank_account_number} />
        <InfoRow label="Branch Code"       value={seller.bank_branch_code} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
        <div className="space-y-2">
          {sellerDocs.length === 0 && <p className="text-sm text-gray-400">No documents uploaded yet.</p>}
          {sellerDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
              <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name ?? doc.document_type.replace(/_/g, ' ')}</p>
                {doc.uploaded_at && <p className="text-xs text-gray-400">Uploaded {format(new Date(doc.uploaded_at), 'dd MMM HH:mm')}</p>}
              </div>
              <StatusBadge status={doc.status} variant="sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function VehicleTab({ deal }: { deal: Deal }) {
  const v = deal.vehicle!
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Vehicle Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <InfoRow label="Make"          value={v.make} />
            <InfoRow label="Model"         value={v.model} />
            <InfoRow label="Year"          value={v.year.toString()} />
            <InfoRow label="Colour"        value={v.colour} />
            <InfoRow label="Transmission"  value={v.transmission} />
            <InfoRow label="Fuel Type"     value={v.fuel_type} />
          </div>
          <div>
            <InfoRow label="VIN"               value={v.vin} />
            <InfoRow label="Registration"      value={v.registration_number} />
            <InfoRow label="Engine Number"     value={v.engine_number} />
            <InfoRow label="Odometer"          value={v.odometer_km ? `${v.odometer_km.toLocaleString()} km` : null} />
            <InfoRow label="Asking Price"      value={v.asking_price ? `R ${v.asking_price.toLocaleString()}` : null} />
            <InfoRow label="Agreed Price"      value={v.agreed_price ? `R ${v.agreed_price.toLocaleString()}` : null} />
          </div>
        </div>
      </div>

      <VehiclePhotoPanel />
    </div>
  )
}

function QuoteTab({ quotes }: { quotes: Quote[] }) {
  const quote = quotes[0] ?? null
  if (!quote) return <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">No quote has been prepared yet.</div>

  return (
    <div className="space-y-4">
      {quotes.map((q) => (
        <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Quote v{q.version}</h3>
            <StatusBadge status={q.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-4">
            {[
              { label: 'Loan Amount',     value: `R ${q.loan_amount.toLocaleString()}` },
              { label: 'Deposit',         value: `R ${q.deposit_amount.toLocaleString()}` },
              { label: 'Interest Rate',   value: `${q.interest_rate}% p.a.` },
              { label: 'Term',            value: `${q.term_months} months` },
              { label: 'Monthly Install.',value: `R ${q.monthly_instalment.toLocaleString()}` },
              { label: 'Total Credit',    value: q.total_cost_of_credit ? `R ${q.total_cost_of_credit.toLocaleString()}` : '—' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className="text-sm font-bold text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>

          <InfoRow label="Initiation Fee"   value={q.initiation_fee ? `R ${q.initiation_fee.toLocaleString()}` : null} />
          <InfoRow label="Admin Fee"        value={q.monthly_admin_fee ? `R ${q.monthly_admin_fee}/mo` : null} />
          <InfoRow label="Insurance"        value={q.insurance_premium ? `R ${q.insurance_premium}/mo` : null} />
          <InfoRow label="Sent At"          value={q.sent_at ? format(new Date(q.sent_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Viewed At"        value={q.viewed_at ? format(new Date(q.viewed_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Expires"          value={q.expiry_at ? format(new Date(q.expiry_at), 'dd MMM yyyy') : null} />
        </div>
      ))}
    </div>
  )
}

function ContractsTab({ contracts }: { contracts: Contract[] }) {
  return (
    <div className="space-y-4">
      {contracts.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No contracts generated yet.
        </div>
      )}
      {contracts.map((c) => (
        <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">{c.contract_type} Contract</h3>
            <StatusBadge status={c.status} />
          </div>
          <InfoRow label="Signatory"   value={c.signatory_name} />
          <InfoRow label="Email"       value={c.signatory_email} />
          <InfoRow label="Sent At"     value={c.sent_at ? format(new Date(c.sent_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Viewed At"   value={c.viewed_at ? format(new Date(c.viewed_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Signed At"   value={c.signed_at ? format(new Date(c.signed_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Envelope ID" value={c.docusign_envelope_id} />
          {c.file_url && (
            <a href={c.file_url} className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
              <ExternalLink className="h-4 w-4" /> View Contract
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

function InspectionTab({ inspection }: { inspection: Inspection | null }) {
  if (!inspection) return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
      No inspection record found.
    </div>
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Hartcon Inspection</h3>
        <StatusBadge status={inspection.status} />
      </div>
      <InfoRow label="Inspector"        value={inspection.inspector_name} />
      <InfoRow label="Company"          value={inspection.inspector_company} />
      <InfoRow label="Scheduled"        value={inspection.scheduled_at ? format(new Date(inspection.scheduled_at), 'dd MMM yyyy HH:mm') : null} />
      <InfoRow label="Completed"        value={inspection.completed_at ? format(new Date(inspection.completed_at), 'dd MMM yyyy HH:mm') : null} />
      <InfoRow label="Overall Condition" value={inspection.overall_condition} />
      <InfoRow label="Odometer"         value={inspection.odometer_reading ? `${inspection.odometer_reading.toLocaleString()} km` : null} />
      <InfoRow label="Roadworthy"       value={inspection.roadworthy === null ? null : inspection.roadworthy ? 'Yes' : 'No'} />
      <InfoRow label="Final Valuation"  value={inspection.final_valuation ? `R ${inspection.final_valuation.toLocaleString()}` : null} />
      <InfoRow label="Recommendation"   value={inspection.recommendation} />
      {inspection.defects && inspection.defects.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Defects</p>
          <ul className="space-y-1">
            {inspection.defects.map((d, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function NATISTab({ natis }: { natis: NATISFulfilment | null }) {
  if (!natis) return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
      NATIS fulfilment not yet initiated.
    </div>
  )

  const steps = [
    { label: 'Submitted',  at: natis.submitted_at },
    { label: 'Processing', at: natis.processing_at },
    { label: 'Complete',   at: natis.completed_at },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">NATIS Fulfilment</h3>
          <StatusBadge status={natis.status} />
        </div>

        <div className="flex items-center gap-0 mb-4">
          {steps.map((step, i) => (
            <div key={step.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`h-6 w-6 rounded-full border-2 ${step.at ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'}`} />
                <span className="text-xs text-gray-500">{step.label}</span>
                {step.at && <span className="text-[10px] text-gray-400">{format(new Date(step.at), 'dd MMM')}</span>}
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mb-5 mx-1 ${step.at ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <InfoRow label="NATIS Reference"    value={natis.natis_reference} />
        <InfoRow label="Collection Address" value={natis.collection_address} />
        <InfoRow label="Collection Agent"   value={natis.collection_agent} />
        <InfoRow label="Notes"              value={natis.notes} />
        {natis.rejection_reason && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mr-1 inline h-4 w-4" />
            {natis.rejection_reason}
          </div>
        )}
      </div>
    </div>
  )
}

function TasksTab({
  tasks,
  onClaim,
  onComplete,
  onEscalate,
}: {
  tasks: Task[]
  onClaim: (id: string) => Promise<void>
  onComplete: (id: string) => Promise<void>
  onEscalate: (id: string) => Promise<void>
}) {
  const priorityColor: Record<string, string> = {
    LOW: 'bg-slate-100 text-slate-600', MEDIUM: 'bg-blue-100 text-blue-700',
    HIGH: 'bg-orange-100 text-orange-800', URGENT: 'bg-red-100 text-red-800',
    CRITICAL: 'bg-red-200 text-red-900',
  }

  return (
    <div className="space-y-3">
      {tasks.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No tasks for this deal.
        </div>
      )}
      {tasks.map((task) => (
        <div key={task.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor[task.priority]}`}>
                  {task.priority}
                </span>
                <StatusBadge status={task.status} variant="sm" />
                <span className="text-xs text-gray-400">{task.queue.replace(/^Q_/, '').replace(/_/g, ' ')}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">{task.title}</p>
              {task.description && <p className="mt-0.5 text-xs text-gray-500">{task.description}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {task.due_at && <SLAIndicator dueAt={task.due_at} />}
              {task.assigned_to && (
                <span className="text-xs text-gray-400">
                  <User className="mr-1 inline h-3 w-3" />{task.assigned_to}
                </span>
              )}
              <div className="flex gap-1 mt-1">
                {task.status === 'PENDING' && (
                  <button onClick={() => onClaim(task.id)} className="text-xs text-blue-700 hover:underline">Claim</button>
                )}
                {task.status === 'IN_PROGRESS' && (
                  <button onClick={() => onComplete(task.id)} className="text-xs text-green-700 hover:underline">Complete</button>
                )}
                {task.status !== 'ESCALATED' && (
                  <button onClick={() => onEscalate(task.id)} className="text-xs text-red-700 hover:underline">Escalate</button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AuditTab({ events }: { events: AuditEvent[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded((p) => {
    const next = new Set(p)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const actorColor: Record<string, string> = {
    SYSTEM: 'bg-gray-100 text-gray-700', AGENT: 'bg-blue-100 text-blue-800',
    BUYER: 'bg-green-100 text-green-800', SELLER: 'bg-amber-100 text-amber-800',
    ADMIN: 'bg-purple-100 text-purple-800',
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Time</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Event</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actor</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {events.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-sm text-gray-400">No audit events.</td>
            </tr>
          )}
          {events.map((ev) => (
            <>
              <tr key={ev.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {format(new Date(ev.created_at), 'dd MMM HH:mm')}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-gray-800">{ev.event_type}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${actorColor[ev.actor_type]}`}>
                      {ev.actor_type}
                    </span>
                    <span className="text-xs text-gray-600">{ev.actor_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggle(ev.id)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {expanded.has(ev.id) ? 'Hide' : 'View'} details
                  </button>
                </td>
              </tr>
              {expanded.has(ev.id) && (
                <tr key={`${ev.id}-detail`} className="bg-gray-50">
                  <td colSpan={4} className="px-4 py-3">
                    <pre className="rounded bg-gray-100 p-3 text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(ev.details, null, 2)}
                    </pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DealDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const [deal, setDeal] = useState<Deal | null>(null)
  const [docs, setDocs] = useState<Document[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [natis, setNatis] = useState<NATISFulfilment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)

    const fetchAll = async () => {
      try {
        const [dealData, docsData, quotesData, inspData, contractsData, tasksData, auditData, natisData] =
          await Promise.allSettled([
            getDeal(id),
            listDocuments(id),
            listQuotes(id),
            getInspection(id),
            listContracts(id),
            listTasks({ dealId: id }),
            listAuditEvents({ dealId: id }),
            getNatisFulfilment(id),
          ])

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = <T,>(r: PromiseSettledResult<T>): T | null =>
          r.status === 'fulfilled' ? r.value : null

        const dealResult = val(dealData)
        if (!dealResult) throw new Error('Deal not found')

        setDeal(dealResult)
        setDocs(val(docsData) ?? [])
        setQuotes(val(quotesData) ?? [])
        setInspection(val(inspData) ?? null)
        setContracts(val(contractsData) ?? [])
        setTasks(val(tasksData) ?? [])
        setAuditEvents(val(auditData) ?? [])
        setNatis(val(natisData) ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deal')
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [id])

  const handleStatusChange = (newStatus: DealStatus) => {
    if (deal) setDeal({ ...deal, status: newStatus, updated_at: new Date().toISOString() })
  }

  const handleClaim = async (taskId: string) => {
    try {
      const updated = await claimTask(taskId, 'me')
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t))
    } catch { alert('Failed to claim task') }
  }

  const handleComplete = async (taskId: string) => {
    try {
      const updated = await completeTask(taskId)
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t))
    } catch { alert('Failed to complete task') }
  }

  const handleEscalate = async (taskId: string) => {
    try {
      const updated = await escalateTask(taskId)
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t))
    } catch { alert('Failed to escalate task') }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    )
  }

  if (error || !deal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-600">{error ?? 'Deal not found'}</p>
        <button onClick={() => navigate('/deals')} className="text-sm text-blue-600 underline">Back to Deals</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <button
          onClick={() => navigate('/deals')}
          className="mb-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Deals
        </button>

        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{deal.deal_number}</h1>
              <StatusBadge status={deal.status} />
              {deal.sla_due_at && <SLAIndicator dueAt={deal.sla_due_at} />}
            </div>
            {deal.buyer && (
              <p className="mt-1 text-sm text-gray-600">
                <User className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
                {deal.buyer.first_name} {deal.buyer.last_name}
                {deal.vehicle && ` · ${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}`}
                {deal.vehicle?.registration_number && ` (${deal.vehicle.registration_number})`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {deal.assigned_fni_agent_id && (
              <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-blue-700">
                F&I: {deal.assigned_fni_agent_id}
              </span>
            )}
            {deal.assigned_ops_agent_id && (
              <span className="rounded-full bg-gray-100 border border-gray-200 px-2.5 py-1 text-gray-700">
                Ops: {deal.assigned_ops_agent_id}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-0.5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview'   && <OverviewTab deal={deal} onStatusChange={handleStatusChange} />}
        {activeTab === 'buyer'      && deal.buyer && <BuyerTab deal={deal} docs={docs} />}
        {activeTab === 'seller'     && deal.seller && <SellerTab deal={deal} docs={docs} />}
        {activeTab === 'vehicle'    && deal.vehicle && <VehicleTab deal={deal} />}
        {activeTab === 'quote'      && <QuoteTab quotes={quotes} />}
        {activeTab === 'contracts'  && <ContractsTab contracts={contracts} />}
        {activeTab === 'inspection' && <InspectionTab inspection={inspection} />}
        {activeTab === 'natis'      && <NATISTab natis={natis} />}
        {activeTab === 'tasks'      && (
          <TasksTab
            tasks={tasks}
            onClaim={handleClaim}
            onComplete={handleComplete}
            onEscalate={handleEscalate}
          />
        )}
        {activeTab === 'audit'      && <AuditTab events={auditEvents} />}
      </div>
    </div>
  )
}
