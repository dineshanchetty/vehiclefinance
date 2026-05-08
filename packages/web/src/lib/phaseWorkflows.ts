/**
 * Phase workflow registry — for each of the 15 deal-journey phases, defines:
 *   • What ops needs to verify before letting the deal move on
 *   • The available actions (approve / decline / re-request / send invite…)
 *   • Side effects each action triggers (advance phase, set deal_status,
 *     mark milestone done, optional WhatsApp message to the buyer or seller,
 *     optional bot endpoint to hit)
 *
 * Mirrors the shape of taskWorkflows.ts, but keyed by phase key instead of
 * (queue, task_type). Used by <PhaseActionModal /> when ops clicks a phase
 * step in the Deal Journey strip.
 */

export type ActionTone = 'primary' | 'success' | 'danger' | 'warn' | 'neutral'

export interface PhaseAction {
  id: string
  label: string
  tone: ActionTone
  /** Decline-style actions need a typed reason + optional WhatsApp body. */
  requiresReason?: boolean
  /**
   * Pre-filled WhatsApp body for the modal. {{first_name}} and {{reason}}
   * are interpolated. Sent via the bot's /api/ops-send-message endpoint.
   * `target` controls whether the message goes to the buyer or seller.
   */
  whatsappTemplate?: string
  whatsappTarget?: 'buyer' | 'seller'
  /** If set, hit this bot endpoint instead of the generic ops-send-message. */
  botEndpoint?: string
  /** Update deals.current_phase. */
  advanceToPhase?: string
  /** Append this milestone to deals.completed_milestones (idempotent). */
  markMilestone?: string
  /** Update legacy deal_status enum. */
  setDealStatus?: string
  /** Audit event_type written to audit_events. */
  auditEventType?: string
}

export interface PhaseWorkflow {
  /** Plain-English summary of what this step is. */
  hint: string
  /** Checks ops should mentally tick before clicking an action. */
  checklist?: string[]
  /** Action buttons for ops. */
  actions: PhaseAction[]
}

// ─── Registry ────────────────────────────────────────────────────────────────

const POPIA_CONSENT: PhaseWorkflow = {
  hint: 'POPIA consent must be granted by the buyer before any data processing. Sent automatically on first contact via WhatsApp.',
  checklist: ['Buyer tapped "I agree" on WhatsApp', 'consent_status row written'],
  actions: [
    { id: 'mark_granted', label: 'Mark consent granted', tone: 'success',
      advanceToPhase: 'OFFER_TO_PURCHASE', markMilestone: 'popia_consent',
      auditEventType: 'ops_popia_consent_granted' },
    { id: 'resend', label: 'Re-send consent prompt', tone: 'warn', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, we still need your POPIA consent to proceed: {{reason}}. Reply *I AGREE* to continue, or *NO* to stop.',
      whatsappTarget: 'buyer', auditEventType: 'ops_popia_resend' },
  ],
}

const OFFER_TO_PURCHASE: PhaseWorkflow = {
  hint: 'The signed Offer to Purchase bootstraps the buyer / seller / vehicle / price for the whole deal.',
  checklist: ['OTP PDF uploaded + extracted', 'Buyer name + ID on OTP match the buyer', 'Seller name + phone present', 'Vehicle make/model/VIN/reg present', 'Agreed price ≥ R30,000'],
  actions: [
    { id: 'approve_otp', label: 'Approve OTP', tone: 'success',
      advanceToPhase: 'PRICE_GATE', markMilestone: 'otp_uploaded',
      auditEventType: 'ops_otp_approved' },
    { id: 'request_resubmit', label: 'Request resubmit', tone: 'warn', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}} — there\'s an issue with the Offer to Purchase you uploaded: {{reason}}. Please send a corrected version when you can.',
      whatsappTarget: 'buyer', auditEventType: 'ops_otp_resubmit_requested' },
    { id: 'cancel_otp_invalid', label: 'Cancel deal — OTP invalid', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, unfortunately we can\'t proceed with this Offer to Purchase: {{reason}}.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_CANCELLED', auditEventType: 'ops_otp_cancelled' },
  ],
}

