/**
 * AffordabilityTab — per-deal affordability assessment.
 *
 * Pulls Mindee-extracted bank-statement fields (one row per BS document) from
 * `extraction_results`, computes aggregate disposable income, compares against
 * the agreed vehicle price (with a clearly-labelled indicative instalment
 * factor), and lets ops override the figures and submit for credit decision.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  TrendingUp, TrendingDown, Wallet, Banknote, AlertCircle, CheckCircle2,
  RefreshCw, Save, Send, FileText, ArrowDownRight, ArrowUpRight, Repeat,
  BarChart3, ListChecks, Settings,
} from 'lucide-react'
import { SubTabs } from './SubTabs'
import {
  getBankStatementExtractions,
  saveAffordabilityOverride,
  submitForCredit,
  type BankStatementExtraction,
  type AffordabilityOverride,
} from '../lib/queries'
import type { DealWithRelations } from '../types/database'

// Indicative monthly-instalment factor for a 60-month term at typical SA
// vehicle-finance rates. Purely for UX comparison — the real instalment is
// produced by the Quote engine.
const INDICATIVE_INSTALMENT_FACTOR = 0.022

function num(v: string | null | undefined): number | null {
  if (v == null) return null
  const cleaned = String(v).replace(/[^0-9.\-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function rand(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `R ${Math.round(v).toLocaleString('en-ZA')}`
}

function formatPeriod(bs: BankStatementExtraction): string {
  const start = bs.fields.statement_period_start_date?.value
  const end = bs.fields.statement_period_end_date?.value
  if (start && end) {
    try {
      return `${format(new Date(start), 'dd MMM')} – ${format(new Date(end), 'dd MMM yyyy')}`
    } catch {
      return `${start} – ${end}`
    }
  }
  if (bs.upload_timestamp) {
    try { return format(new Date(bs.upload_timestamp), 'MMM yyyy') } catch { /* fall through */ }
  }
  return bs.file_name ?? bs.document_id.slice(0, 8)
}

