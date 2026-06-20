/**
 * runTaskAction — the workflow action runner. Mock supabase + fetch and verify
 * each side effect (task patch, audit row, deal patch, milestone append,
 * buyer WhatsApp message) lands as designed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTaskAction, type RunActionInput } from '../lib/runTaskAction'
import type { WorkflowAction } from '../lib/taskWorkflows'

// ── Supabase mocks ──────────────────────────────────────────────────────────
// We capture every from(<table>).update / .insert / .select call so we can
// assert the mutations.

type Op = { table: string; op: string; payload?: unknown; filter?: { col: string; val: unknown } }
const ops: Op[] = []
let nextSelectData: unknown = null
let nextSelectError: unknown = null

const mkChain = (table: string): unknown => {
  const chain: Record<string, unknown> = {}
  chain.update = (payload: unknown) => {
    ops.push({ table, op: 'update', payload })
    return {
      eq: (col: string, val: unknown) => {
        ops[ops.length - 1].filter = { col, val }
        return Promise.resolve({ data: null, error: null })
      },
    }
  }
  chain.insert = (payload: unknown) => {
    ops.push({ table, op: 'insert', payload })
    return { then: (cb: (r: { error: null }) => unknown) => cb({ error: null }) }
  }
  chain.select = (_cols: string) => ({
    eq: (_col: string, _val: unknown) => ({
      single: () => Promise.resolve({ data: nextSelectData, error: nextSelectError }),
    }),
  })
  return chain
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => mkChain(table),
  },
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ── Action fixtures ────────────────────────────────────────────────────────
const APPROVE: WorkflowAction = {
  id: 'approve_id', label: 'Approve', tone: 'success',
  taskStatus: 'COMPLETED',
  auditEventType: 'BUYER_ID_APPROVED',
  advancePhase: { current_phase: 'CREDIT_CHECK', milestone: 'BUYER_DOCS_DONE' },
}

const DECLINE: WorkflowAction = {
  id: 'decline_id', label: 'Decline', tone: 'danger',
  taskStatus: 'COMPLETED',
  auditEventType: 'BUYER_ID_REJECTED',
  setDealStatus: 'DECLINED',
  requiresReason: true,
}

const baseInput: RunActionInput = {
  task: { id: 't-1', deal_id: 'd-1', task_type: 'Review buyer ID', queue: 'Q_BUYER_DOC_REVIEW' },
  action: APPROVE,
  actor: 'ops-1',
}

beforeEach(() => {
  ops.length = 0
  nextSelectData = null
  nextSelectError = null
  fetchMock.mockReset()
})

describe('runTaskAction', () => {
  it('patches task with COMPLETED + completed_at + notes', async () => {
    await runTaskAction({ ...baseInput, reason: 'looks good' })
    const taskUpdate = ops.find((o) => o.table === 'tasks' && o.op === 'update')
    expect(taskUpdate).toBeTruthy()
    const p = taskUpdate!.payload as Record<string, unknown>
    expect(p.status).toBe('COMPLETED')
    expect(p.completed_at).toBeTruthy()
    expect(String(p.notes)).toMatch(/looks good/)
  })

  it('inserts an audit_events row with the supplied event type', async () => {
    await runTaskAction(baseInput)
    const audit = ops.find((o) => o.table === 'audit_events' && o.op === 'insert')
    expect(audit).toBeTruthy()
    const p = audit!.payload as Record<string, unknown>
    expect(p.event_type).toBe('BUYER_ID_APPROVED')
    expect(p.deal_id).toBe('d-1')
    expect(p.actor).toBe('ops-1')
    expect(p.actor_type).toBe('ops_user')
  })

  it('updates the deal with the advancePhase target', async () => {
    nextSelectData = { completed_milestones: [] }
    await runTaskAction(baseInput)
    const dealPatch = ops.find((o) => o.table === 'deals' && o.op === 'update' && (o.payload as Record<string, unknown>).current_phase)
    expect(dealPatch).toBeTruthy()
    expect((dealPatch!.payload as Record<string, unknown>).current_phase).toBe('CREDIT_CHECK')
  })

  it('appends a new milestone (does NOT duplicate when already present)', async () => {
    nextSelectData = { completed_milestones: ['POPIA_DONE', 'BUYER_DOCS_DONE'] }
    await runTaskAction(baseInput)
    const milestonePatch = ops.filter((o) =>
      o.table === 'deals' && o.op === 'update' &&
      Array.isArray((o.payload as Record<string, unknown>).completed_milestones)
    )
    // Milestone already exists → no append performed
    expect(milestonePatch.length).toBe(0)
  })

  it('appends a milestone when not yet present', async () => {
    nextSelectData = { completed_milestones: ['POPIA_DONE'] }
    await runTaskAction(baseInput)
    const milestonePatch = ops.find((o) =>
      o.table === 'deals' && o.op === 'update' &&
      Array.isArray((o.payload as Record<string, unknown>).completed_milestones)
    )
    expect(milestonePatch).toBeTruthy()
    const list = (milestonePatch!.payload as Record<string, unknown>).completed_milestones as string[]
    expect(list).toContain('BUYER_DOCS_DONE')
    expect(list).toContain('POPIA_DONE')
  })

  it('sets deal.status when action.setDealStatus is supplied (decline path)', async () => {
    await runTaskAction({ ...baseInput, action: DECLINE, reason: 'too risky' })
    const dealPatch = ops.find((o) =>
      o.table === 'deals' && o.op === 'update' && (o.payload as Record<string, unknown>).status === 'DECLINED'
    )
    expect(dealPatch).toBeTruthy()
  })

  it('dispatches a buyer WhatsApp message when buyerMessage + buyerPhone provided', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })
    await runTaskAction({
      ...baseInput,
      buyerMessage: 'Hi! Sorry, your application was declined.',
      buyerPhone: '+27840000000',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, opts] = fetchMock.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.phone).toBe('+27840000000')
    expect(body.deal_id).toBe('d-1')
    expect(body.message).toMatch(/declined/)
  })

  it('throws when the buyer WhatsApp dispatch fails (non-ok response)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: () => Promise.resolve('upstream error') })
    await expect(
      runTaskAction({
        ...baseInput,
        buyerMessage: 'hello',
        buyerPhone: '+27840000000',
      }),
    ).rejects.toThrow(/502/)
  })

  it('does NOT call fetch when buyerMessage missing', async () => {
    await runTaskAction(baseInput)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