const PRICE_GATE: PhaseWorkflow = {
  hint: 'Vehicle price must be ≥ R30,000 to qualify for WesBank Private Deal.',
  checklist: ['agreed_price captured on phase_state', 'Price ≥ R30,000', 'Buyer confirmed the price'],
  actions: [
    { id: 'approve_price', label: 'Price OK — proceed to ID', tone: 'success',
      advanceToPhase: 'ID_DOC', markMilestone: 'price_captured',
      auditEventType: 'ops_price_gate_passed' },
    { id: 'price_too_low', label: 'Below R30k — decline', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, this vehicle price falls below WesBank\'s R30,000 minimum for Private Deal: {{reason}}. A consultant will reach out about alternatives.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_DECLINED', auditEventType: 'ops_price_too_low' },
  ],
}

const ID_DOC: PhaseWorkflow = {
  hint: 'Verify the buyer\'s SA ID. Cross-check the ID number against the OTP buyer field.',
  checklist: ['ID document uploaded + extracted', 'ID number matches OTP', 'Photo legible', 'No expiry concerns'],
  actions: [
    { id: 'approve_id', label: 'Approve ID', tone: 'success',
      advanceToPhase: 'PROOF_OF_ADDRESS', markMilestone: 'id_verified',
      auditEventType: 'ops_id_approved' },
    { id: 'request_clearer_id', label: 'Request clearer photo', tone: 'warn', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}} — your ID photo isn\'t clear enough: {{reason}}. Please retake in good light and resend.',
      whatsappTarget: 'buyer', auditEventType: 'ops_id_resubmit_requested' },
    { id: 'id_mismatch', label: 'Block — ID mismatch', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, we\'ve paused your application due to an identity verification concern: {{reason}}. A consultant will be in touch.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_ON_HOLD', auditEventType: 'ops_id_mismatch_blocked' },
  ],
}

const PROOF_OF_ADDRESS: PhaseWorkflow = {
  hint: 'Verify a recent (≤3 months) proof of address. Holder name and address must match the buyer record.',
  checklist: ['Document dated ≤90 days', 'Holder name matches buyer', 'Address matches buyer record'],
  actions: [
    { id: 'approve_poa', label: 'Approve POA', tone: 'success',
      advanceToPhase: 'BANK_STATEMENTS', markMilestone: 'address_verified',
      auditEventType: 'ops_poa_approved' },
    { id: 'request_recent_poa', label: 'Request more recent', tone: 'warn', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}} — your proof of address can\'t be accepted: {{reason}}. Please send a utility bill or bank letter dated within the last 90 days.',
      whatsappTarget: 'buyer', auditEventType: 'ops_poa_resubmit_requested' },
  ],
}

const BANK_STATEMENTS: PhaseWorkflow = {
  hint: 'Three personal bank statements (no business accounts). Statement holder must match buyer.',
  checklist: ['3 statements present', 'All extracted correctly', 'Personal accounts only', 'Holder matches buyer'],
  actions: [
    { id: 'approve_bs', label: 'Approve statements', tone: 'success',
      advanceToPhase: 'AFFORDABILITY', markMilestone: 'bank_statements_uploaded',
      auditEventType: 'ops_bs_approved' },
    { id: 'request_more_bs', label: 'Request resubmit', tone: 'warn', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}} — we couldn\'t accept your bank statements: {{reason}}. Please resend the missing or corrected statements.',
      whatsappTarget: 'buyer', auditEventType: 'ops_bs_resubmit_requested' },
    { id: 'reject_business', label: 'Reject — business account', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, WesBank Private Deal is for personal-account holders only: {{reason}}. We\'ll suggest alternative finance.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_DECLINED', auditEventType: 'ops_bs_business_rejected' },
  ],
}

const AFFORDABILITY: PhaseWorkflow = {
  hint: 'Run the affordability assessment in the Affordability tab. Either submit for credit, or decline as unaffordable.',
  checklist: ['Avg income ≥ R8,000', 'Disposable ≥ implied instalment', 'No business income blended'],
  actions: [
    { id: 'submit_for_credit', label: 'Submit for credit decision', tone: 'success',
      advanceToPhase: 'CREDIT_DECISION', markMilestone: 'affordability_confirmed',
      setDealStatus: 'FNI_REVIEW_PENDING',
      auditEventType: 'ops_affordability_approved' },
    { id: 'decline_unaffordable', label: 'Decline — unaffordable', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, after reviewing your finances we don\'t think this vehicle is affordable for you right now: {{reason}}. We\'ll suggest alternatives shortly.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_DECLINED', auditEventType: 'ops_affordability_declined' },
  ],
}

