import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, User, Car, FileText, DollarSign,
  FileSignature, Wrench, MapPin, ClipboardList, ScrollText,
  CheckCircle2, ExternalLink, RefreshCw, AlertCircle, MessageSquare,
} from 'lucide-react'
import { StatusBadge } from '../components/StatusBadge'
import { SLAIndicator } from '../components/SLAIndicator'
import { VehiclePhotoPanel } from '../components/VehiclePhotoPanel'
import { ExtractionConfidencePanel } from '../components/ExtractionConfidencePanel'
import { DealConversation } from '../components/DealConversation'
import { DealHero } from '../components/DealHero'
import { PhaseTimeline } from '../components/PhaseTimeline'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/auth'
import {
  getDeal,
  listDocuments,
  listQuotes,
  listContracts,
  listTasks,
  listAuditFeed,
  listExtractionResults,
  getInspection,
  getNatisFulfilment,
  updateDealStatus,
  claimTask,
  completeTask,
  escalateTask,
} from '../lib/queries'
import type {
  DealWithRelations, Quote, Inspection, Contract, TaskWithDeal, AuditFeedItem,
  NatisFulfilment, Document, DealStatus, ExtractionResult,
} from '../types/database'

// ─── Deal timeline stages ─────────────────────────────────────────────────────
// Keys must be real `deal_status` enum values from the migration.

const STAGES = [
  { key: 'BUYER_DOCS_PENDING',      label: 'Documents',  icon: <FileText className="h-4 w-4" /> },
  { key: 'FNI_REVIEW_PENDING',      label: 'F&I Review', icon: <DollarSign className="h-4 w-4" /> },
  { key: 'QUOTE_ACCEPTED',          label: 'Quote',      icon: <CheckCircle2 className="h-4 w-4" /> },
  { key: 'INSPECTION_COMPLETE',     label: 'Inspection', icon: <Wrench className="h-4 w-4" /> },
  { key: 'BUYER_CONTRACT_SIGNED',   label: 'Contracts',  icon: <FileSignature className="h-4 w-4" /> },
  { key: 'NATIS_COMPLETE',          label: 'NATIS',      icon: <MapPin className="h-4 w-4" /> },
  { key: 'DEAL_FULFILLED',          label: 'Fulfilled',  icon: <CheckCircle2 className="h-4 w-4" /> },
] as const

const STATUS_ORDER: DealStatus[] = [
  'APPLICATION_INITIATED',
  'CONSENT_PENDING',
  'CONSENT_GRANTED',
  'BUYER_DOCS_PENDING',
  'EXTRACTION_IN_PROGRESS',
  'BUYER_DOCS_EXTRACTED',
  'BUYER_CONFIRMATION_PENDING',
  'BUYER_CONFIRMED',
  'SELLER_INVITED',
  'SELLER_CONSENT_PENDING',
  'SELLER_CONSENT_GRANTED',
  'SELLER_DOCS_PENDING',
  'SELLER_EXTRACTION_IN_PROGRESS',
  'SELLER_DOCS_EXTRACTED',
  'VEHICLE_PHOTOS_PENDING',
  'VEHICLE_PHOTOS_PARTIAL',
  'VEHICLE_PHOTOS_COMPLETE',
  'QUICK_EVAL_IN_PROGRESS',
  'QUICK_EVAL_COMPLETE',
  'FNI_REVIEW_PENDING',
  'QUOTE_PREPARATION',
  'QUOTE_SENT',
  'QUOTE_ACCEPTED',
  'QUOTE_DECLINED',
  'QUOTE_EXPIRED',
  'INSPECTION_SCHEDULED',
  'INSPECTION_COMPLETE',
  'SELLER_CONTRACT_PENDING',
  'SELLER_CONTRACT_SENT',
  'SELLER_CONTRACT_SIGNED',
  'BUYER_CONTRACT_PENDING',
  'BUYER_CONTRACT_SENT',
  'BUYER_CONTRACT_SIGNED',
  'DEAL_PENDING_APPROVAL',
  'DEAL_APPROVED',
  'DEAL_DECLINED',
  'NATIS_COLLECTION_PENDING',
  'NATIS_COLLECTED',
  'NATIS_TRANSFER_IN_PROGRESS',
  'NATIS_COMPLETE',
  'DEAL_FULFILLED',
  'DEAL_CANCELLED',
  'DEAL_ON_HOLD',
]