export function AffordabilityTab({ deal }: { deal: DealWithRelations }) {
  const [statements, setStatements] = useState<BankStatementExtraction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Override form state
  const phaseState = (deal as DealWithRelations & {
    phase_state?: Record<string, unknown> | null
  }).phase_state ?? {}
  const existingOverride =
    (phaseState.affordability_override as AffordabilityOverride | undefined) ?? {}
  const agreedPrice = num(String((phaseState.agreed_price as number | string | undefined) ?? '')) ??
    num(String(deal.vehicle?.asking_price ?? ''))

  const [overrideIncome, setOverrideIncome] = useState<string>(
    existingOverride.monthly_income != null ? String(existingOverride.monthly_income) : '',
  )
  const [overrideExpenses, setOverrideExpenses] = useState<string>(
    existingOverride.monthly_expenses != null ? String(existingOverride.monthly_expenses) : '',
  )
  const [overrideNotes, setOverrideNotes] = useState<string>(existingOverride.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(existingOverride.saved_at ?? null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getBankStatementExtractions(deal.id)
      .then((rows) => { if (alive) { setStatements(rows); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [deal.id])

  // Aggregate calculations from extracted statements
  const aggregate = useMemo(() => {
    const credits = statements.map((s) => num(s.fields.total_credits?.value)).filter((n): n is number => n != null)
    const debits = statements.map((s) => num(s.fields.total_debits?.value)).filter((n): n is number => n != null)
    const avgIncome = credits.length ? credits.reduce((a, b) => a + b, 0) / credits.length : null
    const avgExpenses = debits.length ? debits.reduce((a, b) => a + b, 0) / debits.length : null
    const disposable = avgIncome != null && avgExpenses != null ? avgIncome - avgExpenses : null
    // Round to nearest R100
    const safeInstalment = disposable != null ? Math.round((disposable * 0.30) / 100) * 100 : null
    return { avgIncome, avgExpenses, disposable, safeInstalment, count: statements.length }
  }, [statements])

  // Override-aware effective figures (override beats extraction averages)
  const effective = useMemo(() => {
    const oI = num(overrideIncome)
    const oE = num(overrideExpenses)
    const income = oI ?? aggregate.avgIncome
    const expenses = oE ?? aggregate.avgExpenses
    const disposable = income != null && expenses != null ? income - expenses : null
    const safeInstalment = disposable != null ? Math.round((disposable * 0.30) / 100) * 100 : null
    return { income, expenses, disposable, safeInstalment }
  }, [overrideIncome, overrideExpenses, aggregate])

  const indicativeInstalment = agreedPrice != null
    ? Math.round(agreedPrice * INDICATIVE_INSTALMENT_FACTOR)
    : null

  const affordable =
    effective.safeInstalment != null && indicativeInstalment != null
      ? indicativeInstalment <= effective.safeInstalment
      : null

  const handleSaveOverride = async () => {
    setSaving(true)
    try {
      await saveAffordabilityOverride(deal.id, {
        monthly_income: num(overrideIncome),
        monthly_expenses: num(overrideExpenses),
        notes: overrideNotes || null,
      })
      setSavedAt(new Date().toISOString())
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save override (RLS?)')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForCredit = async () => {
    if (!confirm('Submit this deal for credit decision? Status will change to FNI_REVIEW_PENDING.')) return
    setSubmitting(true)
    try {
      await submitForCredit(deal.id)
      setSubmitted(true)
      alert('Deal submitted for credit decision.')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit (RLS?)')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-12">
        <RefreshCw className="h-6 w-6 animate-spin text-claimtec-forest/40" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <AlertCircle className="mr-2 inline h-4 w-4" />{error}
      </div>
    )
  }

  const summaryPane = (
    <div className="space-y-6">
      {/* ── Income & Expenses table ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-700">Bank Statements ({statements.length})</h3>
          <p className="text-xs text-gray-400 mt-0.5">Auto-extracted from uploaded statements via Mindee.</p>
        </div>
        {statements.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            <FileText className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            No bank statements extracted yet.
            <div className="mt-2">
              <Link to={`/deals/${deal.id}`} className="text-claimtec-forest hover:underline">
                View Documents
              </Link>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Period</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Bank</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Account</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Income</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Expenses</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Net Flow</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Opening</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {statements.map((s) => {
                const credits = num(s.fields.total_credits?.value)
                const debits = num(s.fields.total_debits?.value)
                const net = credits != null && debits != null ? credits - debits : null
                return (
                  <tr key={s.document_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-900">{formatPeriod(s)}</td>
                    <td className="px-4 py-2.5 text-gray-700">{s.fields.bank_name?.value ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700">{s.fields.account_type?.value ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{rand(credits)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-rose-700">{rand(debits)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${net != null && net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {rand(net)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{rand(num(s.fields.beginning_balance?.value))}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{rand(num(s.fields.ending_balance?.value))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Aggregate panel ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          label="Avg monthly income"
          value={rand(aggregate.avgIncome)}
          subtle={`across ${aggregate.count} statement${aggregate.count === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4 text-rose-600" />}
          label="Avg monthly expenses"
          value={rand(aggregate.avgExpenses)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4 text-claimtec-forest" />}
          label="Disposable income"
          value={rand(aggregate.disposable)}
        />
        <StatCard
          icon={<Banknote className="h-4 w-4 text-claimtec-forest" />}
          label="Safe instalment (30%)"
          value={rand(aggregate.safeInstalment)}
          subtle="rounded to nearest R100"
        />
      </div>

      {/* ── Vehicle vs affordability ────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Vehicle vs Affordability</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs text-gray-500 mb-1">Agreed vehicle price</p>
            <p className="text-sm font-bold text-gray-900">{rand(agreedPrice)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs text-gray-500 mb-1">Indicative 60-mo instalment</p>
            <p className="text-sm font-bold text-gray-900">{rand(indicativeInstalment)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Indicative only — uses {(INDICATIVE_INSTALMENT_FACTOR * 100).toFixed(1)}% factor.</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-xs text-gray-500 mb-1">Effective safe instalment</p>
            <p className="text-sm font-bold text-gray-900">{rand(effective.safeInstalment)}</p>
          </div>
        </div>

        {affordable != null && (
          <div className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            affordable
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}>
            {affordable ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {affordable
              ? 'Indicative instalment is within the buyer\'s safe affordability band.'
              : 'Indicative instalment EXCEEDS the buyer\'s safe affordability band.'}
          </div>
        )}
      </div>
    </div>
  )

  const breakdownPane = (
    <div className="space-y-6">
      {statements.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          <FileText className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          No bank statements extracted yet — breakdowns will appear once the buyer uploads statements.
        </div>
      ) : (
        <>
          <ConsolidatedBreakdown statements={statements} />
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Per-Statement Breakdown</h3>
            <div className={`grid grid-cols-1 gap-4 ${statements.length >= 2 ? 'lg:grid-cols-2' : ''} ${statements.length >= 3 ? 'xl:grid-cols-3' : ''}`}>
              {statements.map((s) => <StatementBreakdown key={s.document_id} s={s} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )

  const overridePane = (
    <div className="space-y-6">
      {/* ── Manual override ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Ops Override</h3>
        <p className="text-xs text-gray-400 mb-4">Manually entered figures override the extracted averages.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Monthly income (R)</span>
            <input
              type="number"
              inputMode="decimal"
              value={overrideIncome}
              onChange={(e) => setOverrideIncome(e.target.value)}
              placeholder={aggregate.avgIncome != null ? String(Math.round(aggregate.avgIncome)) : ''}
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Monthly expenses (R)</span>
            <input
              type="number"
              inputMode="decimal"
              value={overrideExpenses}
              onChange={(e) => setOverrideExpenses(e.target.value)}
              placeholder={aggregate.avgExpenses != null ? String(Math.round(aggregate.avgExpenses)) : ''}
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</span>
            <textarea
              value={overrideNotes}
              onChange={(e) => setOverrideNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-claimtec-forest focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSaveOverride}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save override'}
          </button>
          {savedAt && (
            <span className="text-xs text-gray-400">
              Last saved {format(new Date(savedAt), 'dd MMM HH:mm')}
            </span>
          )}
        </div>
      </div>

      {/* ── Submit for credit ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-claimtec-forest/20 bg-claimtec-forest/5/40 p-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-claimtec-ink">Ready for credit decision?</h3>
          <p className="text-xs text-claimtec-forest-2/80 mt-0.5">
            Sets status to FNI_REVIEW_PENDING and moves the deal into the CREDIT_DECISION phase.
          </p>
        </div>
        <button
          onClick={handleSubmitForCredit}
          disabled={submitting || submitted}
          className="inline-flex items-center gap-1.5 rounded-lg bg-claimtec-forest px-4 py-2 text-sm font-medium text-white hover:bg-claimtec-forest-2 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {submitted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit for credit decision'}
        </button>
      </div>
    </div>
  )

  return (
    <SubTabs
      panes={[
        {
          id: 'summary',
          label: 'Summary',
          icon: <BarChart3 className="h-4 w-4" />,
          body: summaryPane,
        },
        {
          id: 'breakdown',
          label: 'Line-item Breakdown',
          icon: <ListChecks className="h-4 w-4" />,
          badge: statements.length,
          body: breakdownPane,
        },
        {
          id: 'override',
          label: 'Override & Submit',
          icon: <Settings className="h-4 w-4" />,
          body: overridePane,
        },
      ]}
    />
  )
}

interface CategoryRow { description: string; total: number; count: number; avg?: number }

function parseJsonField(value: string | null | undefined): CategoryRow[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as CategoryRow[] : []
  } catch { return [] }
}

/**
 * Merge category rows across multiple statements into a single sorted list.
 * Aggregates by description: sums totals + counts, recomputes avg.
 */
function mergeCategories(buckets: CategoryRow[][]): CategoryRow[] {
  const merged = new Map<string, { total: number; count: number }>()
  for (const list of buckets) {
    for (const row of list) {
      const cur = merged.get(row.description) ?? { total: 0, count: 0 }
      merged.set(row.description, {
        total: cur.total + (row.total ?? 0),
        count: cur.count + (row.count ?? 0),
      })
    }
  }
  return [...merged.entries()]
    .map(([description, v]) => ({
      description,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
      avg:   v.count > 0 ? Math.round((v.total / v.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

function ConsolidatedBreakdown({ statements }: { statements: BankStatementExtraction[] }) {
  const months = statements.length
  const recurringIncome = mergeCategories(
    statements.map((s) => parseJsonField(s.fields.recurring_credits?.value))
  )
  const fallbackIncome = mergeCategories(
    statements.map((s) => parseJsonField(s.fields.top_credit_sources?.value))
  )
  const expenses = mergeCategories(
    statements.map((s) => parseJsonField(s.fields.top_expense_categories?.value))
  )
  // Filter expenses with low signal (R0.50 SMS fees etc) — already aggregated as fees
  const meaningfulExpenses = expenses.filter((e) => e.total >= 100)

  const totalCredits = statements.reduce((acc, s) => acc + (num(s.fields.total_credits?.value) ?? 0), 0)
  const totalDebits  = statements.reduce((acc, s) => acc + (num(s.fields.total_debits?.value)  ?? 0), 0)
  const totalFees    = statements.reduce((acc, s) => acc + (num(s.fields.fee_total?.value)     ?? 0), 0)
  const totalFeeCount = statements.reduce((acc, s) =>
    acc + parseInt(String(s.fields.fee_count?.value ?? '0'), 10), 0)

  // Subscriptions = expense rows that recur in 2+ months
  const subscriptions = expenses.filter((e) => e.count >= months && months >= 2 && e.total >= 50)

  return (
    <div className="rounded-xl border border-claimtec-forest/20 bg-claimtec-forest/5/30 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-claimtec-ink">{months}-Month Consolidated</h3>
        <span className="text-xs text-claimtec-forest-2/70">
          {rand(totalCredits)} in · {rand(totalDebits)} out
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Income side */}
        <div className="rounded-lg bg-white border border-emerald-100 p-3">
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            <ArrowUpRight className="h-3.5 w-3.5" /> Income sources ({months} months)
          </div>
          {(recurringIncome.length > 0 ? recurringIncome : fallbackIncome).slice(0, 6).map((r, i) => (
            <div key={i} className="flex items-baseline gap-2 py-1 text-xs border-b border-gray-50 last:border-0">
              <span className="flex-1 truncate text-gray-800" title={r.description}>{r.description}</span>
              <span className="text-[10px] text-gray-400 tabular-nums">×{r.count}</span>
              <span className="text-[10px] text-gray-400">avg {rand(r.avg)}</span>
              <span className="font-semibold tabular-nums text-emerald-700">{rand(r.total)}</span>
            </div>
          ))}
          {recurringIncome.length === 0 && fallbackIncome.length === 0 && (
            <p className="text-xs text-gray-400 italic">No income sources detected.</p>
          )}
        </div>

        {/* Expense side */}
        <div className="rounded-lg bg-white border border-rose-100 p-3">
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
            <ArrowDownRight className="h-3.5 w-3.5" /> Top expense categories ({months} months)
          </div>
          {meaningfulExpenses.slice(0, 6).map((r, i) => (
            <div key={i} className="flex items-baseline gap-2 py-1 text-xs border-b border-gray-50 last:border-0">
              <span className="flex-1 truncate text-gray-800" title={r.description}>{r.description}</span>
              <span className="text-[10px] text-gray-400 tabular-nums">×{r.count}</span>
              <span className="font-semibold tabular-nums text-rose-700">{rand(r.total)}</span>
            </div>
          ))}
          {meaningfulExpenses.length === 0 && (
            <p className="text-xs text-gray-400 italic">No notable expenses detected.</p>
          )}
        </div>
      </div>

      {/* Subscriptions / monthly burn callout */}
      {subscriptions.length > 0 && (
        <div className="mt-4 rounded-lg bg-white border border-amber-200 p-3">
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            <Repeat className="h-3.5 w-3.5" /> Recurring subscriptions / habits ({months}× months)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            {subscriptions.map((r, i) => (
              <div key={i} className="flex items-baseline gap-2 py-1 text-xs">
                <span className="flex-1 truncate text-gray-800" title={r.description}>{r.description}</span>
                <span className="text-[10px] text-gray-500">~{rand(r.total / months)}/mo</span>
                <span className="font-semibold tabular-nums text-amber-700">{rand(r.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalFeeCount > 0 && (
        <p className="mt-3 text-[11px] text-claimtec-forest-2/70">
          {totalFeeCount} bank fees totalling {rand(totalFees)} — already excluded from category totals above.
        </p>
      )}
    </div>
  )
}

function StatementBreakdown({ s }: { s: BankStatementExtraction }) {
  const credits = num(s.fields.total_credits?.value)
  const debits  = num(s.fields.total_debits?.value)
  const txCount = parseInt(String(s.fields.transaction_count?.value ?? '0'), 10)
  const feeCount = parseInt(String(s.fields.fee_count?.value ?? '0'), 10)
  const feeTotal = num(s.fields.fee_total?.value)
  const sources    = parseJsonField(s.fields.top_credit_sources?.value)
  const expenses   = parseJsonField(s.fields.top_expense_categories?.value)
  const recurring  = parseJsonField(s.fields.recurring_credits?.value)

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800">{formatPeriod(s)}</h4>
        <span className="text-xs text-gray-500">{txCount} transactions</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div className="rounded-md bg-emerald-50 border border-emerald-100 px-2.5 py-1.5">
          <p className="text-emerald-700/70 mb-0.5">Income</p>
          <p className="font-bold text-emerald-800">{rand(credits)}</p>
        </div>
        <div className="rounded-md bg-rose-50 border border-rose-100 px-2.5 py-1.5">
          <p className="text-rose-700/70 mb-0.5">Expenses</p>
          <p className="font-bold text-rose-800">{rand(debits)}</p>
        </div>
      </div>

      {recurring.length > 0 && (
        <BreakdownList
          icon={<Repeat className="h-3.5 w-3.5 text-emerald-600" />}
          title="Recurring credits (likely income)"
          rows={recurring}
          tone="green"
          showCount
          showAvg
        />
      )}

      {sources.length > 0 && recurring.length === 0 && (
        <BreakdownList
          icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />}
          title="Top income sources"
          rows={sources}
          tone="green"
          showCount
        />
      )}

      {expenses.length > 0 && (
        <BreakdownList
          icon={<ArrowDownRight className="h-3.5 w-3.5 text-rose-600" />}
          title="Top expenses"
          rows={expenses}
          tone="red"
          showCount
        />
      )}

      {feeCount > 0 && (
        <p className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
          {feeCount} bank fees totalling {rand(feeTotal)}
        </p>
      )}
    </div>
  )
}

function BreakdownList({
  icon, title, rows, tone, showCount = false, showAvg = false,
}: {
  icon: React.ReactNode
  title: string
  rows: CategoryRow[]
  tone: 'green' | 'red'
  showCount?: boolean
  showAvg?: boolean
}) {
  const valueColor = tone === 'green' ? 'text-emerald-700' : 'text-rose-700'
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {icon}{title}
      </div>
      <ul className="space-y-1">
        {rows.slice(0, 5).map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate text-gray-700" title={r.description}>{r.description}</span>
            {showCount && r.count > 1 && (
              <span className="text-[10px] text-gray-400">×{r.count}</span>
            )}
            {showAvg && r.avg != null && (
              <span className="text-[10px] text-gray-400">avg {rand(r.avg)}</span>
            )}
            <span className={`font-semibold tabular-nums ${valueColor}`}>{rand(r.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatCard({
  icon, label, value, subtle,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtle?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
        {icon}{label}
      </div>
      <p className="mt-2 text-lg font-bold text-gray-900">{value}</p>
      {subtle && <p className="text-[11px] text-gray-400 mt-0.5">{subtle}</p>}
    </div>
  )
}