const SELLER_NOTIFY: PhaseWorkflow = {
  hint: 'Send the seller a WhatsApp invite using the seller_intro_v1 template. Required after credit approval before the seller side of the deal can begin.',
  checklist: ['Seller name + phone captured on the deal', 'Buyer credit approved', 'Vehicle + price confirmed'],
  actions: [
    { id: 'send_invite', label: 'Send WhatsApp invite', tone: 'primary',
      botEndpoint: '/api/notify-seller',
      markMilestone: 'seller_notified',
      auditEventType: 'ops_seller_invited' },
    { id: 'resend_invite', label: 'Re-send invite', tone: 'warn',
      botEndpoint: '/api/notify-seller',
      auditEventType: 'ops_seller_reinvited' },
    { id: 'mark_responded', label: 'Mark seller responded', tone: 'success',
      advanceToPhase: 'CREDIT_DECISION', markMilestone: 'seller_notified',
      auditEventType: 'ops_seller_responded' },
    { id: 'seller_declined', label: 'Seller declined', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, the seller has declined to proceed: {{reason}}. We\'ll be in touch about your options.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_CANCELLED', auditEventType: 'ops_seller_declined' },
  ],
}

const CREDIT_DECISION: PhaseWorkflow = {
  hint: 'Record the credit decision from WesBank. Approval advances to inspection; decline ends the deal.',
  checklist: ['WesBank decision received', 'Affordability assessment on file', 'No outstanding flags'],
  actions: [
    { id: 'credit_approved', label: 'Credit APPROVED', tone: 'success',
      advanceToPhase: 'INSPECTION_REVIEW', markMilestone: 'credit_approved',
      setDealStatus: 'DEAL_APPROVED',
      whatsappTemplate: 'Great news {{first_name}} 🎉 Your WesBank Private Deal application has been approved! We\'ll arrange the vehicle inspection next.',
      whatsappTarget: 'buyer',
      auditEventType: 'ops_credit_approved' },
    { id: 'credit_declined', label: 'Credit DECLINED', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, unfortunately your WesBank Private Deal application wasn\'t approved: {{reason}}. A consultant will reach out to discuss alternatives.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_DECLINED', auditEventType: 'ops_credit_declined' },
    { id: 'pending', label: 'Mark pending more info', tone: 'warn', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, your application is being reviewed. We need: {{reason}}. We\'ll be in touch soon.',
      whatsappTarget: 'buyer', auditEventType: 'ops_credit_pending' },
  ],
}

const INSPECTION_REVIEW: PhaseWorkflow = {
  hint: 'Review Hartcon\'s roadworthy + technical inspection result.',
  checklist: ['Inspection scheduled + completed', 'Roadworthy passed', 'Technical inspection passed', 'No major concerns flagged'],
  actions: [
    { id: 'inspection_passed', label: 'Inspection PASSED', tone: 'success',
      advanceToPhase: 'QUOTE', markMilestone: 'inspection_passed',
      whatsappTemplate: 'Hi {{first_name}}, the vehicle has passed inspection ✅ — we\'ll send your quote shortly.',
      whatsappTarget: 'buyer',
      auditEventType: 'ops_inspection_passed' },
    { id: 'inspection_failed', label: 'Inspection FAILED', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, the vehicle didn\'t pass inspection: {{reason}}. Let us know if you\'d like to discuss next steps.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_ON_HOLD', auditEventType: 'ops_inspection_failed' },
    { id: 'remediation', label: 'Request remediation', tone: 'warn', requiresReason: true,
      auditEventType: 'ops_inspection_remediation' },
  ],
}

