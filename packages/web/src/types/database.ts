/**
 * Web-package database types.
 *
 * IMPORTANT — Phase 3 schema-drift fix:
 *   This file used to be hand-written and diverged from the real Postgres
 *   schema (wrong column names, wrong enum values, fake FKs). All row/enum
 *   types now come from the auto-generated @vehiclefinance/shared types which
 *   are the source of truth (generated via `pnpm gen:types`).
 *
 *   Only the UI-enriched shapes (`DealWithRelations`, `TaskWithDeal`,
 *   `AuditFeedItem`) live here — everything else is re-exported.
 */

export type {
  Database,
  Json,
  Row,
  Insert,
  Update,
  Deal,
  Buyer,
  Seller,
  Vehicle,
  Document,
  ExtractionResult,
  ExtractionTask,
  VerificationCheck,
  VehiclePhotoSet,
  VehiclePhoto,
  VehicleQuickEvaluation,
  Valuation,
  DamageAssessment,
  Quote,
  Inspection,
  Contract,
  SignatureEvent,
  NatisFulfilment,
  Notification,
  Task,
  OpsTask,
  AuditEvent,
  AuditLog,
  ConversationMessage,
  Profile,
  ProfileInsert,
  ProfileUpdate,
  DealStatus,
  DocumentType,
  PartyType,
  ConditionBand,
  ConfidenceLevel,
  ContractType,
  DamageSeverity,
  DamageSource,
  NatisStatus,
  NotificationChannel,
  NotificationStatus,
  PhotoAngle,
  PhotoQualityStatus,
  QuoteStatus,
  SignatureStatus,
  TaskPriority,
  TaskStatus,
  VerificationStatus,
} from '@vehiclefinance/shared'

import type {
  Deal,
  Buyer,
  Seller,
  Vehicle,
  Task,
  AuditEvent,
  AuditLog,
} from '@vehiclefinance/shared'

// ── UI-enriched shapes ──────────────────────────────────────────────────────
//
// The schema has buyers/sellers/vehicles referencing deal_id (not the other
// way around), so the web portal fans out queries and attaches the rows as
// optional fields for convenient rendering.

export interface DealWithRelations extends Deal {
  buyer?: Buyer | null
  seller?: Seller | null
  vehicle?: Vehicle | null
}

export interface TaskWithDeal extends Task {
  deal?: {
    deal_number: string | null
    status: Deal['status']
    buyer?: Buyer | null
    vehicle?: Vehicle | null
  } | null
}

/**
 * Unified audit-feed item: merges `audit_events` and `audit_logs` into one
 * shape so the UI can render both in a single sorted list.
 */
export interface AuditFeedItem {
  id: string
  source: 'audit_events' | 'audit_logs'
  created_at: string
  deal_id: string | null
  event_type: string
  // From audit_events: free-text "actor" string + actor_type label.
  // From audit_logs: phone number of the conversational actor (may be null).
  actor: string | null
  actor_type: string | null
  details: Record<string, unknown> | null
  // From audit_events JOIN deals (when a deal exists)
  deal?: { deal_number: string | null } | null
}

// Map a raw audit_events row into the feed shape.
export function normalizeAuditEvent(
  row: AuditEvent & { deal?: { deal_number: string | null } | null },
): AuditFeedItem {
  return {
    id: row.id,
    source: 'audit_events',
    created_at: row.created_at,
    deal_id: row.deal_id,
    event_type: row.event_type,
    actor: row.actor ?? null,
    actor_type: row.actor_type ?? null,
    details:
      (row.details as Record<string, unknown> | null) ?? null,
    deal: row.deal ?? null,
  }
}

// Map a raw audit_logs row into the feed shape.
export function normalizeAuditLog(
  row: AuditLog & { deal?: { deal_number: string | null } | null },
): AuditFeedItem {
  return {
    id: row.id,
    source: 'audit_logs',
    created_at: row.created_at,
    deal_id: row.deal_id,
    event_type: row.event_type,
    actor: row.phone ?? null,
    actor_type: null,
    details:
      (row.metadata as Record<string, unknown> | null) ?? null,
    deal: row.deal ?? null,
  }
}
