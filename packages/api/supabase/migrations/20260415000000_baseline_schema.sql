-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  Baseline schema for vehiclefinance                                         ║
-- ║                                                                            ║
-- ║  Generated on 2026-04-17 from live project sahvfsoclzgsuewbiiah by         ║
-- ║  introspecting pg_catalog. Captures the state of the database BEFORE       ║
-- ║  Supabase migration tracking was enabled (at 2026-04-15 05:18:35Z).        ║
-- ║                                                                            ║
-- ║  After this runs, the 5 tracked migrations that came later in time apply  ║
-- ║  on top cleanly; together they reproduce the live schema.                  ║
-- ║                                                                            ║
-- ║  Contents:                                                                 ║
-- ║    • 18 enum types                                                         ║
-- ║    • 2 utility functions (generate_deal_number, set_updated_at)            ║
-- ║    • 1 sequence (deals_number_seq)                                         ║
-- ║    • 20 tables (deals, buyers, sellers, vehicles, documents, …)            ║
-- ║    • PK / UNIQUE constraints inline                                        ║
-- ║    • FK constraints added after tables                                     ║
-- ║    • Indexes                                                               ║
-- ║    • updated_at triggers + deal_number auto-generate trigger               ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()

-- ── Enum types ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE condition_band AS ENUM ('EXCELLENT','GOOD','FAIR','POOR','SEVERE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE confidence_level AS ENUM ('HIGH','MEDIUM','LOW','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_type AS ENUM ('SELLER_AGREEMENT','BUYER_FINANCE_AGREEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE damage_severity AS ENUM ('NONE','MINOR','MODERATE','MAJOR','SEVERE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE damage_source AS ENUM ('AI_PHOTO','INSPECTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deal_status AS ENUM (
    'APPLICATION_INITIATED','CONSENT_PENDING','CONSENT_GRANTED',
    'BUYER_DOCS_PENDING','EXTRACTION_IN_PROGRESS','BUYER_DOCS_EXTRACTED',
    'BUYER_CONFIRMATION_PENDING','BUYER_CONFIRMED',
    'SELLER_INVITED','SELLER_CONSENT_PENDING','SELLER_CONSENT_GRANTED',
    'SELLER_DOCS_PENDING','SELLER_EXTRACTION_IN_PROGRESS','SELLER_DOCS_EXTRACTED',
    'VEHICLE_PHOTOS_PENDING','VEHICLE_PHOTOS_PARTIAL','VEHICLE_PHOTOS_COMPLETE',
    'QUICK_EVAL_IN_PROGRESS','QUICK_EVAL_COMPLETE',
    'FNI_REVIEW_PENDING','QUOTE_PREPARATION','QUOTE_SENT','QUOTE_ACCEPTED',
    'QUOTE_DECLINED','QUOTE_EXPIRED',
    'INSPECTION_SCHEDULED','INSPECTION_COMPLETE',
    'SELLER_CONTRACT_PENDING','SELLER_CONTRACT_SENT','SELLER_CONTRACT_SIGNED',
    'BUYER_CONTRACT_PENDING','BUYER_CONTRACT_SENT','BUYER_CONTRACT_SIGNED',
    'DEAL_PENDING_APPROVAL','DEAL_APPROVED','DEAL_DECLINED',
    'NATIS_COLLECTION_PENDING','NATIS_COLLECTED','NATIS_TRANSFER_IN_PROGRESS',
    'NATIS_COMPLETE','DEAL_FULFILLED','DEAL_CANCELLED','DEAL_ON_HOLD',
    'SELLER_CONFIRMATION_PENDING','SELLER_CONFIRMED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'SA_ID_SMART_CARD','SA_ID_GREEN_BOOK','PROOF_OF_ADDRESS','BANK_STATEMENT',
    'PAYSLIP','VEHICLE_NATIS','VEHICLE_REGISTRATION','SETTLEMENT_LETTER',
    'VEHICLE_PHOTO','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE natis_status AS ENUM (
    'COLLECTION_PENDING','COLLECTED','TRANSFER_IN_PROGRESS','TRANSFER_COMPLETE','DOCS_SENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('WHATSAPP','SMS','EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('QUEUED','SENT','DELIVERED','READ','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE party_type AS ENUM ('BUYER','SELLER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE photo_angle AS ENUM (
    'FRONT_VIEW','REAR_VIEW','LEFT_SIDE','RIGHT_SIDE',
    'FRONT_LEFT_ANGLE','FRONT_RIGHT_ANGLE',
    'ODOMETER','INTERIOR_DASHBOARD','VIN_CHASSIS',
    'REAR_LEFT_ANGLE','REAR_RIGHT_ANGLE',
    'TYRE_FL','TYRE_FR','TYRE_RL','TYRE_RR',
    'BOOT_INTERIOR','DAMAGE_CLOSEUP','ENGINE_BAY'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE photo_quality_status AS ENUM ('ACCEPTED','ACCEPTED_WITH_WARNING','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','REVISED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE signature_status AS ENUM ('PENDING','SENT','OPENED','SIGNED','DECLINED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('LOW','NORMAL','HIGH','URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED','ESCALATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('PENDING','VERIFIED','MISMATCH','OVERRIDDEN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Utility functions ───────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS deals_number_seq
  AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_deal_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_year text;
  v_seq  bigint;
BEGIN
  v_year := to_char(now(), 'YYYY');
  v_seq  := nextval('deals_number_seq');
  NEW.deal_number := 'DL-' || v_year || '-' || lpad(v_seq::text, 5, '0');
  RETURN NEW;
END;
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_number            text UNIQUE,
  status                 deal_status NOT NULL DEFAULT 'APPLICATION_INITIATED',
  assigned_fni_analyst   uuid,
  assigned_seller_agent  uuid,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buyers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id              uuid NOT NULL,
  full_name            text,
  id_number            text,
  date_of_birth        date,
  gender               text,
  nationality          text,
  phone                text NOT NULL,
  email                text,
  physical_address     text,
  suburb               text,
  city                 text,
  postal_code          text,
  employer_name        text,
  employment_duration  text,
  monthly_income       numeric,
  consent_status       boolean NOT NULL DEFAULT false,
  consent_timestamp    timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sellers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id            uuid NOT NULL,
  full_name          text,
  id_number          text,
  phone              text NOT NULL,
  email              text,
  consent_status     boolean NOT NULL DEFAULT false,
  consent_timestamp  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                     uuid NOT NULL,
  make                        text,
  model                       text,
  year                        integer,
  registration_number         text,
  vin                         text,
  engine_number               text,
  colour                      text,
  asking_price                numeric,
  odometer_reading            text,
  year_of_first_registration  integer,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                    uuid NOT NULL,
  party                      party_type,
  doc_type                   document_type,
  file_url                   text,
  file_name                  text,
  file_size                  integer,
  mime_type                  text,
  classification_confidence  numeric,
  upload_timestamp           timestamptz NOT NULL DEFAULT now(),
  status                     text NOT NULL DEFAULT 'UPLOADED',
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extraction_results (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id                uuid NOT NULL,
  field_name                 text NOT NULL,
  extracted_value            text,
  confidence                 numeric,
  confidence_level           confidence_level,
  source_location            jsonb,
  verification_status        verification_status NOT NULL DEFAULT 'PENDING',
  customer_confirmed_value   text,
  confirmed_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_checks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             uuid NOT NULL,
  check_type          text NOT NULL,
  field_compared      text,
  doc_a_id            uuid,
  doc_b_id            uuid,
  result              text,
  severity            text,
  resolution_status   text NOT NULL DEFAULT 'OPEN',
  resolved_by         uuid,
  resolved_at         timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_photo_sets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             uuid NOT NULL,
  vehicle_id          uuid NOT NULL,
  mandatory_received  integer NOT NULL DEFAULT 0,
  mandatory_required  integer NOT NULL DEFAULT 9,
  optional_received   integer NOT NULL DEFAULT 0,
  coverage_score      numeric,
  status              text NOT NULL DEFAULT 'PENDING',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_set_id      uuid NOT NULL,
  angle_type        photo_angle,
  file_url          text,
  file_name         text,
  quality_score     numeric,
  quality_status    photo_quality_status,
  rejection_reason  text,
  retry_count       integer NOT NULL DEFAULT 0,
  upload_timestamp  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_quick_evaluations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                  uuid NOT NULL,
  vehicle_id               uuid NOT NULL,
  photo_set_id             uuid,
  evaluation_type          text NOT NULL DEFAULT 'AI_PHOTO_QUICK_EVAL',
  condition_band           condition_band,
  overall_confidence       numeric,
  exterior_summary         text,
  interior_summary         text,
  mechanical_indicators    jsonb,
  damage_items             jsonb,
  risk_flags               jsonb NOT NULL DEFAULT '[]'::jsonb,
  cross_image_consistency  text,
  requires_manual_review   boolean NOT NULL DEFAULT false,
  manual_review_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation           text,
  disclaimer               text NOT NULL DEFAULT 'This is a preliminary AI-assisted evaluation based on seller-uploaded photos only. It is advisory and does not replace the formal Hartcon vehicle inspection or final human valuation.',
  reviewed_by              uuid,
  reviewed_at              timestamptz,
  review_notes             text,
  review_outcome           text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS valuations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id            uuid NOT NULL,
  vehicle_id         uuid NOT NULL,
  trade_value        numeric,
  retail_value       numeric,
  forced_sale_value  numeric,
  valuation_source   text,
  approved_by        uuid,
  approved_at        timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS damage_assessments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id              uuid NOT NULL,
  vehicle_id           uuid NOT NULL,
  source               damage_source NOT NULL,
  source_reference_id  uuid,
  location             text,
  damage_type          text,
  severity             damage_severity,
  confidence           numeric,
  description          text,
  photo_reference      text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             uuid NOT NULL,
  finance_amount      numeric,
  term_months         integer,
  interest_rate       numeric,
  monthly_instalment  numeric,
  balloon_amount      numeric NOT NULL DEFAULT 0,
  total_credit_cost   numeric,
  valid_until         timestamptz,
  status              quote_status NOT NULL DEFAULT 'DRAFT',
  prepared_by         uuid,
  sent_at             timestamptz,
  accepted_at         timestamptz,
  declined_at         timestamptz,
  decline_reason      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             uuid NOT NULL,
  vehicle_id          uuid NOT NULL,
  inspector_name      text,
  scheduled_date      date,
  completed_date      date,
  report_url          text,
  damage_summary      text,
  overall_condition   condition_band,
  status              text NOT NULL DEFAULT 'PENDING',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                uuid NOT NULL,
  contract_type          contract_type NOT NULL,
  file_url               text,
  generated_at           timestamptz,
  sent_at                timestamptz,
  signed_at              timestamptz,
  signatory_name         text,
  signatory_id_number    text,
  signature_status       signature_status NOT NULL DEFAULT 'PENDING',
  signing_link           text,
  signing_provider_ref   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signature_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL,
  signatory    text,
  event_type   text NOT NULL,
  timestamp    timestamptz NOT NULL DEFAULT now(),
  ip_address   text,
  metadata     jsonb
);

CREATE TABLE IF NOT EXISTS natis_fulfilments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                     uuid NOT NULL UNIQUE,
  collection_status           text NOT NULL DEFAULT 'PENDING',
  collection_date             date,
  collector_name              text,
  transfer_status             text NOT NULL DEFAULT 'PENDING',
  transfer_date               date,
  docs_sent_to_customer_date  date,
  tracking_notes              text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           uuid,
  recipient_phone   text,
  recipient_email   text,
  channel           notification_channel NOT NULL,
  template          text,
  message_body      text,
  provider          text,
  provider_ref      text,
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  status            notification_status NOT NULL DEFAULT 'QUEUED',
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL,
  task_type     text NOT NULL,
  queue         text,
  assigned_to   uuid,
  priority      task_priority NOT NULL DEFAULT 'NORMAL',
  status        task_status NOT NULL DEFAULT 'PENDING',
  due_at        timestamptz,
  completed_at  timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     uuid,
  event_type  text NOT NULL,
  actor       text,
  actor_type  text,
  details     jsonb,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Foreign keys (wrapped in DO blocks so re-running is a no-op) ───────────
-- NOTE: notifications & audit_events get plain REFERENCES here; later migration
-- 20260415064559_fix_cascade_deletes_for_tests replaces them with CASCADE.
DO $$ BEGIN
  ALTER TABLE buyers              ADD CONSTRAINT buyers_deal_id_fkey              FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sellers             ADD CONSTRAINT sellers_deal_id_fkey             FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehicles            ADD CONSTRAINT vehicles_deal_id_fkey            FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE documents           ADD CONSTRAINT documents_deal_id_fkey           FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE extraction_results  ADD CONSTRAINT extraction_results_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE verification_checks ADD CONSTRAINT verification_checks_deal_id_fkey FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE verification_checks ADD CONSTRAINT verification_checks_doc_a_id_fkey FOREIGN KEY (doc_a_id)    REFERENCES documents(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE verification_checks ADD CONSTRAINT verification_checks_doc_b_id_fkey FOREIGN KEY (doc_b_id)    REFERENCES documents(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehicle_photo_sets  ADD CONSTRAINT vehicle_photo_sets_deal_id_fkey  FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehicle_photo_sets  ADD CONSTRAINT vehicle_photo_sets_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehicle_photos      ADD CONSTRAINT vehicle_photos_photo_set_id_fkey FOREIGN KEY (photo_set_id) REFERENCES vehicle_photo_sets(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehicle_quick_evaluations ADD CONSTRAINT vehicle_quick_evaluations_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehicle_quick_evaluations ADD CONSTRAINT vehicle_quick_evaluations_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vehicle_quick_evaluations ADD CONSTRAINT vehicle_quick_evaluations_photo_set_id_fkey FOREIGN KEY (photo_set_id) REFERENCES vehicle_photo_sets(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE valuations          ADD CONSTRAINT valuations_deal_id_fkey          FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE valuations          ADD CONSTRAINT valuations_vehicle_id_fkey       FOREIGN KEY (vehicle_id)  REFERENCES vehicles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE damage_assessments  ADD CONSTRAINT damage_assessments_deal_id_fkey  FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE damage_assessments  ADD CONSTRAINT damage_assessments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE quotes              ADD CONSTRAINT quotes_deal_id_fkey              FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inspections         ADD CONSTRAINT inspections_deal_id_fkey         FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE inspections         ADD CONSTRAINT inspections_vehicle_id_fkey      FOREIGN KEY (vehicle_id)  REFERENCES vehicles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE contracts           ADD CONSTRAINT contracts_deal_id_fkey           FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE signature_events    ADD CONSTRAINT signature_events_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE natis_fulfilments   ADD CONSTRAINT natis_fulfilments_deal_id_fkey   FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notifications       ADD CONSTRAINT notifications_deal_id_fkey       FOREIGN KEY (deal_id)     REFERENCES deals(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE tasks               ADD CONSTRAINT tasks_deal_id_fkey               FOREIGN KEY (deal_id)     REFERENCES deals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE audit_events        ADD CONSTRAINT audit_events_deal_id_fkey        FOREIGN KEY (deal_id)     REFERENCES deals(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deals_deal_number         ON deals(deal_number);
CREATE INDEX IF NOT EXISTS idx_deals_status              ON deals(status);
CREATE INDEX IF NOT EXISTS idx_buyers_deal_id            ON buyers(deal_id);
CREATE INDEX IF NOT EXISTS idx_buyers_phone              ON buyers(phone);
CREATE INDEX IF NOT EXISTS idx_sellers_deal_id           ON sellers(deal_id);
CREATE INDEX IF NOT EXISTS idx_sellers_phone             ON sellers(phone);
CREATE INDEX IF NOT EXISTS idx_documents_deal_id         ON documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_notifications_deal_id     ON notifications(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deal_id             ON tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_status        ON tasks(queue, status);
CREATE INDEX IF NOT EXISTS idx_audit_events_deal_id      ON audit_events(deal_id);

-- ── Triggers (updated_at + deal_number auto-generate) ───────────────────────
-- All wrapped in DROP IF EXISTS + CREATE so this file is idempotent.

DROP TRIGGER IF EXISTS trg_deals_deal_number ON deals;
CREATE TRIGGER trg_deals_deal_number
  BEFORE INSERT ON deals FOR EACH ROW WHEN (NEW.deal_number IS NULL)
  EXECUTE FUNCTION generate_deal_number();

DROP TRIGGER IF EXISTS trg_deals_updated_at              ON deals;
CREATE TRIGGER trg_deals_updated_at              BEFORE UPDATE ON deals              FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_buyers_updated_at             ON buyers;
CREATE TRIGGER trg_buyers_updated_at             BEFORE UPDATE ON buyers             FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sellers_updated_at            ON sellers;
CREATE TRIGGER trg_sellers_updated_at            BEFORE UPDATE ON sellers            FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated_at           ON vehicles;
CREATE TRIGGER trg_vehicles_updated_at           BEFORE UPDATE ON vehicles           FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_quotes_updated_at             ON quotes;
CREATE TRIGGER trg_quotes_updated_at             BEFORE UPDATE ON quotes             FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_inspections_updated_at        ON inspections;
CREATE TRIGGER trg_inspections_updated_at        BEFORE UPDATE ON inspections        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_contracts_updated_at          ON contracts;
CREATE TRIGGER trg_contracts_updated_at          BEFORE UPDATE ON contracts          FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_natis_fulfilments_updated_at  ON natis_fulfilments;
CREATE TRIGGER trg_natis_fulfilments_updated_at  BEFORE UPDATE ON natis_fulfilments  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at              ON tasks;
CREATE TRIGGER trg_tasks_updated_at              BEFORE UPDATE ON tasks              FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vehicle_photo_sets_updated_at ON vehicle_photo_sets;
CREATE TRIGGER trg_vehicle_photo_sets_updated_at BEFORE UPDATE ON vehicle_photo_sets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
