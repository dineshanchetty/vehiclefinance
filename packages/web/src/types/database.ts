// ─── Status Enums ─────────────────────────────────────────────────────────────

export type DealStatus =
  | 'LEAD'
  | 'DOCS_PENDING'
  | 'DOCS_REVIEW'
  | 'FNI_REVIEW'
  | 'QUOTE_PENDING'
  | 'QUOTE_SENT'
  | 'QUOTE_ACCEPTED'
  | 'INSPECTION_PENDING'
  | 'INSPECTION_COMPLETE'
  | 'CONTRACT_PENDING'
  | 'CONTRACT_SIGNED'
  | 'NATIS_PENDING'
  | 'NATIS_COMPLETE'
  | 'SETTLED'
  | 'CANCELLED'
  | 'DECLINED'

export type DocumentStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'

export type DocumentType =
  | 'ID_DOCUMENT'
  | 'PROOF_OF_INCOME'
  | 'BANK_STATEMENT'
  | 'PROOF_OF_ADDRESS'
  | 'VEHICLE_REGISTRATION'
  | 'NATIS_DOCUMENT'
  | 'ROADWORTHY_CERTIFICATE'
  | 'OTHER'

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ESCALATED'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL'

export type QueueName =
  | 'Q_BUYER_DOC_REVIEW'
  | 'Q_SELLER_DOC_REVIEW'
  | 'Q_SELLER_PHOTO_REVIEW'
  | 'Q_FNI_REVIEW'
  | 'Q_FNI_QUOTE_PREP'
  | 'Q_HARTCON_INSPECTION'
  | 'Q_SELLER_CONTRACT'
  | 'Q_BUYER_CONTRACT'
  | 'Q_DEAL_APPROVAL'
  | 'Q_NATIS_COLLECTION'
  | 'Q_NATIS_FULFILMENT'
  | 'Q_MISMATCH_REVIEW'
  | 'Q_HUMAN_ESCALATION'
  | 'Q_SELLER_FOLLOWUP'

export type ContractType = 'SELLER' | 'BUYER'
export type ContractStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED' | 'EXPIRED'

export type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'

export type InspectionStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'FAILED'

export type NATISStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'REJECTED'

export type PhotoStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RE_UPLOAD_REQUESTED'

export type PhotoAngle =
  | 'FRONT'
  | 'REAR'
  | 'DRIVER_SIDE'
  | 'PASSENGER_SIDE'
  | 'INTERIOR_FRONT'
  | 'INTERIOR_REAR'
  | 'ENGINE_BAY'
  | 'ODOMETER'
  | 'DAMAGE_1'
  | 'DAMAGE_2'
  | 'DAMAGE_3'
  | 'OTHER'

export type ConditionBand = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'SEVERE'

export type DamageSeverity = 'MINOR' | 'MODERATE' | 'SEVERE'

export type ActorType = 'SYSTEM' | 'AGENT' | 'BUYER' | 'SELLER' | 'ADMIN'

export type ExtractionFieldStatus = 'PENDING' | 'ACCEPTED' | 'OVERRIDDEN' | 'FLAGGED'

// ─── Core Entities ─────────────────────────────────────────────────────────────

export interface Buyer {
  id: string
  first_name: string
  last_name: string
  id_number: string
  phone: string
  email: string | null
  date_of_birth: string | null
  employment_type: string | null
  employer_name: string | null
  monthly_income: number | null
  monthly_expenses: number | null
  credit_score: number | null
  address: string | null
  created_at: string
  updated_at: string
}

export interface Seller {
  id: string
  first_name: string
  last_name: string
  id_number: string | null
  phone: string
  email: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_branch_code: string | null
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: string
  make: string
  model: string
  year: number
  colour: string | null
  vin: string | null
  registration_number: string | null
  odometer_km: number | null
  engine_number: string | null
  transmission: string | null
  fuel_type: string | null
  asking_price: number | null
  agreed_price: number | null
  created_at: string
  updated_at: string
}

export interface Deal {
  id: string
  deal_number: string
  status: DealStatus
  buyer_id: string
  seller_id: string
  vehicle_id: string
  assigned_fni_agent_id: string | null
  assigned_ops_agent_id: string | null
  current_blockers: string[] | null
  sla_due_at: string | null
  created_at: string
  updated_at: string
  // joined
  buyer?: Buyer
  seller?: Seller
  vehicle?: Vehicle
}

