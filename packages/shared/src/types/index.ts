// Re-export the auto-generated Supabase database types plus convenient aliases.
// The generated `Database` type is the source of truth; everything else is a
// shortcut to reduce boilerplate at call sites.
//
// Phase 2 introduced the `profiles` table (migration 20260417000000_auth_rls.sql).
// Until `pnpm gen:types` is re-run with that migration applied live, the
// generated database.ts won't include `profiles` — so `Profile` is declared
// manually below. Remove once types are regenerated.

export type { Database, Json } from './database'
import type { Database } from './database'

type PublicSchema = Database['public']
type Tables = PublicSchema['Tables']
type Enums = PublicSchema['Enums']

// ── Row / Insert / Update helpers ───────────────────────────────────────────
export type Row<T extends keyof Tables>    = Tables[T]['Row']
export type Insert<T extends keyof Tables> = Tables[T]['Insert']
export type Update<T extends keyof Tables> = Tables[T]['Update']

// ── Table row aliases (the ones we refer to most often) ─────────────────────
export type Deal                    = Row<'deals'>
export type Buyer                   = Row<'buyers'>
export type Seller                  = Row<'sellers'>
export type Vehicle                 = Row<'vehicles'>
export type Document                = Row<'documents'>
export type ExtractionResult        = Row<'extraction_results'>
export type ExtractionTask          = Row<'extraction_tasks'>
export type VerificationCheck       = Row<'verification_checks'>
export type VehiclePhotoSet         = Row<'vehicle_photo_sets'>
export type VehiclePhoto            = Row<'vehicle_photos'>
export type VehicleQuickEvaluation  = Row<'vehicle_quick_evaluations'>
export type Valuation               = Row<'valuations'>
export type DamageAssessment        = Row<'damage_assessments'>
export type Quote                   = Row<'quotes'>
export type Inspection              = Row<'inspections'>
export type Contract                = Row<'contracts'>
export type SignatureEvent          = Row<'signature_events'>
export type NatisFulfilment         = Row<'natis_fulfilments'>
export type Notification            = Row<'notifications'>
export type Task                    = Row<'tasks'>
export type OpsTask                 = Row<'ops_tasks'>
export type AuditEvent              = Row<'audit_events'>
export type AuditLog                = Row<'audit_logs'>
export type ConversationMessage     = Row<'conversation_messages'>

// ── Enum type aliases ───────────────────────────────────────────────────────
export type DealStatus              = Enums['deal_status']
export type DocumentType            = Enums['document_type']
export type PartyType               = Enums['party_type']
export type ConditionBand           = Enums['condition_band']
export type ConfidenceLevel         = Enums['confidence_level']
export type ContractType            = Enums['contract_type']
export type DamageSeverity          = Enums['damage_severity']
export type DamageSource            = Enums['damage_source']
export type NatisStatus             = Enums['natis_status']
export type NotificationChannel     = Enums['notification_channel']
export type NotificationStatus      = Enums['notification_status']
export type PhotoAngle              = Enums['photo_angle']
export type PhotoQualityStatus      = Enums['photo_quality_status']
export type QuoteStatus             = Enums['quote_status']
export type SignatureStatus         = Enums['signature_status']
export type TaskPriority            = Enums['task_priority']
export type TaskStatus              = Enums['task_status']
export type VerificationStatus      = Enums['verification_status']

// ── Profile (manual, pending gen:types refresh post auth_rls migration) ─────
export interface Profile {
  id: string
  email: string
  role: 'ops_agent' | 'admin'
  full_name: string | null
  created_at: string
}

export type ProfileInsert = Omit<Profile, 'created_at'>
export type ProfileUpdate = Partial<ProfileInsert>
