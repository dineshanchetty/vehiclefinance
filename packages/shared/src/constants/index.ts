// Runtime arrays of DB enum values.
//
// These mirror the Postgres enum types in the public schema. They are the
// canonical source for iterating / validating against enum values in TS code.
// Keep in sync with the live DB; if the enum changes, update this file.
//
// Cross-checked against project sahvfsoclzgsuewbiiah on 2026-04-17.

import type {
  ConditionBand, ConfidenceLevel, ContractType, DamageSeverity, DamageSource,
  DealStatus, DocumentType, NatisStatus, NotificationChannel, NotificationStatus,
  PartyType, PhotoAngle, PhotoQualityStatus, QuoteStatus, SignatureStatus,
  TaskPriority, TaskStatus, VerificationStatus,
} from '../types'

export const CONDITION_BANDS: readonly ConditionBand[] = [
  'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'SEVERE',
] as const

export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = [
  'HIGH', 'MEDIUM', 'LOW', 'FAILED',
] as const

export const CONTRACT_TYPES: readonly ContractType[] = [
  'SELLER_AGREEMENT', 'BUYER_FINANCE_AGREEMENT',
] as const

export const DAMAGE_SEVERITIES: readonly DamageSeverity[] = [
  'NONE', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE',
] as const

export const DAMAGE_SOURCES: readonly DamageSource[] = [
  'AI_PHOTO', 'INSPECTION',
] as const

export const DEAL_STATUSES: readonly DealStatus[] = [
  'APPLICATION_INITIATED', 'CONSENT_PENDING', 'CONSENT_GRANTED',
  'BUYER_DOCS_PENDING', 'EXTRACTION_IN_PROGRESS', 'BUYER_DOCS_EXTRACTED',
  'BUYER_CONFIRMATION_PENDING', 'BUYER_CONFIRMED',
  'SELLER_INVITED', 'SELLER_CONSENT_PENDING', 'SELLER_CONSENT_GRANTED',
  'SELLER_DOCS_PENDING', 'SELLER_EXTRACTION_IN_PROGRESS', 'SELLER_DOCS_EXTRACTED',
  'VEHICLE_PHOTOS_PENDING', 'VEHICLE_PHOTOS_PARTIAL', 'VEHICLE_PHOTOS_COMPLETE',
  'QUICK_EVAL_IN_PROGRESS', 'QUICK_EVAL_COMPLETE',
  'FNI_REVIEW_PENDING', 'QUOTE_PREPARATION', 'QUOTE_SENT', 'QUOTE_ACCEPTED',
  'QUOTE_DECLINED', 'QUOTE_EXPIRED',
  'INSPECTION_SCHEDULED', 'INSPECTION_COMPLETE',
  'SELLER_CONTRACT_PENDING', 'SELLER_CONTRACT_SENT', 'SELLER_CONTRACT_SIGNED',
  'BUYER_CONTRACT_PENDING', 'BUYER_CONTRACT_SENT', 'BUYER_CONTRACT_SIGNED',
  'DEAL_PENDING_APPROVAL', 'DEAL_APPROVED', 'DEAL_DECLINED',
  'NATIS_COLLECTION_PENDING', 'NATIS_COLLECTED', 'NATIS_TRANSFER_IN_PROGRESS',
  'NATIS_COMPLETE', 'DEAL_FULFILLED', 'DEAL_CANCELLED', 'DEAL_ON_HOLD',
  'SELLER_CONFIRMATION_PENDING', 'SELLER_CONFIRMED',
] as const

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'SA_ID_SMART_CARD', 'SA_ID_GREEN_BOOK', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT',
  'PAYSLIP', 'VEHICLE_NATIS', 'VEHICLE_REGISTRATION', 'SETTLEMENT_LETTER',
  'VEHICLE_PHOTO', 'OTHER',
] as const

