/**
 * phaseWorkflows registry — getPhaseWorkflow(phaseKey).
 */
import { describe, it, expect } from 'vitest'
import { getPhaseWorkflow } from '../lib/phaseWorkflows'

describe('getPhaseWorkflow', () => {
  it('returns POPIA_CONSENT workflow with grant + resend actions', () => {
    const w = getPhaseWorkflow('POPIA_CONSENT')
    expect(w.hint).toMatch(/popia/i)
    expect(w.actions.find((a) => a.id === 'mark_granted')).toBeTruthy()
    expect(w.actions.find((a) => a.id === 'resend')).toBeTruthy()
  })

  it('OFFER_TO_PURCHASE includes the cancel-on-invalid action with danger tone', () => {
    const w = getPhaseWorkflow('OFFER_TO_PURCHASE')
    const cancel = w.actions.find((a) => a.id === 'cancel_otp_invalid')!
    expect(cancel.tone).toBe('danger')
    expect(cancel.requiresReason).toBe(true)
    expect(cancel.setDealStatus).toBe('DEAL_CANCELLED')
  })

  it('advanceToPhase moves the deal forward when approve_otp fires', () => {
    const w = getPhaseWorkflow('OFFER_TO_PURCHASE')
    const approve = w.actions.find((a) => a.id === 'approve_otp')!
    expect(approve.advanceToPhase).toBe('PRICE_GATE')
    expect(approve.markMilestone).toBe('otp_uploaded')
  })

  it('WhatsApp templates target buyer or seller', () => {
    const w = getPhaseWorkflow('OFFER_TO_PURCHASE')
    const resubmit = w.actions.find((a) => a.id === 'request_resubmit')!
    expect(resubmit.whatsappTarget).toBe('buyer')
    expect(resubmit.whatsappTemplate).toMatch(/\{\{first_name\}\}/)
    expect(resubmit.whatsappTemplate).toMatch(/\{\{reason\}\}/)
  })

  it('falls back to FALLBACK workflow when phaseKey is null', () => {
    const w = getPhaseWorkflow(null)
    expect(w.actions.length).toBe(1)
    expect(w.actions[0].id).toBe('mark_done')
  })

  it('falls back to FALLBACK workflow when phaseKey is unknown', () => {
    const w = getPhaseWorkflow('SOMETHING_NEW')
    expect(w.actions[0].id).toBe('mark_done')
  })

  it('all non-terminal phases have at least one action', () => {
    const nonTerminalPhases = [
      'POPIA_CONSENT', 'OFFER_TO_PURCHASE', 'PRICE_GATE', 'ID_DOC',
      'PROOF_OF_ADDRESS', 'BANK_STATEMENTS', 'AFFORDABILITY', 'SELLER_NOTIFY',
      'CREDIT_DECISION', 'INSPECTION_REVIEW', 'QUOTE', 'CONTRACT',
      'HANDOVER', 'PAYOUT',
    ]
    nonTerminalPhases.forEach((p) => {
      const w = getPhaseWorkflow(p)
      expect(w.actions.length).toBeGreaterThanOrEqual(1)
      // mark_done is the fallback's only action id
      expect(w.actions.every((a) => a.id !== 'mark_done')).toBe(true)
    })
  })

  it('DONE phase has zero actions (terminal)', () => {
    const w = getPhaseWorkflow('DONE')
    expect(w.actions.length).toBe(0)
    expect(w.hint).toMatch(/closed/i)
  })
})
