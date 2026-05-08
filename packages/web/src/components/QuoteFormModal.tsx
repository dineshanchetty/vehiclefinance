/**
 * QuoteFormModal — create / edit a quote for a deal.
 *
 * Used by the Quote tab of DealDetail. Persists via `createQuote` /
 * `updateQuote` from lib/queries (which goes through supabase-js with the
 * user's JWT and is gated by the `ops_agent_write` RLS policy on `quotes`).
 *
 * Schema gap: the brief asked for `deposit_amount` and `balance_to_finance`
 * fields. Only `finance_amount` (= balance_to_finance) and `total_credit_cost`
 * (= total_repayable) exist on the quotes table. We capture deposit_amount in
 * the form for the operator's calculation reference, but it is NOT persisted.
 */
import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Quote } from '../types/database'
import { createQuote, updateQuote, type QuoteWriteInput } from '../lib/queries'

interface Props {
  dealId: string
  quote?: Quote | null // edit mode if provided
  preparedBy?: string | null
  onClose: () => void
  onSaved: (quote: Quote) => void
}

interface FormState {
  finance_amount: string
  deposit_amount: string // UI-only; not persisted
  balloon_amount: string
  interest_rate: string
  term_months: string
  monthly_instalment: string
  total_credit_cost: string
  valid_until: string // yyyy-MM-dd
}

const EMPTY: FormState = {
  finance_amount: '',
  deposit_amount: '',
  balloon_amount: '0',
  interest_rate: '',
  term_months: '',
  monthly_instalment: '',
  total_credit_cost: '',
  valid_until: '',
}

function toFormState(q: Quote | null | undefined): FormState {
  if (!q) return EMPTY
  return {
    finance_amount: q.finance_amount?.toString() ?? '',
    deposit_amount: '',
    balloon_amount: q.balloon_amount?.toString() ?? '0',
    interest_rate: q.interest_rate?.toString() ?? '',
    term_months: q.term_months?.toString() ?? '',
    monthly_instalment: q.monthly_instalment?.toString() ?? '',
    total_credit_cost: q.total_credit_cost?.toString() ?? '',
    valid_until: q.valid_until ? q.valid_until.slice(0, 10) : '',
  }
}

function parseNum(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function QuoteFormModal({ dealId, quote, preparedBy, onClose, onSaved }: Props) {
  const isEdit = !!quote
  const [form, setForm] = useState<FormState>(() => toFormState(quote))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setForm(toFormState(quote)) }, [quote])

  const set = <K extends keyof FormState>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const validate = (): string | null => {
    const fa = parseNum(form.finance_amount)
    const ir = parseNum(form.interest_rate)
    const tm = parseNum(form.term_months)
    const mi = parseNum(form.monthly_instalment)
    const tcc = parseNum(form.total_credit_cost)
    const ba = parseNum(form.balloon_amount)
    if (fa !== null && fa < 0) return 'Finance amount must be ≥ 0'
    if (ir !== null && (ir < 0 || ir > 100)) return 'Interest rate must be between 0 and 100'
    if (tm !== null && (tm <= 0 || tm > 120 || !Number.isInteger(tm))) return 'Term must be a whole number of months (1–120)'
    if (mi !== null && mi < 0) return 'Monthly instalment must be ≥ 0'
    if (tcc !== null && tcc < 0) return 'Total repayable must be ≥ 0'
    if (ba !== null && ba < 0) return 'Balloon must be ≥ 0'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setSubmitting(true)
    const payload: QuoteWriteInput = {
      finance_amount: parseNum(form.finance_amount),
      balloon_amount: parseNum(form.balloon_amount) ?? 0,
      interest_rate: parseNum(form.interest_rate),
      term_months: parseNum(form.term_months),
      monthly_instalment: parseNum(form.monthly_instalment),
      total_credit_cost: parseNum(form.total_credit_cost),
      valid_until: form.valid_until ? new Date(form.valid_until + 'T23:59:59').toISOString() : null,
    }
    try {
      const saved = isEdit && quote
        ? await updateQuote(quote.id, payload)
        : await createQuote(dealId, payload, preparedBy ?? null)
      onSaved(saved)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Quote' : 'New Quote'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Deposit Amount (R)" hint="UI only — not stored">
              <input
                type="number" step="0.01" min={0}
                className={inputCls}
                value={form.deposit_amount}
                onChange={(e) => set('deposit_amount', e.target.value)}
              />
            </Field>
            <Field label="Balance to Finance (R)">
              <input
                type="number" step="0.01" min={0}
                className={inputCls}
                value={form.finance_amount}
                onChange={(e) => set('finance_amount', e.target.value)}
              />
            </Field>
            <Field label="Balloon (R)">
              <input
                type="number" step="0.01" min={0}
                className={inputCls}
                value={form.balloon_amount}
                onChange={(e) => set('balloon_amount', e.target.value)}
              />
            </Field>
            <Field label="Interest Rate (%)">
              <input
                type="number" step="0.01" min={0} max={100}
                className={inputCls}
                value={form.interest_rate}
                onChange={(e) => set('interest_rate', e.target.value)}
              />
            </Field>
            <Field label="Term (months)">
              <input
                type="number" step="1" min={1} max={120}
                className={inputCls}
                value={form.term_months}
                onChange={(e) => set('term_months', e.target.value)}
              />
            </Field>
            <Field label="Monthly Instalment (R)">
              <input
                type="number" step="0.01" min={0}
                className={inputCls}
                value={form.monthly_instalment}
                onChange={(e) => set('monthly_instalment', e.target.value)}
              />
            </Field>
            <Field label="Total Repayable (R)">
              <input
                type="number" step="0.01" min={0}
                className={inputCls}
                value={form.total_credit_cost}
                onChange={(e) => set('total_credit_cost', e.target.value)}
              />
            </Field>
            <Field label="Valid Until">
              <input
                type="date"
                className={inputCls}
                value={form.valid_until}
                onChange={(e) => set('valid_until', e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Quote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
        {hint && <span className="ml-1 font-normal text-gray-400">({hint})</span>}
      </span>
      {children}
    </label>
  )
}