export const NATIS_STATUSES: readonly NatisStatus[] = [
  'COLLECTION_PENDING', 'COLLECTED', 'TRANSFER_IN_PROGRESS',
  'TRANSFER_COMPLETE', 'DOCS_SENT',
] as const

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  'WHATSAPP', 'SMS', 'EMAIL',
] as const

export const NOTIFICATION_STATUSES: readonly NotificationStatus[] = [
  'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED',
] as const

export const PARTY_TYPES: readonly PartyType[] = ['BUYER', 'SELLER'] as const

export const PHOTO_ANGLES: readonly PhotoAngle[] = [
  'FRONT_VIEW', 'REAR_VIEW', 'LEFT_SIDE', 'RIGHT_SIDE',
  'FRONT_LEFT_ANGLE', 'FRONT_RIGHT_ANGLE',
  'ODOMETER', 'INTERIOR_DASHBOARD', 'VIN_CHASSIS',
  'REAR_LEFT_ANGLE', 'REAR_RIGHT_ANGLE',
  'TYRE_FL', 'TYRE_FR', 'TYRE_RL', 'TYRE_RR',
  'BOOT_INTERIOR', 'DAMAGE_CLOSEUP', 'ENGINE_BAY',
] as const

/** The 9 angles the photo-set trigger counts toward mandatory_received. */
export const MANDATORY_PHOTO_ANGLES: readonly PhotoAngle[] = [
  'FRONT_VIEW', 'REAR_VIEW', 'LEFT_SIDE', 'RIGHT_SIDE',
  'FRONT_LEFT_ANGLE', 'FRONT_RIGHT_ANGLE',
  'ODOMETER', 'INTERIOR_DASHBOARD', 'ENGINE_BAY',
] as const

export const PHOTO_QUALITY_STATUSES: readonly PhotoQualityStatus[] = [
  'ACCEPTED', 'ACCEPTED_WITH_WARNING', 'REJECTED',
] as const

export const QUOTE_STATUSES: readonly QuoteStatus[] = [
  'DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVISED',
] as const

export const SIGNATURE_STATUSES: readonly SignatureStatus[] = [
  'PENDING', 'SENT', 'OPENED', 'SIGNED', 'DECLINED', 'EXPIRED',
] as const

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  'LOW', 'NORMAL', 'HIGH', 'URGENT',
] as const

export const TASK_STATUSES: readonly TaskStatus[] = [
  'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ESCALATED',
] as const

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  'PENDING', 'VERIFIED', 'MISMATCH', 'OVERRIDDEN',
] as const

// ── Task queue names ────────────────────────────────────────────────────────
// tasks.queue is a plain text column (no DB enum yet). This list is the canonical
// set of queues used by the ops portal and bot. If a new queue is introduced,
// add it here FIRST, then the consumer code will narrow correctly.
export const TASK_QUEUES = [
  'Q_BUYER_DOC_REVIEW',
  'Q_SELLER_DOC_REVIEW',
  'Q_SELLER_PHOTO_REVIEW',
  'Q_FNI_REVIEW',
  'Q_FNI_QUOTE_PREP',
  'Q_HARTCON_INSPECTION',
  'Q_SELLER_CONTRACT',
  'Q_BUYER_CONTRACT',
  'Q_DEAL_APPROVAL',
  'Q_NATIS_COLLECTION',
  'Q_NATIS_FULFILMENT',
  'Q_MISMATCH_REVIEW',
  'Q_HUMAN_ESCALATION',
  'Q_SELLER_FOLLOWUP',
] as const
export type TaskQueue = typeof TASK_QUEUES[number]

// ── Photo quality thresholds (mirror the trigger logic) ─────────────────────
export const PHOTO_QUALITY_THRESHOLDS = {
  ACCEPTED: 80,
  ACCEPTED_WITH_WARNING: 60,
} as const

// ── Requires-manual-review thresholds (mirror the trigger logic) ────────────
export const EVAL_CONFIDENCE_MANUAL_REVIEW_THRESHOLD = 0.60