function stageIndex(status: string) {
  return STATUS_ORDER.indexOf(status as DealStatus)
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'overview'|'buyer'|'seller'|'vehicle'|'quote'|'contracts'|'inspection'|'natis'|'tasks'|'conversation'|'audit'

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
  { id: 'conversation',label: 'Conversation',icon: <MessageSquare className="h-4 w-4" /> },
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

function OverviewTab({ deal, onStatusChange }: { deal: DealWithRelations; onStatusChange: (s: DealStatus) => void }) {
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
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Assigned Agents</h3>
          <InfoRow label="F&I Analyst"     value={deal.assigned_fni_analyst ?? null} />
          <InfoRow label="Seller Agent"    value={deal.assigned_seller_agent ?? null} />
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

      {deal.notes && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{deal.notes}</p>
        </div>
      )}
    </div>
  )
}

function BuyerTab({
  deal,
  docs,
  extractionResults,
}: {
  deal: DealWithRelations
  docs: Document[]
  extractionResults: ExtractionResult[]
}) {
  const buyer = deal.buyer!
  const buyerDocs = docs.filter((d) => d.party === 'BUYER')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Buyer Profile</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <InfoRow label="Full Name"       value={buyer.full_name ?? '—'} />
            <InfoRow label="ID Number"       value={buyer.id_number} />
            <InfoRow label="Date of Birth"   value={buyer.date_of_birth} />
            <InfoRow label="Phone"           value={buyer.phone} />
            <InfoRow label="Email"           value={buyer.email} />
            <InfoRow label="Nationality"     value={buyer.nationality} />
          </div>
          <div>
            <InfoRow label="Employer"            value={buyer.employer_name} />
            <InfoRow label="Employment Length"   value={buyer.employment_duration} />
            <InfoRow label="Monthly Income"      value={buyer.monthly_income ? `R ${buyer.monthly_income.toLocaleString()}` : null} />
            <InfoRow label="Physical Address"    value={buyer.physical_address} />
            <InfoRow label="City"                value={buyer.city} />
            <InfoRow label="Postal Code"         value={buyer.postal_code} />
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
                <p className="text-sm font-medium text-gray-900 truncate">
                  {doc.file_name ?? (doc.doc_type ?? 'OTHER').replace(/_/g, ' ')}
                </p>
                {doc.upload_timestamp && (
                  <p className="text-xs text-gray-400">
                    Uploaded {format(new Date(doc.upload_timestamp), 'dd MMM HH:mm')}
                  </p>
                )}
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
        <ExtractionConfidencePanel results={extractionResults} />
      </div>
    </div>
  )
}

