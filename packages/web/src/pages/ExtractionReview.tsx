/**
 * ExtractionReview — Human-review UI for AI document extractions.
 *
 * Route: /extraction/:documentId
 *
 * Shows:
 *  - Document preview (image or PDF embed)
 *  - Extracted field list with confidence bars
 *  - Verify / Override / Flag-for-review actions per field
 *  - Overall confidence summary and Q_MISMATCH_REVIEW task badge
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Flag,
  X,
  Save,
  RefreshCw,
  ArrowLeft,
  FileText,
  Eye,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

type FieldStatus = 'PENDING' | 'ACCEPTED' | 'OVERRIDDEN' | 'FLAGGED'

interface ExtractedField {
  key: string
  label: string
  value: string | null
  confidence: number
  status: FieldStatus
  overrideValue: string | null
  flagReason: string | null
}

interface DocumentInfo {
  id: string
  deal_id: string
  document_type: string
  storage_path: string | null
  mime_type: string | null
  status: string
  extracted_at: string | null
}

interface ExtractionRecord {
  id: string
  doc_type: string
  extracted_data: Record<string, { value: string | null; confidence: number }>
  confidence_score: number
  flagged: boolean
  low_confidence_fields: string[]
  model_used: string | null
  created_at: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.round(value * 100))
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-500'
  const textColor = pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-amber-700' : 'text-red-700'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-gray-200">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${textColor}`}>{pct}%</span>
    </div>
  )
}

const STATUS_CFG: Record<FieldStatus, { label: string; cls: string }> = {
  ACCEPTED:   { label: 'Accepted',   cls: 'bg-green-100 text-green-800' },
  OVERRIDDEN: { label: 'Overridden', cls: 'bg-blue-100 text-blue-800' },
  PENDING:    { label: 'Pending',    cls: 'bg-gray-100 text-gray-700' },
  FLAGGED:    { label: 'Flagged',    cls: 'bg-red-100 text-red-700' },
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ExtractionReview() {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()

  const [doc, setDoc] = useState<DocumentInfo | null>(null)
  const [fields, setFields] = useState<ExtractedField[]>([])
  const [extraction, setExtraction] = useState<ExtractionRecord | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [overrideModal, setOverrideModal] = useState<{ key: string; current: string | null } | null>(null)
  const [overrideValue, setOverrideValue] = useState('')
  const [flagModal, setFlagModal] = useState<string | null>(null)
  const [flagReason, setFlagReason] = useState('')

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return
    loadData(documentId)
  }, [documentId])

  async function loadData(docId: string) {
    setLoading(true)
    setError(null)
    try {
      // Fetch document row — only real columns from the `documents` table.
      const { data: docData, error: docErr } = await supabase
        .from('documents')
        .select('id, deal_id, doc_type, file_url, mime_type, status, upload_timestamp')
        .eq('id', docId)
        .single()

      if (docErr || !docData) {
        throw new Error(docErr?.message ?? 'Document not found')
      }

      const docInfo: DocumentInfo = {
        id: docData.id,
        deal_id: docData.deal_id,
        document_type: docData.doc_type ?? 'OTHER',
        storage_path: docData.file_url ?? null,
        mime_type: docData.mime_type ?? null,
        status: docData.status,
        extracted_at: docData.upload_timestamp ?? null,
      }
      setDoc(docInfo)

      // Fetch extraction results — one row per (field_name) in the schema.
      const { data: extRows, error: extErr } = await supabase
        .from('extraction_results')
        .select('id, document_id, field_name, extracted_value, confidence, confidence_level, customer_confirmed_value, verification_status, created_at')
        .eq('document_id', docId)
        .order('created_at', { ascending: false })

      if (extErr) {
        throw new Error(extErr.message)
      }

      // Take the most-recent row per field_name (rows are ordered desc).
      const seen = new Set<string>()
      const latestByField = (extRows ?? []).filter((r) => {
        if (seen.has(r.field_name)) return false
        seen.add(r.field_name)
        return true
      })

      // Derive an overall extraction summary for the header UI.
      const confidences = latestByField
        .map((r) => r.confidence)
        .filter((c): c is number => typeof c === 'number')
      const avg =
        confidences.length > 0
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : 0
      const anyLow = latestByField.some(
        (r) => typeof r.confidence === 'number' && r.confidence < 0.6,
      )

      const extRecord: ExtractionRecord = {
        id: `${docId}-summary`,
        doc_type: docInfo.document_type,
        extracted_data: Object.fromEntries(
          latestByField.map((r) => [
            r.field_name,
            { value: r.extracted_value, confidence: r.confidence ?? 0 },
          ]),
        ),
        confidence_score: avg,
        flagged: anyLow,
        low_confidence_fields: latestByField
          .filter((r) => typeof r.confidence === 'number' && r.confidence < 0.6)
          .map((r) => r.field_name),
        model_used: null,
        created_at:
          latestByField[0]?.created_at ?? new Date().toISOString(),
      }
      setExtraction(extRecord)

      // Build the UI field list from the real DB rows.
      const fieldList: ExtractedField[] = latestByField.map((r) => {
        // Map the DB enum onto the UI status.
        const mapped: FieldStatus =
          r.verification_status === 'VERIFIED'
            ? 'ACCEPTED'
            : r.verification_status === 'MISMATCH'
            ? 'FLAGGED'
            : r.verification_status === 'OVERRIDDEN'
            ? 'OVERRIDDEN'
            : 'PENDING'
        return {
          key: r.field_name,
          label: humanLabel(r.field_name),
          value: r.extracted_value,
          confidence: r.confidence ?? 0,
          status: mapped,
          overrideValue: r.customer_confirmed_value,
          flagReason:
            typeof r.confidence === 'number' && r.confidence < 0.6
              ? 'Low confidence'
              : null,
        }
      })

      // Auto-flag any still-PENDING field below the 0.60 threshold.
      setFields(
        fieldList.map((f) =>
          f.status === 'PENDING' && f.confidence < 0.6
            ? { ...f, status: 'FLAGGED' }
            : f,
        ),
      )

      // Try to get a signed URL for preview.
      if (docInfo.storage_path) {
        const bucket = 'deal-documents'
        const path = docInfo.storage_path.startsWith(bucket + '/')
          ? docInfo.storage_path.slice(bucket.length + 1)
          : docInfo.storage_path
        const { data: urlData } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 3600)
        if (urlData?.signedUrl) setPreviewUrl(urlData.signedUrl)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Accept ─────────────────────────────────────────────────────────────────
  function acceptField(key: string) {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, status: 'ACCEPTED' } : f))
    )
  }

  /**
   * Mark every field as ACCEPTED in one action.
   * The reviewer still has to click "Save all" to persist to the DB.
   */
  function acceptAll() {
    setFields((prev) => prev.map((f) => ({ ...f, status: 'ACCEPTED' })))
  }

  // ── Override modal ─────────────────────────────────────────────────────────
  function openOverride(key: string, current: string | null) {
    setOverrideModal({ key, current })
    setOverrideValue(
      fields.find((f) => f.key === key)?.overrideValue ?? current ?? ''
    )
  }

  function saveOverride() {
    if (!overrideModal) return
    setFields((prev) =>
      prev.map((f) =>
        f.key === overrideModal.key
          ? { ...f, status: 'OVERRIDDEN', overrideValue }
          : f
      )
    )
    setOverrideModal(null)
    setOverrideValue('')
  }

  // ── Flag modal ─────────────────────────────────────────────────────────────
  function openFlag(key: string) {
    setFlagModal(key)
    setFlagReason(fields.find((f) => f.key === key)?.flagReason ?? '')
  }

  function saveFlag() {
    if (!flagModal) return
    setFields((prev) =>
      prev.map((f) =>
        f.key === flagModal ? { ...f, status: 'FLAGGED', flagReason } : f
      )
    )
    setFlagModal(null)
    setFlagReason('')
  }

  // ── Save all verifications ─────────────────────────────────────────────────
  async function saveAll() {
    if (!documentId) return
    setSaving(true)
    try {
      // Persist reviewer decisions as extraction_results rows.
      // Schema columns: document_id, field_name, extracted_value, confidence,
      // verification_status (enum: PENDING|VERIFIED|MISMATCH|OVERRIDDEN),
      // customer_confirmed_value, confirmed_at.
      // We map the UI state onto the enum: ACCEPTED → VERIFIED, FLAGGED → MISMATCH.
      const statusToEnum = (s: FieldStatus): 'VERIFIED' | 'MISMATCH' | 'OVERRIDDEN' | 'PENDING' => {
        if (s === 'ACCEPTED') return 'VERIFIED'
        if (s === 'FLAGGED') return 'MISMATCH'
        if (s === 'OVERRIDDEN') return 'OVERRIDDEN'
        return 'PENDING'
      }
      for (const f of fields) {
        if (f.status === 'OVERRIDDEN' || f.status === 'FLAGGED' || f.status === 'ACCEPTED') {
          // No unique constraint on (document_id, field_name) in schema, so
          // we insert a new audit row each save. Readers should take the latest
          // row per (document_id, field_name) by confirmed_at.
          await supabase.from('extraction_results').insert({
            document_id: documentId,
            field_name: f.key,
            extracted_value: f.value,
            confidence: f.confidence,
            verification_status: statusToEnum(f.status),
            customer_confirmed_value: f.overrideValue,
            confirmed_at: new Date().toISOString(),
          })
        }
      }
      // Audit — columns on audit_logs: deal_id, phone, event_type, description, metadata.
      await supabase.from('audit_logs').insert({
        deal_id: doc?.deal_id ?? null,
        event_type: 'EXTRACTION_REVIEWED',
        description: 'ops:manual extraction review',
        metadata: {
          document_id: documentId,
          accepted: fields.filter((f) => f.status === 'ACCEPTED').length,
          overridden: fields.filter((f) => f.status === 'OVERRIDDEN').length,
          flagged: fields.filter((f) => f.status === 'FLAGGED').length,
        },
      })
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const lowCount = fields.filter((f) => f.confidence < 0.60).length
  const pendingCount = fields.filter((f) => f.status === 'PENDING').length
  const avgConfidence = extraction?.confidence_score ?? 0

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw className="animate-spin h-6 w-6 mr-2" />
        Loading extraction…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-red-700 bg-red-50 rounded-lg border border-red-200">
        <AlertTriangle className="inline h-5 w-5 mr-2" />
        {error}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Extraction Review</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {doc?.document_type?.replace(/_/g, ' ').toUpperCase()} &bull; Document {documentId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {extraction?.flagged && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Low confidence flagged
            </span>
          )}
          {avgConfidence < 0.80 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              Q_MISMATCH_REVIEW task created
            </span>
          )}
          <button
            onClick={acceptAll}
            className="flex items-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
            title="Mark every field as ACCEPTED (still need to click Save Decisions to persist)"
          >
            Accept all
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Decisions
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* ── Left: Document Preview ────────────────────────────────────────── */}
        <div className="xl:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
              {previewUrl ? (
                <Eye className="h-4 w-4 text-gray-500" />
              ) : (
                <FileText className="h-4 w-4 text-gray-500" />
              )}
              <span className="text-sm font-medium text-gray-700">Document Preview</span>
            </div>
            <div className="p-2 min-h-64 bg-gray-50 flex items-center justify-center">
              {previewUrl ? (
                doc?.mime_type === 'application/pdf' ? (
                  <embed
                    src={previewUrl}
                    type="application/pdf"
                    className="w-full h-96 rounded"
                    title="Document preview"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Document preview"
                    className="max-h-[520px] max-w-full rounded object-contain shadow"
                  />
                )
              ) : (
                <div className="text-center text-gray-400 py-12">
                  <FileText className="mx-auto h-12 w-12 mb-2" />
                  <p className="text-sm">Preview not available</p>
                  <p className="text-xs mt-1">File may not yet be in storage</p>
                </div>
              )}
            </div>
          </div>

          {/* Extraction metadata */}
          {extraction && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Extraction Info</p>
              <div className="text-sm text-gray-700 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Model</span>
                  <span className="font-mono text-xs">{extraction.model_used ?? 'claude-sonnet-4-5'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Overall confidence</span>
                  <span className={`font-semibold ${avgConfidence >= 0.80 ? 'text-green-700' : 'text-amber-700'}`}>
                    {Math.round(avgConfidence * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Extracted at</span>
                  <span className="text-xs text-gray-400">
                    {extraction.created_at
                      ? new Date(extraction.created_at).toLocaleString()
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Field List ─────────────────────────────────────────────── */}
        <div className="xl:col-span-3 space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
              <span className="text-gray-500">Total fields:</span>
              <span className="font-semibold text-gray-900">{fields.length}</span>
            </div>
            {lowCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-red-700">{lowCount} low confidence (&lt;60%)</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
              <span className="text-amber-700">{pendingCount} pending review</span>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Field</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Extracted Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fields.map((row) => {
                  const isLow = row.confidence < 0.60
                  const sc = STATUS_CFG[row.status] ?? STATUS_CFG.PENDING
                  const displayValue =
                    row.status === 'OVERRIDDEN' ? row.overrideValue : row.value
                  return (
                    <tr
                      key={row.key}
                      className={isLow ? 'bg-red-50/40' : 'bg-white hover:bg-gray-50/50'}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {row.label}
                        {isLow && (
                          <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-red-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs max-w-[160px] truncate" title={displayValue ?? ''}>
                        {displayValue != null ? (
                          row.status === 'OVERRIDDEN' ? (
                            <span className="text-blue-700">{displayValue}</span>
                          ) : (
                            displayValue
                          )
                        ) : (
                          <span className="italic text-gray-400">not extracted</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBar value={row.confidence} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc.cls}`}>
                          {sc.label}
                        </span>
                        {row.flagReason && (
                          <p className="mt-0.5 text-xs text-red-600 truncate max-w-[120px]" title={row.flagReason}>
                            {row.flagReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {row.status !== 'ACCEPTED' && (
                            <button
                              onClick={() => acceptField(row.key)}
                              title="Accept"
                              className="rounded p-1 text-green-600 hover:bg-green-50"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openOverride(row.key, row.value)}
                            title="Override value"
                            className="rounded p-1 text-blue-600 hover:bg-blue-50"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          {row.status !== 'FLAGGED' && (
                            <button
                              onClick={() => openFlag(row.key)}
                              title="Flag for review"
                              className="rounded p-1 text-amber-600 hover:bg-amber-50"
                            >
                              <Flag className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Override Modal ──────────────────────────────────────────────────── */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">
                Override — {humanLabel(overrideModal.key)}
              </h3>
              <button onClick={() => setOverrideModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Extracted:{' '}
              <span className="font-mono text-gray-700">
                {overrideModal.current ?? 'not extracted'}
              </span>
            </p>
            <input
              type="text"
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveOverride()}
              placeholder="Enter correct value…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOverrideModal(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveOverride}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Save className="h-4 w-4" /> Save Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Flag Modal ──────────────────────────────────────────────────────── */}
      {flagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">
                Flag for Review — {humanLabel(flagModal)}
              </h3>
              <button onClick={() => setFlagModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Reason for flagging…"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setFlagModal(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveFlag}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                <Flag className="h-4 w-4" /> Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
