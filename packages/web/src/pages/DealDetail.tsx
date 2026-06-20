import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, User, Car, FileText, DollarSign,
  FileSignature, Wrench, MapPin, ClipboardList, ScrollText,
  CheckCircle2, ExternalLink, RefreshCw, AlertCircle, MessageSquare,
  Upload, Trash2, CheckSquare,
  Plus, Truck, XCircle, Send,
  Pencil, ThumbsUp, ThumbsDown,
  Save, ShieldCheck, Mail,
  Wallet, StickyNote,
} from 'lucide-react'
import { NotesAndTasksPanel } from '../components/NotesAndTasksPanel'
import { AffordabilityTab } from '../components/AffordabilityTab'
import { StatusBadge } from '../components/StatusBadge'
import { SLAIndicator } from '../components/SLAIndicator'
import { VehiclePhotoPanel } from '../components/VehiclePhotoPanel'
import { VehicleCarousel } from '../components/VehicleCarousel'
import { ExtractionConfidencePanel } from '../components/ExtractionConfidencePanel'
import { DealConversation } from '../components/DealConversation'
import { DealHero } from '../components/DealHero'
import { PhaseStrip } from '../components/PhaseStrip'
import { DealOverviewDashboard } from '../components/DealOverviewDashboard'
import { SubTabs } from '../components/SubTabs'
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
  createNatisFulfilment,
  updateNatisCollection,
  updateNatisTransfer,
  updateNatisDelivery,
  cancelNatisFulfilment,
  claimTask,
  completeTask,
  escalateTask,
  markContractSigned,
  deleteContract,
  sendQuote,
  setQuoteStatus,
  updateSeller,
  uploadSellerDocument,
  listPhotos,
  createInspection,
  recordInspectionResults,
  updateInspectionNotes,
  uploadInspectionReport,
  createRemediationTask,
} from '../lib/queries'
import type { SellerDocType } from '../lib/queries'
import { ContractUploadModal } from '../components/ContractUploadModal'
import { QuoteFormModal } from '../components/QuoteFormModal'
import { DealStatusModal } from '../components/DealStatusModal'
import { PhaseActionModal } from '../components/PhaseActionModal'
import type {
  DealWithRelations, Quote, Inspection, Contract, TaskWithDeal, AuditFeedItem,
  NatisFulfilment, Document, ExtractionResult, VehiclePhoto,
} from '../types/database'


// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'overview'|'buyer'|'seller'|'vehicle'|'quote'|'affordability'|'contracts'|'inspection'|'natis'|'tasks'|'conversation'|'audit'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'buyer',       label: 'Buyer',       icon: <User className="h-4 w-4" /> },
  { id: 'seller',      label: 'Seller',      icon: <User className="h-4 w-4" /> },
  { id: 'vehicle',     label: 'Vehicle',     icon: <Car className="h-4 w-4" /> },
  { id: 'quote',       label: 'Quote',       icon: <DollarSign className="h-4 w-4" /> },
  { id: 'affordability', label: 'Affordability', icon: <Wallet className="h-4 w-4" /> },
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

// (Legacy OverviewTab removed — replaced by DealOverviewDashboard which
// gives a one-screen summary of every section instead of just key dates +
// status dropdown.)

// SubTabs moved to ../components/SubTabs.tsx so it can be reused outside
// this file (AffordabilityTab etc).

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
    <SubTabs
      panes={[
        {
          id: 'profile',
          label: 'Profile',
          icon: <User className="h-4 w-4" />,
          body: (
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
          ),
        },
        {
          id: 'documents',
          label: 'Documents',
          icon: <FileText className="h-4 w-4" />,
          badge: buyerDocs.length,
          body: (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Buyer Documents</h3>
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
                      <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-claimtec-forest hover:text-claimtec-forest-2">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          id: 'extractions',
          label: 'Extractions',
          icon: <ClipboardList className="h-4 w-4" />,
          badge: extractionResults.length,
          body: (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Extraction Results</h3>
              <ExtractionConfidencePanel results={extractionResults} />
            </div>
          ),
        },
      ]}
    />
  )
}

// ─── Seller tab ────────────────────────────────────────────────────────────────
//
// Required-document checklist drives both the status panel and the per-row
// upload UI. Each entry pairs the doc_type enum value with a human-readable
// label and whether it's mandatory or conditional (e.g. SETTLEMENT_LETTER
// is only needed if the vehicle still has finance).
const SELLER_REQUIRED_DOCS: { docType: SellerDocType; label: string; conditional?: boolean }[] = [
  { docType: 'SA_ID_SMART_CARD',  label: 'SA ID' },
  { docType: 'PROOF_OF_ADDRESS',  label: 'Proof of address' },
  { docType: 'BANK_STATEMENT',    label: 'Bank statement (proof of account)' },
  { docType: 'SETTLEMENT_LETTER', label: 'Settlement letter (if financed)', conditional: true },
  { docType: 'VEHICLE_NATIS',     label: 'NATIS / vehicle registration', conditional: true },
]

const BOT_API_URL = (import.meta.env.VITE_BOT_API_URL as string | undefined) ?? 'http://localhost:3001'

const ZA_ID_REGEX = /^\d{13}$/
const E164_REGEX = /^\+?[1-9]\d{7,14}$/
const BRANCH_CODE_REGEX = /^\d{6}$/