function SellerTab({ deal, docs }: { deal: DealWithRelations; docs: Document[] }) {
  const seller = deal.seller!
  const sellerDocs = docs.filter((d) => d.party === 'SELLER')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Seller Profile</h3>
        <InfoRow label="Full Name"         value={seller.full_name ?? '—'} />
        <InfoRow label="ID Number"         value={seller.id_number} />
        <InfoRow label="Phone"             value={seller.phone} />
        <InfoRow label="Email"             value={seller.email} />
        <InfoRow
          label="Consent Status"
          value={seller.consent_status ? 'Granted' : 'Not granted'}
        />
        {/* TODO(schema): bank details would live in a separate `seller_bank_accounts`
            table if/when introduced. Not present on `sellers`. */}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
        <div className="space-y-2">
          {sellerDocs.length === 0 && <p className="text-sm text-gray-400">No documents uploaded yet.</p>}
          {sellerDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
              <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {doc.file_name ?? (doc.doc_type ?? 'OTHER').replace(/_/g, ' ')}
                </p>
                {doc.upload_timestamp && (
                  <p className="text-xs text-gray-400">
                    Uploaded {format(new Date(doc.upload_timestamp), 'dd MMM HH:mm')}
                  </p>
                )}
              </div>
              <StatusBadge status={doc.status} variant="sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function VehicleTab({ deal }: { deal: DealWithRelations }) {
  const v = deal.vehicle!
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Vehicle Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <InfoRow label="Make"                         value={v.make} />
            <InfoRow label="Model"                        value={v.model} />
            <InfoRow label="Year"                         value={v.year?.toString()} />
            <InfoRow label="Colour"                       value={v.colour} />
            <InfoRow label="Year of First Registration"   value={v.year_of_first_registration?.toString()} />
          </div>
          <div>
            <InfoRow label="VIN"               value={v.vin} />
            <InfoRow label="Registration"      value={v.registration_number} />
            <InfoRow label="Engine Number"     value={v.engine_number} />
            <InfoRow label="Odometer"          value={v.odometer_reading} />
            <InfoRow label="Asking Price"      value={v.asking_price ? `R ${v.asking_price.toLocaleString()}` : null} />
            {/* TODO(schema): agreed_price / transmission / fuel_type are not
                columns on the `vehicles` table in the current schema. */}
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
            <h3 className="text-sm font-semibold text-gray-700">Quote</h3>
            <StatusBadge status={q.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-4">
            {[
              { label: 'Finance Amount',    value: q.finance_amount != null ? `R ${q.finance_amount.toLocaleString()}` : '—' },
              { label: 'Balloon',           value: `R ${q.balloon_amount.toLocaleString()}` },
              { label: 'Interest Rate',     value: q.interest_rate != null ? `${q.interest_rate}% p.a.` : '—' },
              { label: 'Term',              value: q.term_months != null ? `${q.term_months} months` : '—' },
              { label: 'Monthly Install.',  value: q.monthly_instalment != null ? `R ${q.monthly_instalment.toLocaleString()}` : '—' },
              { label: 'Total Credit Cost', value: q.total_credit_cost != null ? `R ${q.total_credit_cost.toLocaleString()}` : '—' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className="text-sm font-bold text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>

          <InfoRow label="Prepared By"   value={q.prepared_by} />
          <InfoRow label="Sent At"       value={q.sent_at ? format(new Date(q.sent_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Accepted At"   value={q.accepted_at ? format(new Date(q.accepted_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Declined At"   value={q.declined_at ? format(new Date(q.declined_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Decline Reason" value={q.decline_reason} />
          <InfoRow label="Valid Until"   value={q.valid_until ? format(new Date(q.valid_until), 'dd MMM yyyy') : null} />
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
            <StatusBadge status={c.signature_status} />
          </div>
          <InfoRow label="Signatory"         value={c.signatory_name} />
          <InfoRow label="Signatory ID"      value={c.signatory_id_number} />
          <InfoRow label="Generated At"      value={c.generated_at ? format(new Date(c.generated_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Sent At"           value={c.sent_at ? format(new Date(c.sent_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Signed At"         value={c.signed_at ? format(new Date(c.signed_at), 'dd MMM yyyy HH:mm') : null} />
          <InfoRow label="Provider Ref"      value={c.signing_provider_ref} />
          {c.signing_link && (
            <a href={c.signing_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
              <ExternalLink className="h-4 w-4" /> Open signing link
            </a>
          )}
          {c.file_url && (
            <a href={c.file_url} className="mt-3 ml-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
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
      <InfoRow label="Inspector"         value={inspection.inspector_name} />
      <InfoRow label="Scheduled"         value={inspection.scheduled_date ? format(new Date(inspection.scheduled_date), 'dd MMM yyyy HH:mm') : null} />
      <InfoRow label="Completed"         value={inspection.completed_date ? format(new Date(inspection.completed_date), 'dd MMM yyyy HH:mm') : null} />
      <InfoRow label="Overall Condition" value={inspection.overall_condition} />
      <InfoRow label="Damage Summary"    value={inspection.damage_summary} />
      <InfoRow label="Notes"             value={inspection.notes} />
      {inspection.report_url && (
        <a href={inspection.report_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
          <ExternalLink className="h-4 w-4" /> View Report
        </a>
      )}
    </div>
  )
}

function NATISTab({ natis }: { natis: NatisFulfilment | null }) {
  if (!natis) return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
      NATIS fulfilment not yet initiated.
    </div>
  )

  const steps = [
    { label: 'Collection',   at: natis.collection_date },
    { label: 'Transfer',     at: natis.transfer_date },
    { label: 'Docs Sent',    at: natis.docs_sent_to_customer_date },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">NATIS Fulfilment</h3>
          <StatusBadge status={natis.transfer_status} />
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

        <InfoRow label="Collection Status" value={natis.collection_status} />
        <InfoRow label="Collector"         value={natis.collector_name} />
        <InfoRow label="Tracking Notes"    value={natis.tracking_notes} />
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
  tasks: TaskWithDeal[]
  onClaim: (id: string) => Promise<void>
  onComplete: (id: string) => Promise<void>
  onEscalate: (id: string) => Promise<void>
}) {
  const priorityColor: Record<string, string> = {
    LOW: 'bg-slate-100 text-slate-600', NORMAL: 'bg-blue-100 text-blue-700',
    HIGH: 'bg-orange-100 text-orange-800', URGENT: 'bg-red-100 text-red-800',
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
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor[task.priority] ?? priorityColor.NORMAL}`}>
                  {task.priority}
                </span>
                <StatusBadge status={task.status} variant="sm" />
                {task.queue && (
                  <span className="text-xs text-gray-400">{task.queue.replace(/^Q_/, '').replace(/_/g, ' ')}</span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900">{task.task_type}</p>
              {task.notes && <p className="mt-0.5 text-xs text-gray-500">{task.notes}</p>}
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

function AuditTab({ events }: { events: AuditFeedItem[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded((p) => {
    const next = new Set(p)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Time</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Event</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actor</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {events.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-sm text-gray-400">No audit events.</td>
            </tr>
          )}
          {events.map((ev) => (
            <>
              <tr key={`${ev.source}-${ev.id}`} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {format(new Date(ev.created_at), 'dd MMM HH:mm')}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-gray-800">{ev.event_type}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                    {ev.source === 'audit_logs' ? 'log' : 'event'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {ev.actor_type && (
                      <span className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                        {ev.actor_type}
                      </span>
                    )}
                    <span className="text-xs text-gray-600">{ev.actor ?? '—'}</span>
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
                <tr key={`${ev.source}-${ev.id}-detail`} className="bg-gray-50">
                  <td colSpan={5} className="px-4 py-3">
                    <pre className="rounded bg-gray-100 p-3 text-xs text-gray-700 overflow-auto">
                      {JSON.stringify(ev.details ?? {}, null, 2)}
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
  const profile = useProfile()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const [deal, setDeal] = useState<DealWithRelations | null>(null)
  const [docs, setDocs] = useState<Document[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [tasks, setTasks] = useState<TaskWithDeal[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditFeedItem[]>([])
  const [natis, setNatis] = useState<NatisFulfilment | null>(null)
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>([])
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
            listAuditFeed({ dealId: id }),
            getNatisFulfilment(id),
          ])

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = <T,>(r: PromiseSettledResult<T>): T | null =>
          r.status === 'fulfilled' ? r.value : null

        const dealResult = val(dealData)
        if (!dealResult) throw new Error('Deal not found')

        setDeal(dealResult)
        const docsList = val(docsData) ?? []
        setDocs(docsList)
        setQuotes(val(quotesData) ?? [])
        setInspection(val(inspData) ?? null)
        setContracts(val(contractsData) ?? [])
        setTasks(val(tasksData) ?? [])
        setAuditEvents(val(auditData) ?? [])
        setNatis(val(natisData) ?? null)

        // Load extraction results for the first Buyer document (best-effort).
        // If there's no buyer doc yet, the Buyer tab simply shows an empty
        // extraction panel.
        const firstBuyerDoc = docsList.find((d) => d.party === 'BUYER')
        if (firstBuyerDoc) {
          try {
            const results = await listExtractionResults(firstBuyerDoc.id)
            setExtractionResults(results)
          } catch (e) {
            console.warn('[DealDetail] extraction results fetch failed', e)
          }
        }
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

  // Resolve the current user's UUID for task assignment. Prefer the cached
  // profile from the Phase-2 auth context; fall back to a live auth lookup
  // if the profile isn't loaded yet.
  const resolveAgentId = async (): Promise<string | null> => {
    if (profile?.id) return profile.id
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  }

  const handleClaim = async (taskId: string) => {
    try {
      const agentId = await resolveAgentId()
      if (!agentId) {
        alert('No authenticated user — cannot claim task')
        return
      }
      const updated = await claimTask(taskId, agentId)
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...updated } : t))
    } catch { alert('Failed to claim task') }
  }

  const handleComplete = async (taskId: string) => {
    try {
      const updated = await completeTask(taskId)
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...updated } : t))
    } catch { alert('Failed to complete task') }
  }

  const handleEscalate = async (taskId: string) => {
    try {
      const updated = await escalateTask(taskId)
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...updated } : t))
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

  // The phase columns aren't yet in the auto-generated Supabase types, but
  // they are selected from `deals.*` and reach the runtime payload. Cast at
  // the read boundary so the hero/timeline can consume them safely.
  const dealWithPhase = deal as DealWithRelations & {
    current_phase?: string | null
    phase_state?: Record<string, unknown> | null
    completed_milestones?: string[] | null
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
              <h1 className="text-xl font-bold text-gray-900">{deal.deal_number ?? deal.id}</h1>
              <StatusBadge status={deal.status} />
            </div>
            {deal.vehicle?.registration_number && (
              <p className="mt-1 text-sm text-gray-500">
                <User className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
                Reg {deal.vehicle.registration_number}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {deal.assigned_fni_analyst && (
              <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-blue-700">
                F&I: {deal.assigned_fni_analyst}
              </span>
            )}
            {deal.assigned_seller_agent && (
              <span className="rounded-full bg-gray-100 border border-gray-200 px-2.5 py-1 text-gray-700">
                Seller: {deal.assigned_seller_agent}
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

      {/* Tab Content + sticky journey rail */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <DealHero deal={dealWithPhase} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
        {activeTab === 'overview'   && <OverviewTab deal={deal} onStatusChange={handleStatusChange} />}
        {activeTab === 'buyer'      && deal.buyer && <BuyerTab deal={deal} docs={docs} extractionResults={extractionResults} />}
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
        {activeTab === 'conversation' && <DealConversation dealId={deal.id} />}
        {activeTab === 'audit'      && <AuditTab events={auditEvents} />}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <PhaseTimeline
                currentPhase={dealWithPhase.current_phase ?? null}
                completedMilestones={dealWithPhase.completed_milestones ?? []}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
