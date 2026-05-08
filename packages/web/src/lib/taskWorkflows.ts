/**
 * Task workflow registry — per-queue / per-task_type definitions of:
 *   • What ops needs to do at this step
 *   • Which actions are available (Approve / Decline / Escalate / etc.)
 *   • Side effects each action triggers (deal phase advance, audit log,
 *     downstream tasks, optional WhatsApp message to the buyer)
 *
 * The QueuePage looks each task up by `(queue, task_type)` and renders the
 * matching card with the right buttons. Falls back to a generic
 * Approve / Decline / Escalate flow if there's no specific entry.
 */

export type ActionTone = 'primary' | 'success' | 'danger' | 'warn' | 'neutral'

export interface WorkflowAction {
  /** Stable id used in audit logs and onAction handlers. */
  id: string
  /** Button label. */
  label: string
  /** Visual tone. */
  tone: ActionTone
  /**
   * Decline-style actions need a reason + optionally send the buyer a
   * WhatsApp message. When true the UI opens a modal asking for both.
   */
  requiresReason?: boolean
  /**
   * If set, the UI prefills the WhatsApp template body for ops to edit before
   * sending. The {{reason}} placeholder is replaced with what ops typed.
   */
  whatsappTemplate?: string
  /** Marks task as which terminal status when this action fires. */
  taskStatus?: 'COMPLETED' | 'CANCELLED' | 'ESCALATED'
  /** Optional: advance deal phase after this action. */
  advancePhase?: { current_phase: string; milestone?: string }
  /** Optional: update legacy deal_status enum. */
  setDealStatus?: string
  /** Audit-event type to write. */
  auditEventType?: string
}

export interface WorkflowDef {
  /** What ops sees as the "what to do" hint. */
  hint: string
  /** Required checks/items shown as a checklist above the action buttons. */
  checklist?: string[]
  actions: WorkflowAction[]
}

// ─── Registry ────────────────────────────────────────────────────────────────

const W_BUYER_DOC_REVIEW: Record<string, WorkflowDef> = {
  REVIEW_BANK_STATEMENTS: {
    hint: 'Open the deal → Affordability tab. Confirm income/expenses are correctly extracted and the buyer name on each statement matches the OTP.',
    checklist: [
      '3 personal bank statements present',
      'Account holder matches buyer ID',
      'No business / corporate account',
      'Income & expenses extracted correctly',
    ],
    actions: [
      { id: 'approve',  label: 'Approve statements',  tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'bank_statements_approved' },
      { id: 'request_more', label: 'Request more info', tone: 'warn',  requiresReason: true,
        whatsappTemplate: 'Hi {{first_name}} — we need a bit more information on your bank statements: {{reason}}. Please reply with the missing detail and we\'ll keep moving.',
        taskStatus: 'ESCALATED', auditEventType: 'bank_statements_more_info' },
      { id: 'decline',  label: 'Decline',             tone: 'danger',  requiresReason: true,
        whatsappTemplate: 'Hi {{first_name}}, unfortunately we couldn\'t verify your bank statements: {{reason}}. A consultant will be in touch shortly to discuss alternative options.',
        taskStatus: 'COMPLETED', auditEventType: 'bank_statements_declined', setDealStatus: 'DEAL_DECLINED' },
    ],
  },
  VERIFY_PROOF_OF_ADDRESS: {
    hint: 'Confirm the proof of address is recent (≤3 months) and the holder name + address match the buyer record.',
    checklist: [
      'Document dated within last 3 months',
      'Holder name matches buyer',
      'Address matches buyer record',
    ],
    actions: [
      { id: 'approve', label: 'Approve POA', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'poa_approved',
        advancePhase: { current_phase: 'BANK_STATEMENTS', milestone: 'address_verified' } },
      { id: 'request_resubmit', label: 'Request resubmission', tone: 'warn', requiresReason: true,
        whatsappTemplate: 'Hi {{first_name}} — your proof of address can\'t be accepted: {{reason}}. Please send a more recent utility bill or bank letter.',
        taskStatus: 'ESCALATED', auditEventType: 'poa_resubmit_requested' },
    ],
  },
}

const W_FNI_REVIEW: Record<string, WorkflowDef> = {
  AFFORDABILITY_CHECK: {
    hint: 'Run the affordability assessment on the deal\'s Affordability tab. Either approve to proceed to credit decision, or decline if the buyer can\'t support the instalment.',
    checklist: [
      'Avg monthly income ≥ R 8,000',
      'Disposable income ≥ instalment',
      'No business income mixed in',
      'Manual override sane (if applied)',
    ],
    actions: [
      { id: 'approve_affordability', label: 'Approve & submit for credit', tone: 'success',
        taskStatus: 'COMPLETED', auditEventType: 'affordability_approved',
        advancePhase: { current_phase: 'CREDIT_DECISION', milestone: 'affordability_assessed' },
        setDealStatus: 'FNI_REVIEW_PENDING' },
      { id: 'decline_affordability', label: 'Decline (unaffordable)', tone: 'danger', requiresReason: true,
        whatsappTemplate: 'Hi {{first_name}}, after reviewing your finances we don\'t think this vehicle at R{{price}} is affordable for you right now. Reason: {{reason}}. We\'ll suggest alternatives shortly.',
        taskStatus: 'COMPLETED', auditEventType: 'affordability_declined', setDealStatus: 'DEAL_DECLINED' },
    ],
  },
  PREPARE_QUOTE: {
    hint: 'Open the Quote tab and create a new quote for the buyer based on the credit decision terms.',
    checklist: ['Credit decision received', 'Quote terms agreed with WesBank', 'Quote created in Quote tab'],
    actions: [
      { id: 'quote_prepared', label: 'Quote ready', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'quote_prepared' },
    ],
  },
}

