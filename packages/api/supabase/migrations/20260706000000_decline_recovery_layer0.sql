-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  Migration: decline_recovery_layer0                                        ║
-- ║  Layer 0 — the shared decline-feed intake for the recovery platform.       ║
-- ║                                                                            ║
-- ║  Absa originates + declines in its own systems and sends declined records  ║
-- ║  to Claimtec. This layer receives them, de-dupes on the Absa reference,    ║
-- ║  and routes each by decline reason:                                        ║
-- ║    AFFORDABILITY   → Workstream A (upsell)                                  ║
-- ║    NON_CONTACTABLE → Workstream B (reactivation + tracing)                 ║
-- ║                                                                            ║
-- ║  Additive only — touches no existing table. Idempotent: safe to re-run.    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Enums ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE decline_reason AS ENUM ('AFFORDABILITY', 'NON_CONTACTABLE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recovery_workstream AS ENUM ('A_UPSELL', 'B_REACTIVATION', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recovery_status AS ENUM (
    'NEW',          -- ingested, not yet routed
    'ROUTED',       -- assigned to a workstream
    'TRACING',      -- (B) enriching contact details
    'ENGAGING',     -- outbound contact in progress
    'RE_ENGAGED',   -- customer replied / is participating
    'RETURNED',     -- lead handed back to Absa
    'FUNDED',       -- Absa funded the recovered deal
    'OPTED_OUT',    -- customer said STOP — suppressed permanently
    'UNREACHABLE',  -- (B) tracing + contact exhausted
    'CLOSED'        -- closed without recovery
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. decline_leads table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decline_leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance / de-dupe
  source                text NOT NULL DEFAULT 'absa',
  absa_ref              text NOT NULL,                 -- Absa application reference (de-dupe key)
  decline_reason        decline_reason NOT NULL,
  decline_reason_raw    text,                          -- the exact code Absa sent, pre-mapping
  workstream            recovery_workstream NOT NULL DEFAULT 'NONE',
  recovery_status       recovery_status NOT NULL DEFAULT 'NEW',

  -- Applicant identity
  full_name             text,
  id_number             text,

  -- Contact on file (may be stale — the reason for Workstream B)
  phone                 text,
  email                 text,
  physical_address      text,

  -- Traced / enriched contact (Workstream B, Layer B2)
  traced_phone          text,
  traced_email          text,
  traced_address        text,
  trace_source          text,                          -- which data source supplied it
  trace_confidence      numeric(4,3),                  -- 0.000–1.000

  -- Original application context
  vehicle_make          text,
  vehicle_model         text,
  vehicle_year          int,
  vehicle_price         numeric(12,2),
  deposit_amount        numeric(12,2),
  monthly_income        numeric(12,2),
  disposable_income     numeric(12,2),

  -- Workstream A output
  qualifying_ceiling    numeric(12,2),                 -- max affordable vehicle price (A1)

  -- Consent + linkage
  consent_basis         text,                          -- lawful basis recorded at intake
  recovery_deal_id      uuid REFERENCES deals(id) ON DELETE SET NULL,

  -- Full inbound record, for audit + re-processing
  raw_payload           jsonb,

  -- Lifecycle timestamps
  routed_at             timestamptz,
  returned_at           timestamptz,
  funded_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT decline_leads_absa_ref_source_key UNIQUE (source, absa_ref)
);

-- ── 3. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_decline_leads_reason   ON decline_leads (decline_reason);
CREATE INDEX IF NOT EXISTS idx_decline_leads_status   ON decline_leads (recovery_status);
CREATE INDEX IF NOT EXISTS idx_decline_leads_ws       ON decline_leads (workstream);
CREATE INDEX IF NOT EXISTS idx_decline_leads_created  ON decline_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decline_leads_deal     ON decline_leads (recovery_deal_id);

-- ── 4. updated_at trigger (reuses the existing set_updated_at()) ──────────────

DROP TRIGGER IF EXISTS trg_decline_leads_updated_at ON decline_leads;
CREATE TRIGGER trg_decline_leads_updated_at
  BEFORE UPDATE ON decline_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. Row-Level Security ────────────────────────────────────────────────────
-- Matches the platform convention: service_role has full access (the edge
-- functions run as service_role); authenticated ops agents get read access.

ALTER TABLE decline_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON decline_leads;
CREATE POLICY service_role_all ON decline_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ops_agent_read ON decline_leads;
CREATE POLICY ops_agent_read ON decline_leads
  FOR SELECT TO authenticated USING (public.is_ops_agent());

-- ── 6. Comments (self-documenting for the dashboard + future integrators) ────

COMMENT ON TABLE  decline_leads IS 'Layer 0 — declined applications received from Absa, routed into the recovery workstreams.';
COMMENT ON COLUMN decline_leads.absa_ref IS 'Absa application reference; unique per source — the idempotency / de-dupe key.';
COMMENT ON COLUMN decline_leads.qualifying_ceiling IS 'Workstream A output — max affordable vehicle price computed from affordability + rate/term matrix.';
COMMENT ON COLUMN decline_leads.trace_confidence IS 'Workstream B — confidence (0–1) of the traced contact detail from the external data source.';