const QUOTE: PhaseWorkflow = {
  hint: 'Prepare and send the WesBank quote. Wait for buyer accept / decline.',
  checklist: ['Quote prepared in Quote tab', 'Buyer received quote', 'Terms verified with WesBank'],
  actions: [
    { id: 'quote_accepted', label: 'Quote accepted', tone: 'success',
      advanceToPhase: 'CONTRACT', markMilestone: 'quote_accepted',
      setDealStatus: 'QUOTE_ACCEPTED', auditEventType: 'ops_quote_accepted' },
    { id: 'quote_declined', label: 'Quote declined', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, we understand the quote isn\'t right for you: {{reason}}. Let us know if you\'d like a revised offer.',
      whatsappTarget: 'buyer',
      setDealStatus: 'QUOTE_DECLINED', auditEventType: 'ops_quote_declined' },
    { id: 'send_revised', label: 'Send revised quote', tone: 'warn', requiresReason: true,
      auditEventType: 'ops_quote_revised' },
  ],
}

const CONTRACT: PhaseWorkflow = {
  hint: 'Buyer + seller contracts must be signed before payout.',
  checklist: ['Buyer finance agreement signed', 'Seller agreement signed', 'Both PDFs on file'],
  actions: [
    { id: 'contract_signed', label: 'Contracts signed', tone: 'success',
      advanceToPhase: 'HANDOVER', markMilestone: 'contract_signed',
      setDealStatus: 'BUYER_CONTRACT_SIGNED', auditEventType: 'ops_contract_signed' },
    { id: 'request_signature', label: 'Re-send for signature', tone: 'warn', requiresReason: true,
      auditEventType: 'ops_contract_resent' },
  ],
}

const HANDOVER: PhaseWorkflow = {
  hint: 'Buyer collects the vehicle. Confirm both parties happy before payout.',
  checklist: ['Handover scheduled', 'Buyer confirmed receipt', 'Vehicle keys + papers exchanged'],
  actions: [
    { id: 'handover_done', label: 'Handover complete', tone: 'success',
      advanceToPhase: 'PAYOUT', markMilestone: 'handover_confirmed',
      auditEventType: 'ops_handover_confirmed' },
    { id: 'handover_disputed', label: 'Buyer disputes — pause', tone: 'danger', requiresReason: true,
      whatsappTemplate: 'Hi {{first_name}}, we\'ve paused payout while we investigate your concern: {{reason}}. A consultant will reach out.',
      whatsappTarget: 'buyer',
      setDealStatus: 'DEAL_ON_HOLD', auditEventType: 'ops_handover_disputed' },
  ],
}

const PAYOUT: PhaseWorkflow = {
  hint: 'WesBank pays the seller. Final step before NATIS transfer.',
  checklist: ['WesBank payout instruction sent', 'Seller bank confirmed receipt'],
  actions: [
    { id: 'payout_done', label: 'Payout confirmed', tone: 'success',
      advanceToPhase: 'DONE', markMilestone: 'paid_out',
      setDealStatus: 'DEAL_FULFILLED', auditEventType: 'ops_payout_confirmed' },
    { id: 'payout_failed', label: 'Payout failed — investigate', tone: 'danger', requiresReason: true,
      auditEventType: 'ops_payout_failed' },
  ],
}

const DONE: PhaseWorkflow = {
  hint: 'Deal is closed. No further actions.',
  actions: [],
}

const REGISTRY: Record<string, PhaseWorkflow> = {
  POPIA_CONSENT,
  OFFER_TO_PURCHASE,
  PRICE_GATE,
  ID_DOC,
  PROOF_OF_ADDRESS,
  BANK_STATEMENTS,
  AFFORDABILITY,
  SELLER_NOTIFY,
  CREDIT_DECISION,
  INSPECTION_REVIEW,
  QUOTE,
  CONTRACT,
  HANDOVER,
  PAYOUT,
  DONE,
}

const FALLBACK: PhaseWorkflow = {
  hint: 'No specific workflow defined for this phase yet. Use the generic actions below.',
  actions: [
    { id: 'mark_done', label: 'Mark step complete', tone: 'success', auditEventType: 'ops_phase_marked_done' },
  ],
}

export function getPhaseWorkflow(phaseKey: string | null | undefined): PhaseWorkflow {
  if (!phaseKey) return FALLBACK
  return REGISTRY[phaseKey] ?? FALLBACK
}
