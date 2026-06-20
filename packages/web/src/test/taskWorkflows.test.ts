/**
 * taskWorkflows registry — getWorkflow() routes (queue, task_type) → WorkflowDef.
 */
import { describe, it, expect } from 'vitest'
import { getWorkflow } from '../lib/taskWorkflows'

describe('getWorkflow', () => {
  it('returns the matching definition for a known (queue, task_type)', () => {
    const wf = getWorkflow('Q_BUYER_DOC_REVIEW', 'REVIEW_BANK_STATEMENTS')
    expect(wf.hint).toMatch(/affordability/i)
    expect(wf.actions.find((a) => a.id === 'approve')).toBeTruthy()
    expect(wf.actions.find((a) => a.id === 'decline')).toBeTruthy()
  })

  it('decline actions require a reason and set deal status', () => {
    const wf = getWorkflow('Q_BUYER_DOC_REVIEW', 'REVIEW_BANK_STATEMENTS')
    const decline = wf.actions.find((a) => a.id === 'decline')!
    expect(decline.requiresReason).toBe(true)
    expect(decline.setDealStatus).toBe('DEAL_DECLINED')
    expect(decline.tone).toBe('danger')
    expect(decline.whatsappTemplate).toMatch(/\{\{first_name\}\}/)
    expect(decline.whatsappTemplate).toMatch(/\{\{reason\}\}/)
  })

  it('falls back to the generic workflow when queue is null', () => {
    const wf = getWorkflow(null, 'ANY_TASK')
    expect(wf.hint).toMatch(/review/i)
    expect(wf.actions.map((a) => a.id)).toEqual(['complete', 'escalate'])
  })

  it('falls back to the generic workflow when task_type is null', () => {
    const wf = getWorkflow('Q_BUYER_DOC_REVIEW', null)
    expect(wf.actions.length).toBe(2)
  })

  it('falls back when queue is unknown', () => {
    const wf = getWorkflow('Q_NONEXISTENT', 'SOMETHING')
    expect(wf.actions.length).toBe(2)
  })

  it('falls back when task_type is unknown within a known queue', () => {
    const wf = getWorkflow('Q_BUYER_DOC_REVIEW', 'NOT_A_REAL_TYPE')
    expect(wf.actions.length).toBe(2)
  })

  it('POA verification advances the deal phase', () => {
    const wf = getWorkflow('Q_BUYER_DOC_REVIEW', 'VERIFY_PROOF_OF_ADDRESS')
    const approve = wf.actions.find((a) => a.id === 'approve')!
    expect(approve.advancePhase?.current_phase).toBe('BANK_STATEMENTS')
    expect(approve.advancePhase?.milestone).toBe('address_verified')
  })

  it('escalate action sets ESCALATED status', () => {
    const wf = getWorkflow(null, null)
    const escalate = wf.actions.find((a) => a.id === 'escalate')!
    expect(escalate.taskStatus).toBe('ESCALATED')
    expect(escalate.requiresReason).toBe(true)
  })
})