function SellerTab({
  deal,
  docs,
  onSellerUpdated,
  onDocsRefresh,
}: {
  deal: DealWithRelations
  docs: Document[]
  onSellerUpdated: (seller: NonNullable<DealWithRelations['seller']>) => void
  onDocsRefresh: () => Promise<void>
}) {
  const profile = useProfile()
  const seller = deal.seller
  const sellerDocs = docs.filter((d) => d.party === 'SELLER')

  const isEmpty = !seller
  const [editing, setEditing] = useState<boolean>(isEmpty)
  const [form, setForm] = useState({
    full_name: seller?.full_name ?? '',
    id_number: seller?.id_number ?? '',
    phone: seller?.phone ?? '',
    email: seller?.email ?? '',
    // SCHEMA GAP: NOT on `sellers` today — collected for ops continuity but
    // not persisted. Once the migration adds physical_address / bank_name /
    // account_number / branch_code, wire them through `updateSeller`.
    physical_address: '',
    bank_name: '',
    account_number: '',
    branch_code: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notifying, setNotifying] = useState(false)
  const [notifyMsg, setNotifyMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const validate = (): string | null => {
    if (!form.phone || !E164_REGEX.test(form.phone.replace(/\s/g, ''))) {
      return 'Phone must be a valid E.164 number (e.g. +27821234567).'
    }
    if (form.id_number && !ZA_ID_REGEX.test(form.id_number)) return 'ID number must be 13 digits.'
    if (form.branch_code && !BRANCH_CODE_REGEX.test(form.branch_code)) return 'Branch code must be 6 digits.'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setSaveError(err); return }
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateSeller(deal.id, {
        full_name: form.full_name || null,
        id_number: form.id_number || null,
        phone: form.phone.replace(/\s/g, ''),
        email: form.email || null,
      })
      onSellerUpdated(updated)
      setEditing(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save seller')
    } finally {
      setSaving(false)
    }
  }

  const handleNotify = async () => {
    if (!seller?.phone) { setNotifyMsg({ kind: 'err', text: 'Save the seller phone number first.' }); return }
    setNotifying(true)
    setNotifyMsg(null)
    try {
      const res = await fetch(`${BOT_API_URL}/api/notify-seller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: deal.id, ops_user_id: profile?.id ?? null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.success === false) throw new Error(body.error ?? `Request failed: ${res.status}`)
      setNotifyMsg({ kind: 'ok', text: body.message ?? 'Seller notified.' })
    } catch (e) {
      setNotifyMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to notify seller' })
    } finally {
      setNotifying(false)
    }
  }

  // Derived status — schema has no notified_at / vehicle_photos_count /
  // settlement_letter_status on `sellers`, so we infer from related state.
  const settlementDoc = sellerDocs.find((d) => d.doc_type === 'SETTLEMENT_LETTER')
  const consentGranted = !!seller?.consent_status
  const consentAt = seller?.consent_timestamp
  const sellerPhaseActive = (deal.status as string).startsWith('SELLER_')
  const vehiclePhotosState =
    (deal.status as string) === 'VEHICLE_PHOTOS_COMPLETE' ? 'Complete'
    : (deal.status as string) === 'VEHICLE_PHOTOS_PARTIAL' ? 'Partial'
    : 'Pending'

  const statusPane = (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Seller Status</h3>
          <button
            onClick={handleNotify}
            disabled={notifying || !seller?.phone}
            className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
            title={!seller?.phone ? 'Seller phone required' : 'Send WhatsApp intro to the seller'}
          >
            <Send className="h-3.5 w-3.5" />
            {notifying ? 'Sending…' : sellerPhaseActive ? 'Resend invite' : 'Notify seller'}
          </button>
        </div>

        {notifyMsg && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${
            notifyMsg.kind === 'ok'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>{notifyMsg.text}</div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SellerStatusCard icon={<ShieldCheck className="h-4 w-4" />} label="POPIA Consent"
            value={consentGranted ? 'Granted' : 'Pending'}
            sub={consentAt ? format(new Date(consentAt), 'dd MMM HH:mm') : null}
            tone={consentGranted ? 'good' : 'warn'} />
          <SellerStatusCard icon={<Mail className="h-4 w-4" />} label="WhatsApp Invite"
            value={sellerPhaseActive ? 'Sent' : 'Not yet sent'} sub={null}
            tone={sellerPhaseActive ? 'good' : 'neutral'} />
          <SellerStatusCard icon={<FileText className="h-4 w-4" />} label="Vehicle Photos"
            value={vehiclePhotosState} sub="see Vehicle tab"
            tone={vehiclePhotosState === 'Complete' ? 'good' : 'neutral'} />
          <SellerStatusCard icon={<FileText className="h-4 w-4" />} label="Settlement Letter"
            value={!settlementDoc ? 'Not provided' : settlementDoc.status === 'VERIFIED' ? 'Verified' : 'Uploaded'}
            sub={settlementDoc?.upload_timestamp ? format(new Date(settlementDoc.upload_timestamp), 'dd MMM') : null}
            tone={settlementDoc ? 'good' : 'neutral'} />
        </div>
      </div>
    </>
  )

  const profilePane = (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Seller Profile</h3>
          {!editing && !isEmpty && (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs text-claimtec-forest hover:text-claimtec-forest-2">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

        {isEmpty && !editing && (
          <p className="mb-3 text-sm text-gray-500">No seller captured yet — fill in seller details below.</p>
        )}

        {!editing && seller ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <InfoRow label="Full Name" value={seller.full_name ?? '—'} />
              <InfoRow label="ID Number" value={seller.id_number} />
              <InfoRow label="Phone"     value={seller.phone} />
              <InfoRow label="Email"     value={seller.email} />
            </div>
            <div>
              <InfoRow label="Consent Status" value={consentGranted ? 'Granted' : 'Not granted'} />
              <InfoRow label="Consent At" value={consentAt ? format(new Date(consentAt), 'dd MMM yyyy HH:mm') : null} />
              <p className="mt-2 text-[11px] text-gray-400 italic">
                Address &amp; banking captured during the WhatsApp flow
                (schema gap — not stored on the seller row today).
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SellerField label="Full Name" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} />
              <SellerField label="ID Number (13 digits)" value={form.id_number} onChange={(v) => setForm((f) => ({ ...f, id_number: v }))} placeholder="0000000000000" />
              <SellerField label="Phone (E.164)" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+27821234567" required />
              <SellerField label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="seller@example.com" />
              <SellerField label="Physical Address" value={form.physical_address} onChange={(v) => setForm((f) => ({ ...f, physical_address: v }))} disabled hint="schema gap — not persisted" />
              <SellerField label="Bank Name" value={form.bank_name} onChange={(v) => setForm((f) => ({ ...f, bank_name: v }))} disabled hint="schema gap — not persisted" />
              <SellerField label="Account Number" value={form.account_number} onChange={(v) => setForm((f) => ({ ...f, account_number: v }))} disabled hint="schema gap — not persisted" />
              <SellerField label="Branch Code (6 digits)" value={form.branch_code} onChange={(v) => setForm((f) => ({ ...f, branch_code: v }))} disabled hint="schema gap — not persisted" />
            </div>

            {saveError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</div>
            )}

            <div className="flex items-center gap-2">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-3 py-1.5 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save seller'}
              </button>
              {!isEmpty && (
                <button onClick={() => { setEditing(false); setSaveError(null) }} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )

  const requiredDocsPane = (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Required Documents</h3>
        <div className="space-y-2">
          {SELLER_REQUIRED_DOCS.map((req) => {
            const matches = sellerDocs.filter((d) => d.doc_type === req.docType)
            const latest = matches[matches.length - 1]
            return (
              <SellerDocRow key={req.docType} dealId={deal.id} docType={req.docType} label={req.label}
                conditional={!!req.conditional} doc={latest ?? null} onUploaded={onDocsRefresh} />
            )
          })}
        </div>
      </div>
    </>
  )

  const allDocsPane = (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">All Seller Documents</h3>
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
                  <p className="text-xs text-gray-400">Uploaded {format(new Date(doc.upload_timestamp), 'dd MMM HH:mm')}</p>
                )}
              </div>
              <StatusBadge status={doc.status} variant="sm" />
              {doc.file_url && (
                <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-claimtec-forest hover:text-claimtec-forest-2">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const requiredDocsCount = SELLER_REQUIRED_DOCS.filter((req) =>
    sellerDocs.some((d) => d.doc_type === req.docType)
  ).length

  return (
    <SubTabs
      panes={[
        { id: 'status',    label: 'Status',          icon: <ShieldCheck className="h-4 w-4" />, body: statusPane },
        { id: 'profile',   label: 'Profile',         icon: <User        className="h-4 w-4" />, body: profilePane },
        {
          id: 'required',
          label: 'Required docs',
          icon: <FileText    className="h-4 w-4" />,
          badge: `${requiredDocsCount}/${SELLER_REQUIRED_DOCS.length}`,
          body: requiredDocsPane,
        },
        {
          id: 'all-docs',
          label: 'All documents',
          icon: <FileText    className="h-4 w-4" />,
          badge: sellerDocs.length,
          body: allDocsPane,
        },
      ]}
    />
  )
}

function SellerStatusCard({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode; label: string; value: string; sub: string | null; tone: 'good' | 'warn' | 'neutral'
}) {
  const toneCls = tone === 'good' ? 'border-green-200 bg-green-50 text-green-800'
                : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-gray-200 bg-gray-50 text-gray-700'
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
        {icon} {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      {sub && <div className="text-[11px] opacity-70">{sub}</div>}
    </div>
  )
}

function SellerField({
  label, value, onChange, placeholder, required, disabled, hint,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; required?: boolean; disabled?: boolean; hint?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-claimtec-forest focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
      />
      {hint && <span className="mt-1 block text-[10px] italic text-gray-400">{hint}</span>}
    </label>
  )
}

function SellerDocRow({
  dealId, docType, label, conditional, doc, onUploaded,
}: {
  dealId: string; docType: SellerDocType; label: string; conditional: boolean
  doc: Document | null; onUploaded: () => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setUploading(true)
    setErr(null)
    try {
      await uploadSellerDocument({ dealId, docType, file })
      await onUploaded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${doc ? 'bg-green-500' : conditional ? 'bg-gray-300' : 'bg-amber-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {label} {conditional && <span className="text-[10px] text-gray-400 ml-1">conditional</span>}
        </p>
        {doc?.file_name && <p className="text-xs text-gray-400 truncate">{doc.file_name}</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
      {doc ? (
        <>
          <StatusBadge status={doc.status} variant="sm" />
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-claimtec-forest hover:text-claimtec-forest-2">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </>
      ) : (
        <label className="inline-flex items-center gap-1 cursor-pointer text-xs text-claimtec-forest hover:text-claimtec-forest-2">
          <Upload className="h-3.5 w-3.5" />
          {uploading ? 'Uploading…' : 'Upload'}
          <input
            type="file" className="hidden" disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

function VehicleTab({ deal }: { deal: DealWithRelations }) {
  const v = deal.vehicle!
  const [photos, setPhotos] = useState<VehiclePhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)

  // Realtime: re-fetch when a new photo is inserted by the bot. Listening on
  // vehicle_photos with no filter (we filter by photo_set_id client-side).
  useEffect(() => {
    let alive = true
    setPhotosLoading(true)
    listPhotos(deal.id)
      .then((p) => { if (alive) setPhotos(p) })
      .catch((e) => console.warn('[VehicleTab] photo load failed:', e))
      .finally(() => { if (alive) setPhotosLoading(false) })

    const channel = supabase
      .channel(`deal-photos-${deal.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vehicle_photos' },
        () => { listPhotos(deal.id).then((p) => alive && setPhotos(p)).catch(() => {}) },
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vehicle_photos' },
        () => { listPhotos(deal.id).then((p) => alive && setPhotos(p)).catch(() => {}) },
      )
      .subscribe()
    return () => { alive = false; supabase.removeChannel(channel) }
  }, [deal.id])

  return (
    <SubTabs
      panes={[
        {
          id: 'details',
          label: 'Details',
          icon: <Car className="h-4 w-4" />,
          body: (
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
                </div>
              </div>
            </div>
          ),
        },
        {
          id: 'spin',
          label: '360° View',
          icon: <Car className="h-4 w-4" />,
          badge: photosLoading ? undefined : photos.length,
          body: <VehicleCarousel photos={photos} />,
        },
        {
          id: 'photos',
          label: 'Photo QA',
          icon: <FileText className="h-4 w-4" />,
          badge: photosLoading ? undefined : photos.length,
          body: <VehiclePhotoPanel photos={photos} />,
        },
      ]}
    />
  )
}

function QuoteTab({
  dealId,
  quotes,
  preparedBy,
  onQuotesChange,
}: {
  dealId: string
  quotes: Quote[]
  preparedBy?: string | null
  onQuotesChange: (next: Quote[]) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const sorted = [...quotes].sort((a, b) =>
    (a.created_at < b.created_at ? 1 : -1),
  )

  const upsert = (q: Quote) => {
    const exists = quotes.some((x) => x.id === q.id)
    onQuotesChange(exists ? quotes.map((x) => (x.id === q.id ? q : x)) : [q, ...quotes])
  }

  const handleSend = async (q: Quote) => {
    if (!confirm('Send this quote to the buyer? Status will change to SENT.')) return
    setBusyId(q.id)
    try {
      const updated = await sendQuote(q.id)
      upsert(updated)
    } catch (e) {
      alert(`Failed to send quote: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  const handleStatus = async (
    q: Quote,
    status: 'ACCEPTED' | 'DECLINED',
  ) => {
    let reason: string | null = null
    if (status === 'DECLINED') {
      const r = prompt('Decline reason (optional):')
      if (r === null) return // cancelled
      reason = r.trim() || null
    } else if (!confirm('Mark this quote as ACCEPTED?')) {
      return
    }
    setBusyId(q.id)
    try {
      const updated = await setQuoteStatus(q.id, status, { decline_reason: reason })
      upsert(updated)
    } catch (e) {
      alert(`Failed to update quote: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  const editable = (status: string) => status === 'DRAFT' || status === 'PENDING'

  const ACTIVE_STATUSES = new Set(['DRAFT', 'SENT', 'PENDING'])
  const activeQuotes = sorted.filter((q) => ACTIVE_STATUSES.has(q.status))
  const historyQuotes = sorted.filter((q) => !ACTIVE_STATUSES.has(q.status))

  const renderQuoteCard = (q: Quote) => {
        const busy = busyId === q.id
        const sentMarker = q.sent_at != null
        return (
          <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-700">Quote</h3>
                <StatusBadge status={q.status} />
                {sentMarker && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-claimtec-forest/5 px-2 py-0.5 text-xs font-medium text-claimtec-forest-2 ring-1 ring-inset ring-claimtec-forest/20">
                    <Send className="h-3 w-3" /> Sent to buyer
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {editable(q.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setEditing(q); setModalOpen(true) }}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    title="Edit quote"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                {q.status === 'DRAFT' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSend(q)}
                    className="inline-flex items-center gap-1 rounded-md border border-transparent bg-claimtec-forest px-2 py-1 text-xs font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
                    title="Send to buyer"
                  >
                    <Send className="h-3.5 w-3.5" /> Send
                  </button>
                )}
                {(q.status === 'SENT' || q.status === 'DRAFT') && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleStatus(q, 'ACCEPTED')}
                      className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                      title="Mark accepted"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> Accept
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleStatus(q, 'DECLINED')}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      title="Mark declined"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" /> Decline
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                { label: 'Balance to Finance', value: q.finance_amount != null ? `R ${q.finance_amount.toLocaleString()}` : '—' },
                { label: 'Balloon',            value: `R ${q.balloon_amount.toLocaleString()}` },
                { label: 'Interest Rate',      value: q.interest_rate != null ? `${q.interest_rate}% p.a.` : '—' },
                { label: 'Term',               value: q.term_months != null ? `${q.term_months} months` : '—' },
                { label: 'Monthly Install.',   value: q.monthly_instalment != null ? `R ${q.monthly_instalment.toLocaleString()}` : '—' },
                { label: 'Total Repayable',    value: q.total_credit_cost != null ? `R ${q.total_credit_cost.toLocaleString()}` : '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-500">{item.label}</p>
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
        )
      }

  const newQuoteButton = (
    <div className="flex items-center justify-end mb-3">
      <button
        type="button"
        onClick={() => { setEditing(null); setModalOpen(true) }}
        className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-claimtec-forest px-3 py-1.5 text-sm font-medium text-white hover:bg-claimtec-forest-2"
      >
        <Plus className="h-4 w-4" /> New Quote
      </button>
    </div>
  )

  const emptyState = (msg: string) => (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">{msg}</div>
  )

  return (
    <>
      <SubTabs
        panes={[
          {
            id: 'active',
            label: 'Active',
            icon: <DollarSign className="h-4 w-4" />,
            badge: activeQuotes.length,
            body: (
              <div className="space-y-3">
                {newQuoteButton}
                {activeQuotes.length === 0
                  ? emptyState('No active quotes — create one with the button above.')
                  : activeQuotes.map(renderQuoteCard)}
              </div>
            ),
          },
          {
            id: 'history',
            label: 'History',
            icon: <ScrollText className="h-4 w-4" />,
            badge: historyQuotes.length,
            body: (
              <div className="space-y-3">
                {historyQuotes.length === 0
                  ? emptyState('No accepted, declined, or expired quotes yet.')
                  : historyQuotes.map(renderQuoteCard)}
              </div>
            ),
          },
        ]}
      />

      {modalOpen && (
        <QuoteFormModal
          dealId={dealId}
          quote={editing}
          preparedBy={preparedBy}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSaved={(saved) => upsert(saved)}
        />
      )}
    </>
  )
}

function ContractsTab({
  dealId,
  contracts,
  onChanged,
}: {
  dealId: string
  contracts: Contract[]
  onChanged: () => void
}) {
  const [showUpload, setShowUpload] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const grouped: Record<string, Contract[]> = {
    BUYER_FINANCE_AGREEMENT: contracts.filter((c) => c.contract_type === 'BUYER_FINANCE_AGREEMENT'),
    SELLER_AGREEMENT:        contracts.filter((c) => c.contract_type === 'SELLER_AGREEMENT'),
  }

  async function handleMarkSigned(c: Contract) {
    const name = window.prompt('Signatory name (as shown on the signed contract)?', c.signatory_name ?? '')
    if (!name || !name.trim()) return
    setBusyId(c.id)
    setError(null)
    try {
      await markContractSigned(c.id, name.trim())
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark signed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(c: Contract) {
    if (!window.confirm('Delete this draft contract? The PDF will be removed.')) return
    setBusyId(c.id)
    setError(null)
    try {
      await deleteContract(c.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete contract')
    } finally {
      setBusyId(null)
    }
  }

  const renderTypePane = (type: 'BUYER_FINANCE_AGREEMENT' | 'SELLER_AGREEMENT', label: string) => {
    const list = grouped[type]
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-3 py-1.5 text-sm font-medium text-white hover:bg-claimtec-forest-2"
          >
            <Upload className="h-3.5 w-3.5" /> Upload contract
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No {label.toLowerCase()} yet — upload it with the button above.
          </div>
        ) : (
          list.map((c) => {
                const isSigned = c.signature_status === 'SIGNED'
                const busy = busyId === c.id
                return (
                  <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-700">{label}</h4>
                      <StatusBadge status={c.signature_status} />
                    </div>
                    <InfoRow label="Signatory"    value={c.signatory_name} />
                    <InfoRow label="Generated"    value={c.generated_at ? format(new Date(c.generated_at), 'dd MMM yyyy HH:mm') : null} />
                    <InfoRow label="Signed At"    value={c.signed_at ? format(new Date(c.signed_at), 'dd MMM yyyy HH:mm') : null} />
                    <InfoRow label="Provider Ref" value={c.signing_provider_ref} />

                    <div className="mt-3 flex flex-wrap gap-3">
                      {c.file_url && (
                        <a
                          href={c.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-claimtec-forest hover:text-claimtec-forest-2"
                        >
                          <ExternalLink className="h-4 w-4" /> View / Download PDF
                        </a>
                      )}
                      {c.signing_link && (
                        <a
                          href={c.signing_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-claimtec-forest hover:text-claimtec-forest-2"
                        >
                          <ExternalLink className="h-4 w-4" /> Signing link
                        </a>
                      )}
                      {!isSigned && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMarkSigned(c)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <CheckSquare className="h-3.5 w-3.5" />
                            Mark signed
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete draft
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
        )}
      </div>
    )
  }

  return (
    <>
      <SubTabs
        panes={[
          {
            id: 'buyer-finance',
            label: 'Buyer Finance',
            icon: <FileSignature className="h-4 w-4" />,
            badge: grouped.BUYER_FINANCE_AGREEMENT.length,
            body: renderTypePane('BUYER_FINANCE_AGREEMENT', 'Buyer Finance Agreement'),
          },
          {
            id: 'seller-agreement',
            label: 'Seller Agreement',
            icon: <FileSignature className="h-4 w-4" />,
            badge: grouped.SELLER_AGREEMENT.length,
            body: renderTypePane('SELLER_AGREEMENT', 'Seller Agreement / OTP'),
          },
        ]}
      />

      {showUpload && (
        <ContractUploadModal
          dealId={dealId}
          onClose={() => setShowUpload(false)}
          onUploaded={onChanged}
        />
      )}
    </>
  )
}

function InspectionTab({
  deal,
  inspection,
  onChange,
}: {
  deal: DealWithRelations
  inspection: Inspection | null
  onChange: (next: Inspection | null) => void
}) {
  const [showSchedule, setShowSchedule] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(inspection?.notes ?? '')
  const [busy, setBusy] = useState(false)

  // ─── Schedule form state ───────────────────────────────────────────────
  const [schedDate, setSchedDate] = useState('')
  const [schedInspector, setSchedInspector] = useState('')
  const [schedNotes, setSchedNotes] = useState('')

  // ─── Results form state ───────────────────────────────────────────────
  const [resPassed, setResPassed] = useState<boolean | null>(null)
  const [resCondition, setResCondition] = useState('')
  const [resDamage, setResDamage] = useState('')
  const [resNotes, setResNotes] = useState('')
  const [resCompleted, setResCompleted] = useState(new Date().toISOString().slice(0, 10))
  const [resFile, setResFile] = useState<File | null>(null)
  const [createRemediation, setCreateRemediation] = useState(true)

  const handleSchedule = async () => {
    if (!deal.vehicle?.id) {
      alert('No vehicle linked to this deal — cannot schedule inspection.')
      return
    }
    setBusy(true)
    try {
      const created = await createInspection({
        deal_id: deal.id,
        vehicle_id: deal.vehicle.id,
        scheduled_date: schedDate || null,
        inspector_name: schedInspector || null,
        notes: schedNotes || null,
      })
      onChange(created)
      setShowSchedule(false)
      setSchedDate(''); setSchedInspector(''); setSchedNotes('')
    } catch (e) {
      alert(`Failed to schedule inspection: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleRecordResults = async () => {
    if (!inspection) return
    if (resPassed === null) {
      alert('Mark the inspection as Passed or Failed before saving.')
      return
    }
    setBusy(true)
    try {
      let reportUrl: string | undefined
      if (resFile) {
        try {
          const updated = await uploadInspectionReport(inspection.id, deal.id, resFile)
          reportUrl = updated.report_url ?? undefined
        } catch (e) {
          // Storage bucket likely missing — degrade gracefully and continue
          // saving the rest of the result so ops aren't blocked.
          console.warn('[InspectionTab] report upload failed; continuing without file', e)
          alert(
            'Report upload failed (the `inspection-reports` storage bucket may not be provisioned yet). Saving the rest of the result.',
          )
        }
      }
      const next = await recordInspectionResults(inspection.id, {
        completed_date: resCompleted || null,
        passed: resPassed,
        overall_condition: resCondition || null,
        damage_summary: resDamage || null,
        notes: resNotes || null,
        ...(reportUrl ? { report_url: reportUrl } : {}),
      })
      onChange(next)

      if (!resPassed && createRemediation) {
        await createRemediationTask(
          deal.id,
          `Inspection failed${resDamage ? `: ${resDamage}` : ''}${resNotes ? ` — ${resNotes}` : ''}`,
        )
      }
      setShowResults(false)
      setResPassed(null); setResCondition(''); setResDamage(''); setResNotes(''); setResFile(null)
    } catch (e) {
      alert(`Failed to record results: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!inspection) return
    setBusy(true)
    try {
      const next = await updateInspectionNotes(inspection.id, notesDraft)
      onChange(next)
      setEditingNotes(false)
    } catch (e) {
      alert(`Failed to save notes: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  // ─── Empty state ───────────────────────────────────────────────────────
  if (!inspection) {
    return (
      <div className="space-y-4">
        {!showSchedule ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <Wrench className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              No inspection yet for this deal.
            </p>
            <p className="text-xs text-gray-400">
              The seller must arrange a roadworthy + technical inspection before contract sign.
            </p>
            <button
              onClick={() => setShowSchedule(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2"
            >
              <Plus className="h-4 w-4" /> Schedule one
            </button>
          </div>
        ) : (
          <ScheduleForm
            busy={busy}
            schedDate={schedDate} setSchedDate={setSchedDate}
            schedInspector={schedInspector} setSchedInspector={setSchedInspector}
            schedNotes={schedNotes} setSchedNotes={setSchedNotes}
            onCancel={() => setShowSchedule(false)}
            onSubmit={handleSchedule}
          />
        )}
      </div>
    )
  }

  const isComplete = inspection.status === 'COMPLETE'
  const isFailed = inspection.status === 'FAILED'
  const isScheduled = !isComplete && !isFailed

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Hartcon Inspection</h3>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isComplete ? 'bg-green-100 text-green-800'
                  : isFailed ? 'bg-red-100 text-red-800'
                  : 'bg-claimtec-forest/10 text-claimtec-forest-2'
              }`}
            >
              {inspection.status}
            </span>
          </div>
        </div>

        <InfoRow label="Inspector"         value={inspection.inspector_name} />
        <InfoRow label="Scheduled"         value={inspection.scheduled_date ? format(new Date(inspection.scheduled_date), 'dd MMM yyyy') : null} />
        <InfoRow label="Completed"         value={inspection.completed_date ? format(new Date(inspection.completed_date), 'dd MMM yyyy') : null} />
        <InfoRow label="Overall Condition" value={inspection.overall_condition} />
        <InfoRow label="Damage Summary"    value={inspection.damage_summary} />

        <div className="flex items-start py-2.5 border-b border-gray-50">
          <span className="w-44 flex-shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</span>
          <div className="flex-1">
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md bg-claimtec-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingNotes(false); setNotesDraft(inspection.notes ?? '') }}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="text-sm text-gray-900 flex-1">
                  {inspection.notes ?? <span className="italic text-gray-400">—</span>}
                </span>
                <button
                  onClick={() => { setNotesDraft(inspection.notes ?? ''); setEditingNotes(true) }}
                  className="text-gray-400 hover:text-claimtec-forest"
                  aria-label="Edit notes"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {inspection.report_url && (
          <a
            href={inspection.report_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-claimtec-forest hover:text-claimtec-forest-2"
          >
            <ExternalLink className="h-4 w-4" /> View / download report
          </a>
        )}

        {/* ─── Action buttons ─── */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {isScheduled && !showResults && (
            <button
              onClick={() => setShowResults(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-3 py-1.5 text-sm font-medium text-white hover:bg-claimtec-forest-2"
            >
              <CheckSquare className="h-4 w-4" /> Record results
            </button>
          )}
          {(isComplete || isFailed) && !showResults && (
            <button
              onClick={() => {
                setResPassed(isComplete)
                setResCondition(inspection.overall_condition ?? '')
                setResDamage(inspection.damage_summary ?? '')
                setResNotes(inspection.notes ?? '')
                setResCompleted(inspection.completed_date ?? new Date().toISOString().slice(0, 10))
                setShowResults(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              <Pencil className="h-4 w-4" /> Update results
            </button>
          )}
          {isFailed && (
            <button
              onClick={async () => {
                if (!confirm('Create a remediation task for this failed inspection?')) return
                try {
                  await createRemediationTask(deal.id, `Remediation for failed inspection ${inspection.id}`)
                  alert('Remediation task created.')
                } catch (e) {
                  alert(`Failed: ${e instanceof Error ? e.message : 'unknown error'}`)
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              <AlertCircle className="h-4 w-4" /> Create remediation task
            </button>
          )}
        </div>
      </div>

      {showResults && (
        <ResultsForm
          busy={busy}
          completed={resCompleted} setCompleted={setResCompleted}
          passed={resPassed} setPassed={setResPassed}
          condition={resCondition} setCondition={setResCondition}
          damage={resDamage} setDamage={setResDamage}
          notes={resNotes} setNotes={setResNotes}
          file={resFile} setFile={setResFile}
          createRemediation={createRemediation} setCreateRemediation={setCreateRemediation}
          onCancel={() => setShowResults(false)}
          onSubmit={handleRecordResults}
        />
      )}
    </div>
  )
}

function ScheduleForm({
  busy,
  schedDate, setSchedDate,
  schedInspector, setSchedInspector,
  schedNotes, setSchedNotes,
  onCancel, onSubmit,
}: {
  busy: boolean
  schedDate: string; setSchedDate: (v: string) => void
  schedInspector: string; setSchedInspector: (v: string) => void
  schedNotes: string; setSchedNotes: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Schedule Inspection</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Scheduled Date</span>
          <input
            type="date"
            value={schedDate}
            onChange={(e) => setSchedDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Inspector</span>
          <input
            type="text"
            value={schedInspector}
            onChange={(e) => setSchedInspector(e.target.value)}
            placeholder="e.g. Hartcon — John Smith"
            className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes / Location</span>
        <textarea
          value={schedNotes}
          onChange={(e) => setSchedNotes(e.target.value)}
          rows={3}
          placeholder="Site address, contact instructions, etc."
          className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
        />
      </label>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSubmit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
        >
          {busy ? 'Scheduling…' : 'Schedule'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ResultsForm({
  busy,
  completed, setCompleted,
  passed, setPassed,
  condition, setCondition,
  damage, setDamage,
  notes, setNotes,
  file, setFile,
  createRemediation, setCreateRemediation,
  onCancel, onSubmit,
}: {
  busy: boolean
  completed: string; setCompleted: (v: string) => void
  passed: boolean | null; setPassed: (v: boolean) => void
  condition: string; setCondition: (v: string) => void
  damage: string; setDamage: (v: string) => void
  notes: string; setNotes: (v: string) => void
  file: File | null; setFile: (f: File | null) => void
  createRemediation: boolean; setCreateRemediation: (v: boolean) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Record Inspection Results</h3>

      {/* ─── Pass/Fail toggle ─── */}
      <div className="mb-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Outcome</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPassed(true)}
            className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition ${
              passed === true
                ? 'border-green-600 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-green-300'
            }`}
          >
            <ThumbsUp className="h-4 w-4" /> Passed
          </button>
          <button
            type="button"
            onClick={() => setPassed(false)}
            className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition ${
              passed === false
                ? 'border-red-600 bg-red-50 text-red-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-red-300'
            }`}
          >
            <ThumbsDown className="h-4 w-4" /> Failed
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Completed Date</span>
          <input
            type="date"
            value={completed}
            onChange={(e) => setCompleted(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overall Condition</span>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
          >
            <option value="">— select —</option>
            <option value="EXCELLENT">Excellent</option>
            <option value="GOOD">Good</option>
            <option value="FAIR">Fair</option>
            <option value="POOR">Poor</option>
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Damage Summary</span>
        <textarea
          value={damage}
          onChange={(e) => setDamage(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Inspection Report (PDF — optional)
        </span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-claimtec-forest/5 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-claimtec-forest-2 hover:file:bg-claimtec-forest/10"
          />
          {file && (
            <button
              onClick={() => setFile(null)}
              className="text-gray-400 hover:text-red-600"
              aria-label="Remove file"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Upload requires the <code className="font-mono">inspection-reports</code> Supabase Storage bucket.
        </p>
      </label>

      {passed === false && (
        <label className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <input
            type="checkbox"
            checked={createRemediation}
            onChange={(e) => setCreateRemediation(e.target.checked)}
            className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
          />
          Auto-create a remediation task on save
        </label>
      )}

      <div className="mt-5 flex gap-2">
        <button
          onClick={onSubmit}
          disabled={busy || passed === null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {busy ? 'Saving…' : 'Save results'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function NATISTab({
  natis,
  dealId,
  onChange,
}: {
  natis: NatisFulfilment | null
  dealId: string
  onChange: (next: NatisFulfilment | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const wrap = async (fn: () => Promise<NatisFulfilment | null>) => {
    setBusy(true); setErr(null)
    try {
      const next = await fn()
      onChange(next)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'NATIS update failed'
      setErr(/row-level security|RLS|permission/i.test(msg)
        ? 'Permission denied. Your role may not allow NATIS writes — contact ops admin.'
        : msg)
    } finally {
      setBusy(false)
    }
  }

  if (!natis) {
    return (
      <div className="space-y-3">
        {err && <NatisErrorBanner message={err} />}
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500 mb-4">No NATIS process started.</p>
          <button
            disabled={busy}
            onClick={() => wrap(() => createNatisFulfilment(dealId))}
            className="inline-flex items-center gap-2 rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Start fulfilment
          </button>
        </div>
      </div>
    )
  }

  const cancelled =
    natis.collection_status === 'CANCELLED' || natis.transfer_status === 'CANCELLED'
  const collected = !!natis.collection_date
  const transferred = !!natis.transfer_date
  const delivered = !!natis.docs_sent_to_customer_date

  const headline = cancelled
    ? 'CANCELLED'
    : delivered
      ? 'DELIVERED'
      : transferred
        ? 'TRANSFERRED'
        : collected
          ? 'COLLECTED'
          : 'PENDING'

  const steps = [
    { label: 'Pending',     done: true,                                   at: natis.created_at },
    { label: 'Collected',   done: collected || transferred || delivered, at: natis.collection_date },
    { label: 'Transferred', done: transferred || delivered,              at: natis.transfer_date },
    { label: 'Delivered',   done: delivered,                              at: natis.docs_sent_to_customer_date },
  ]

  return (
    <div className="space-y-4">
      {err && <NatisErrorBanner message={err} />}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">NATIS Fulfilment</h3>
          <StatusBadge status={headline} />
        </div>

        <div className="flex items-center gap-0 mb-4">
          {steps.map((step, i) => {
            const done = step.done && !cancelled
            const ringColor = cancelled
              ? 'bg-gray-300 border-gray-300'
              : done
                ? 'bg-green-500 border-green-500'
                : 'bg-white border-gray-300'
            const lineColor = cancelled ? 'bg-gray-200' : done ? 'bg-green-400' : 'bg-gray-200'
            return (
              <div key={step.label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className={`h-6 w-6 rounded-full border-2 ${ringColor}`} />
                  <span className="text-xs text-gray-600">{step.label}</span>
                  {step.at && (
                    <span className="text-[10px] text-gray-400">
                      {format(new Date(step.at), 'dd MMM')}
                    </span>
                  )}
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-0.5 mb-5 mx-1 ${lineColor}`} />}
              </div>
            )
          })}
        </div>

        <InfoRow label="Collection Status" value={natis.collection_status} />
        <InfoRow label="Transfer Status"   value={natis.transfer_status} />
        <InfoRow label="Collector"         value={natis.collector_name} />
        {natis.tracking_notes && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Activity log</p>
            <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700 font-mono">
              {natis.tracking_notes}
            </pre>
          </div>
        )}
      </div>

      {!cancelled && !collected && (
        <NatisCollectionForm
          busy={busy}
          onSubmit={(input) => wrap(() => updateNatisCollection(dealId, input, natis.tracking_notes))}
        />
      )}

      {!cancelled && collected && !transferred && (
        <NatisTransferForm
          busy={busy}
          onSubmit={(input) => wrap(() => updateNatisTransfer(dealId, input, natis.tracking_notes))}
        />
      )}

      {!cancelled && transferred && !delivered && (
        <NatisDeliveryForm
          busy={busy}
          onSubmit={(input) => wrap(() => updateNatisDelivery(dealId, input, natis.tracking_notes))}
        />
      )}

      {!cancelled && !delivered && (
        <NatisCancelForm
          busy={busy}
          onSubmit={(reason) => wrap(() => cancelNatisFulfilment(dealId, reason, natis.tracking_notes))}
        />
      )}

      {delivered && !cancelled && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="mr-2 inline h-4 w-4" /> NATIS fulfilment complete.
        </div>
      )}
    </div>
  )
}

function NatisErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function NatisStageCard({
  title, icon, children,
}: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        {icon} {title}
      </h4>
      {children}
    </div>
  )
}

const natisInputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none focus:ring-1 focus:ring-claimtec-forest'

function NatisFieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-gray-600 mb-1 block">{children}</label>
}

function natisToday() {
  return new Date().toISOString().slice(0, 10)
}

function NatisCollectionForm({
  busy, onSubmit,
}: {
  busy: boolean
  onSubmit: (input: { collection_date: string; collector_name: string; notes?: string }) => void
}) {
  const [date, setDate] = useState(natisToday())
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <NatisStageCard title="Mark Collected" icon={<CheckSquare className="h-4 w-4 text-claimtec-forest" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <NatisFieldLabel>Collection date</NatisFieldLabel>
          <input type="date" className={natisInputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <NatisFieldLabel>Collector name</NatisFieldLabel>
          <input
            type="text" className={natisInputCls} value={name}
            placeholder="Runner / driver / agent"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <NatisFieldLabel>Notes (optional)</NatisFieldLabel>
          <textarea className={natisInputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          disabled={busy || !date || !name.trim()}
          onClick={() => onSubmit({
            collection_date: date,
            collector_name: name.trim(),
            notes: notes.trim() || undefined,
          })}
          className="rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
        >
          Save collection
        </button>
      </div>
    </NatisStageCard>
  )
}

function NatisTransferForm({
  busy, onSubmit,
}: {
  busy: boolean
  onSubmit: (input: { transfer_date: string; reference_number?: string; notes?: string }) => void
}) {
  const [date, setDate] = useState(natisToday())
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <NatisStageCard title="Mark Transferred (eNaTIS)" icon={<FileSignature className="h-4 w-4 text-claimtec-forest" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <NatisFieldLabel>Transfer date</NatisFieldLabel>
          <input type="date" className={natisInputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <NatisFieldLabel>eNaTIS reference (optional)</NatisFieldLabel>
          <input
            type="text" className={natisInputCls} value={ref}
            placeholder="e.g. ENT-2026-001234"
            onChange={(e) => setRef(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <NatisFieldLabel>Notes (optional)</NatisFieldLabel>
          <textarea className={natisInputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          disabled={busy || !date}
          onClick={() => onSubmit({
            transfer_date: date,
            reference_number: ref.trim() || undefined,
            notes: notes.trim() || undefined,
          })}
          className="rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
        >
          Save transfer
        </button>
      </div>
    </NatisStageCard>
  )
}

function NatisDeliveryForm({
  busy, onSubmit,
}: {
  busy: boolean
  onSubmit: (input: { docs_sent_to_customer_date: string; courier_tracking?: string; notes?: string }) => void
}) {
  const [date, setDate] = useState(natisToday())
  const [tracking, setTracking] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <NatisStageCard title="Mark Delivered to Customer" icon={<Truck className="h-4 w-4 text-claimtec-forest" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <NatisFieldLabel>Sent date</NatisFieldLabel>
          <input type="date" className={natisInputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <NatisFieldLabel>Courier tracking (optional)</NatisFieldLabel>
          <input
            type="text" className={natisInputCls} value={tracking}
            placeholder="e.g. RAM 1234567890"
            onChange={(e) => setTracking(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <NatisFieldLabel>Notes (optional)</NatisFieldLabel>
          <textarea className={natisInputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          disabled={busy || !date}
          onClick={() => onSubmit({
            docs_sent_to_customer_date: date,
            courier_tracking: tracking.trim() || undefined,
            notes: notes.trim() || undefined,
          })}
          className="inline-flex items-center gap-2 rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Save delivery
        </button>
      </div>
    </NatisStageCard>
  )
}

function NatisCancelForm({
  busy, onSubmit,
}: { busy: boolean; onSubmit: (reason: string) => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (!open) {
    return (
      <div className="text-right">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800"
        >
          <XCircle className="h-3.5 w-3.5" /> Cancel / mark failed
        </button>
      </div>
    )
  }

  return (
    <NatisStageCard title="Cancel NATIS Fulfilment" icon={<XCircle className="h-4 w-4 text-red-600" />}>
      <NatisFieldLabel>Reason</NatisFieldLabel>
      <textarea
        className={natisInputCls} rows={3} value={reason}
        placeholder="e.g. Seller failed to produce NATIS doc; deal unwound."
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => { setOpen(false); setReason('') }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          disabled={busy || !reason.trim()}
          onClick={() => onSubmit(reason.trim())}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Confirm cancel
        </button>
      </div>
    </NatisStageCard>
  )
}

function TasksTab({
  dealId,
  tasks,
  onClaim,
  onComplete,
  onEscalate,
}: {
  dealId: string
  tasks: TaskWithDeal[]
  onClaim: (id: string) => Promise<void>
  onComplete: (id: string) => Promise<void>
  onEscalate: (id: string) => Promise<void>
}) {
  const priorityColor: Record<string, string> = {
    LOW: 'bg-slate-100 text-slate-600', NORMAL: 'bg-claimtec-forest/10 text-claimtec-forest-2',
    HIGH: 'bg-orange-100 text-orange-800', URGENT: 'bg-red-100 text-red-800',
  }

  const openTasks      = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS' || t.status === 'ESCALATED')
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED')

  const renderTaskList = (list: TaskWithDeal[], emptyMsg: string) => (
    <div className="space-y-3">
      {list.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          {emptyMsg}
        </div>
      )}
      {list.map((task) => (
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
                  <button onClick={() => onClaim(task.id)} className="text-xs text-claimtec-forest-2 hover:underline">Claim</button>
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

  return (
    <SubTabs
      panes={[
        {
          id: 'open',
          label: 'Open',
          icon: <ClipboardList className="h-4 w-4" />,
          badge: openTasks.length,
          body: renderTaskList(openTasks, 'No open tasks for this deal.'),
        },
        {
          id: 'completed',
          label: 'Completed',
          icon: <CheckCircle2 className="h-4 w-4" />,
          badge: completedTasks.length,
          body: renderTaskList(completedTasks, 'No completed tasks yet.'),
        },
        {
          id: 'notes',
          label: 'Notes & Quick-create',
          icon: <StickyNote className="h-4 w-4" />,
          body: <NotesAndTasksPanel dealId={dealId} />,
        },
      ]}
    />
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
                      <span className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-claimtec-forest/10 text-claimtec-forest-2">
                        {ev.actor_type}
                      </span>
                    )}
                    <span className="text-xs text-gray-600">{ev.actor ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggle(ev.id)}
                    className="text-xs text-claimtec-forest hover:text-claimtec-forest-2"
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
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [phaseModalKey, setPhaseModalKey] = useState<string | null>(null)

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
        <RefreshCw className="h-8 w-8 animate-spin text-claimtec-forest/40" />
      </div>
    )
  }

  if (error || !deal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-600">{error ?? 'Deal not found'}</p>
        <button onClick={() => navigate('/deals')} className="text-sm text-claimtec-forest underline">Back to Deals</button>
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

  // Tab grouping — primary (the most-used four), then decisioning, then ops.
  // A subtle divider sits between groups so 12 tabs don't read as one wall.
  const TAB_GROUPS: TabId[][] = [
    ['overview', 'buyer', 'seller', 'vehicle'],
    ['affordability', 'quote', 'contracts'],
    ['inspection', 'natis', 'tasks', 'conversation', 'audit'],
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header — single compact block: title row, status bar, phase strip, tabs. */}
      <div className="border-b border-gray-200 bg-white px-6 pt-3 pb-0">
        <button
          onClick={() => navigate('/deals')}
          className="mb-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Deals
        </button>

        {/* Title row — deal number + status + reg + agent chips, all on one line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-lg font-bold text-claimtec-forest">#{deal.deal_number ?? deal.id.slice(0, 8)}</h1>
          <button
            type="button"
            onClick={() => setShowStatusModal(true)}
            title="Click to change status"
            className="rounded-lg ring-offset-1 hover:ring-2 hover:ring-claimtec-gold/60 transition"
          >
            <StatusBadge status={deal.status} />
          </button>
          {deal.vehicle?.registration_number && (
            <span className="text-xs text-gray-500">Reg {deal.vehicle.registration_number}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500">
            {deal.assigned_fni_analyst && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5">F&amp;I: {deal.assigned_fni_analyst}</span>
            )}
            {deal.assigned_seller_agent && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5">Seller: {deal.assigned_seller_agent}</span>
            )}
          </div>
        </div>

        {/* Thin status bar (replaces the old DealHero card) */}
        <div className="mt-2">
          <DealHero deal={dealWithPhase} />
        </div>

        {/* Compact phase strip — dots only, current phase labelled below */}
        <div className="mt-3 pb-5">
          <PhaseStrip
            currentPhase={dealWithPhase.current_phase ?? null}
            completedMilestones={dealWithPhase.completed_milestones ?? []}
            phaseState={dealWithPhase.phase_state ?? null}
            onPhaseClick={(key) => setPhaseModalKey(key)}
          />
        </div>

        {/* Tab nav — grouped with dividers between segments */}
        <div className="mt-2 flex items-center gap-0.5 overflow-x-auto -mb-px">
          {TAB_GROUPS.map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden="true" />}
              {group.map((tabId) => {
                const tab = TABS.find((t) => t.id === tabId)
                if (!tab) return null
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 h-9 px-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                      isActive
                        ? 'border-claimtec-gold text-claimtec-forest'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <span className={`subtab-icon inline-flex h-3.5 w-3.5 items-center justify-center ${isActive ? 'text-claimtec-forest' : 'text-gray-400'}`}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div>
        {activeTab === 'overview'   && (
          <DealOverviewDashboard
            deal={deal}
            docs={docs}
            quotes={quotes}
            contracts={contracts}
            inspection={inspection}
            natis={natis}
            tasks={tasks}
            onTabChange={(t) => setActiveTab(t as TabId)}
          />
        )}
        {activeTab === 'buyer'      && deal.buyer && <BuyerTab deal={deal} docs={docs} extractionResults={extractionResults} />}
        {activeTab === 'seller'     && <SellerTab deal={deal} docs={docs} onSellerUpdated={(s) => setDeal({ ...deal, seller: s })} onDocsRefresh={async () => setDocs(await listDocuments(deal.id))} />}
        {activeTab === 'vehicle'    && deal.vehicle && <VehicleTab deal={deal} />}
        {activeTab === 'quote'      && <QuoteTab dealId={deal.id} quotes={quotes} preparedBy={profile?.id ?? null} onQuotesChange={setQuotes} />}
        {activeTab === 'affordability' && <AffordabilityTab deal={deal} />}
        {activeTab === 'contracts'  && (
          <ContractsTab
            dealId={deal.id}
            contracts={contracts}
            onChanged={async () => {
              try {
                setContracts(await listContracts(deal.id))
              } catch (err) {
                console.error('Failed to refresh contracts', err)
              }
            }}
          />
        )}
        {activeTab === 'inspection' && <InspectionTab deal={deal} inspection={inspection} onChange={setInspection} />}
        {activeTab === 'natis'      && <NATISTab natis={natis} dealId={id!} onChange={setNatis} />}
        {activeTab === 'tasks'      && (
          <TasksTab
            dealId={deal.id}
            tasks={tasks}
            onClaim={handleClaim}
            onComplete={handleComplete}
            onEscalate={handleEscalate}
          />
        )}
        {activeTab === 'conversation' && <DealConversation dealId={deal.id} />}
        {activeTab === 'audit'      && <AuditTab events={auditEvents} />}
        </div>
      </div>

      {/* Click-to-edit modals (status badge & phase strip in the header) */}
      {showStatusModal && (
        <DealStatusModal
          dealId={deal.id}
          current={deal.status}
          onClose={() => setShowStatusModal(false)}
          onChanged={(next) => setDeal({ ...deal, status: next, updated_at: new Date().toISOString() })}
        />
      )}
      {phaseModalKey && (
        <PhaseActionModal
          deal={dealWithPhase}
          phaseKey={phaseModalKey}
          onClose={() => setPhaseModalKey(null)}
          onChanged={(next) => setDeal({
            ...deal,
            ...(next as unknown as Partial<DealWithRelations>),
            updated_at: new Date().toISOString(),
          })}
        />
      )}
    </div>
  )
}