export interface Document {
  id: string
  deal_id: string
  owner_type: 'BUYER' | 'SELLER'
  owner_id: string
  document_type: DocumentType
  status: DocumentStatus
  file_url: string | null
  file_name: string | null
  mime_type: string | null
  uploaded_at: string | null
  reviewed_at: string | null
  reviewer_id: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export interface ExtractionResult {
  id: string
  document_id: string
  deal_id: string
  field_name: string
  extracted_value: string | null
  confidence: number
  source_page: number | null
  customer_value: string | null
  status: ExtractionFieldStatus
  override_value: string | null
  override_by: string | null
  override_at: string | null
  flag_reason: string | null
  created_at: string
  updated_at: string
}

export interface VehiclePhotoSet {
  id: string
  deal_id: string
  vehicle_id: string
  status: PhotoStatus
  created_at: string
  updated_at: string
}

export interface VehiclePhoto {
  id: string
  photo_set_id: string
  angle: PhotoAngle
  file_url: string
  thumbnail_url: string | null
  quality_score: number | null
  status: PhotoStatus
  rejection_reason: string | null
  uploaded_at: string
  created_at: string
}

export interface DamageItem {
  description: string
  severity: DamageSeverity
  location: string | null
  estimated_repair_cost: number | null
}

export interface VehicleQuickEvaluation {
  id: string
  photo_set_id: string
  deal_id: string
  condition_band: ConditionBand
  confidence_score: number
  damage_items: DamageItem[]
  estimated_value_min: number | null
  estimated_value_max: number | null
  advisory_notes: string | null
  evaluated_at: string
  created_at: string
}

export interface Quote {
  id: string
  deal_id: string
  version: number
  status: QuoteStatus
  loan_amount: number
  deposit_amount: number
  interest_rate: number
  term_months: number
  monthly_instalment: number
  balloon_payment: number | null
  initiation_fee: number | null
  monthly_admin_fee: number | null
  insurance_premium: number | null
  total_cost_of_credit: number | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  declined_at: string | null
  declined_reason: string | null
  expiry_at: string | null
  created_at: string
  updated_at: string
}

export interface Inspection {
  id: string
  deal_id: string
  vehicle_id: string
  status: InspectionStatus
  inspector_name: string | null
  inspector_company: string | null
  scheduled_at: string | null
  completed_at: string | null
  report_url: string | null
  overall_condition: ConditionBand | null
  odometer_reading: number | null
  roadworthy: boolean | null
  defects: string[] | null
  recommendation: string | null
  final_valuation: number | null
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string
  deal_id: string
  contract_type: ContractType
  status: ContractStatus
  docusign_envelope_id: string | null
  file_url: string | null
  sent_at: string | null
  viewed_at: string | null
  signed_at: string | null
  declined_at: string | null
  expiry_at: string | null
  signatory_name: string | null
  signatory_email: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  deal_id: string
  queue: QueueName
  status: TaskStatus
  priority: TaskPriority
  title: string
  description: string | null
  assigned_to: string | null
  assigned_at: string | null
  due_at: string | null
  completed_at: string | null
  escalated_at: string | null
  escalation_reason: string | null
  created_at: string
  updated_at: string
  // joined
  deal?: Pick<Deal, 'deal_number' | 'status' | 'buyer' | 'vehicle'>
}

export interface AuditEvent {
  id: string
  deal_id: string | null
  event_type: string
  actor_id: string | null
  actor_type: ActorType
  actor_name: string | null
  details: Record<string, unknown>
  created_at: string
  // joined
  deal?: Pick<Deal, 'deal_number'>
}

export interface Notification {
  id: string
  recipient_id: string
  deal_id: string | null
  title: string
  body: string
  read: boolean
  created_at: string
}

export interface NATISFulfilment {
  id: string
  deal_id: string
  vehicle_id: string
  status: NATISStatus
  submitted_at: string | null
  processing_at: string | null
  completed_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  natis_reference: string | null
  collection_address: string | null
  collection_agent: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Supabase Database shape ───────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      deals: { Row: Deal; Insert: Omit<Deal, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Deal> }
      buyers: { Row: Buyer; Insert: Omit<Buyer, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Buyer> }
      sellers: { Row: Seller; Insert: Omit<Seller, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Seller> }
      vehicles: { Row: Vehicle; Insert: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Vehicle> }
      documents: { Row: Document; Insert: Omit<Document, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Document> }
      extraction_results: { Row: ExtractionResult; Insert: Omit<ExtractionResult, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ExtractionResult> }
      vehicle_photo_sets: { Row: VehiclePhotoSet; Insert: Omit<VehiclePhotoSet, 'id' | 'created_at' | 'updated_at'>; Update: Partial<VehiclePhotoSet> }
      vehicle_photos: { Row: VehiclePhoto; Insert: Omit<VehiclePhoto, 'id' | 'created_at'>; Update: Partial<VehiclePhoto> }
      vehicle_quick_evaluations: { Row: VehicleQuickEvaluation; Insert: Omit<VehicleQuickEvaluation, 'id' | 'created_at'>; Update: Partial<VehicleQuickEvaluation> }
      quotes: { Row: Quote; Insert: Omit<Quote, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Quote> }
      inspections: { Row: Inspection; Insert: Omit<Inspection, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Inspection> }
      contracts: { Row: Contract; Insert: Omit<Contract, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Contract> }
      tasks: { Row: Task; Insert: Omit<Task, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Task> }
      audit_events: { Row: AuditEvent; Insert: Omit<AuditEvent, 'id' | 'created_at'>; Update: Partial<AuditEvent> }
      notifications: { Row: Notification; Insert: Omit<Notification, 'id' | 'created_at'>; Update: Partial<Notification> }
      natis_fulfilments: { Row: NATISFulfilment; Insert: Omit<NATISFulfilment, 'id' | 'created_at' | 'updated_at'>; Update: Partial<NATISFulfilment> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