const W_DEAL_APPROVAL: Record<string, WorkflowDef> = {
  FINAL_APPROVAL: {
    hint: 'Final sign-off before contract dispatch. All other gates must be green.',
    checklist: [
      'Bank statements approved',
      'Affordability approved',
      'Credit decision: APPROVED',
      'Inspection: PASSED',
      'Buyer + Seller IDs verified',
    ],
    actions: [
      { id: 'approve_deal', label: 'Approve deal', tone: 'success',
        taskStatus: 'COMPLETED', auditEventType: 'deal_approved', setDealStatus: 'DEAL_APPROVED' },
      { id: 'decline_deal', label: 'Decline deal', tone: 'danger', requiresReason: true,
        whatsappTemplate: 'Hi {{first_name}}, after final review we\'re unable to proceed with this deal: {{reason}}. We\'re sorry — a consultant will reach out to discuss next steps.',
        taskStatus: 'COMPLETED', auditEventType: 'deal_declined', setDealStatus: 'DEAL_DECLINED' },
      { id: 'send_back_fni', label: 'Send back to F&I', tone: 'warn', requiresReason: true,
        taskStatus: 'ESCALATED', auditEventType: 'deal_returned_to_fni' },
    ],
  },
}

const W_HUMAN_ESCALATION: Record<string, WorkflowDef> = {
  BUYER_ID_MISMATCH: {
    hint: 'OTP buyer name vs ID name mismatch. Confirm with buyer before letting the deal proceed.',
    checklist: ['Spoke with buyer', 'Identified the correct legal name', 'Updated buyer record'],
    actions: [
      { id: 'resolved', label: 'Resolved — names match', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'id_mismatch_resolved' },
      { id: 'fraud', label: 'Suspected fraud — block', tone: 'danger', requiresReason: true,
        whatsappTemplate: 'Hi {{first_name}}, we\'ve paused your application due to identity verification concerns: {{reason}}. A consultant will contact you to resolve this.',
        taskStatus: 'COMPLETED', auditEventType: 'fraud_suspected', setDealStatus: 'DEAL_ON_HOLD' },
    ],
  },
}

const W_HARTCON_INSPECTION: Record<string, WorkflowDef> = {
  SCHEDULE_INSPECTION: {
    hint: 'Open the Inspection tab → Schedule. Coordinate a date with the seller and Hartcon.',
    checklist: ['Date agreed with seller', 'Inspector assigned', 'Scheduled record created'],
    actions: [
      { id: 'scheduled', label: 'Inspection scheduled', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'inspection_scheduled' },
    ],
  },
}

const W_SELLER_PHOTO_REVIEW: Record<string, WorkflowDef> = {
  REVIEW_VEHICLE_PHOTOS: {
    hint: 'Verify all 8 angles + odometer + VIN plate are clear and match the OTP vehicle.',
    checklist: ['Front · Rear · Both sides', 'Dash · Odometer · VIN plate', 'Engine bay', 'Quality acceptable'],
    actions: [
      { id: 'approve_photos', label: 'Approve photos', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'photos_approved' },
      { id: 'request_more_photos', label: 'Request retake', tone: 'warn', requiresReason: true,
        whatsappTemplate: 'Hi {{first_name}}, we need clearer photos: {{reason}}. Please retake and resend the missing angles.',
        taskStatus: 'ESCALATED', auditEventType: 'photos_resubmit_requested' },
    ],
  },
}

const W_SELLER_CONTRACT: Record<string, WorkflowDef> = {
  SEND_CONTRACT: {
    hint: 'Generate the seller agreement and send it via WhatsApp + email.',
    checklist: ['All seller details captured', 'Banking details verified', 'Contract generated'],
    actions: [
      { id: 'sent', label: 'Contract sent', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'seller_contract_sent' },
    ],
  },
}

const W_NATIS_FULFILMENT: Record<string, WorkflowDef> = {
  COLLECT_NATIS: {
    hint: 'Coordinate NATIS collection from the seller post-payout.',
    checklist: ['Payout confirmed', 'Collection arranged', 'NATIS doc received'],
    actions: [
      { id: 'collected', label: 'NATIS collected', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'natis_collected' },
    ],
  },
}

const REGISTRY: Record<string, Record<string, WorkflowDef>> = {
  Q_BUYER_DOC_REVIEW:    W_BUYER_DOC_REVIEW,
  Q_FNI_REVIEW:          W_FNI_REVIEW,
  Q_DEAL_APPROVAL:       W_DEAL_APPROVAL,
  Q_HUMAN_ESCALATION:    W_HUMAN_ESCALATION,
  Q_HARTCON_INSPECTION:  W_HARTCON_INSPECTION,
  Q_SELLER_PHOTO_REVIEW: W_SELLER_PHOTO_REVIEW,
  Q_SELLER_CONTRACT:     W_SELLER_CONTRACT,
  Q_NATIS_FULFILMENT:    W_NATIS_FULFILMENT,
}

const FALLBACK: WorkflowDef = {
  hint: 'Review the task notes and either complete it or escalate.',
  actions: [
    { id: 'complete', label: 'Mark complete', tone: 'success', taskStatus: 'COMPLETED', auditEventType: 'task_completed' },
    { id: 'escalate', label: 'Escalate',      tone: 'warn',    requiresReason: true,
      taskStatus: 'ESCALATED', auditEventType: 'task_escalated' },
  ],
}

export function getWorkflow(queue: string | null | undefined, taskType: string | null | undefined): WorkflowDef {
  if (!queue || !taskType) return FALLBACK
  return REGISTRY[queue]?.[taskType] ?? FALLBACK
}
