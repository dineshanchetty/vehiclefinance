-- Migration: 20260417010000_conversation_state
-- Idempotent — creates the conversation_state table, updated_at trigger,
-- deal_id index, and RLS policy for the WhatsApp bot state machine.
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_state (
  phone          text        PRIMARY KEY,
  party_type     text        NOT NULL CHECK (party_type IN ('buyer', 'seller')),
  current_step   text        NOT NULL,
  deal_id        uuid        REFERENCES deals(id) ON DELETE SET NULL,
  last_activity  timestamptz NOT NULL DEFAULT now(),
  context        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  malformed_count int        NOT NULL DEFAULT 0,
  is_stuck       boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  conversation_state                IS 'Per-phone WhatsApp bot conversation state, persisted across sessions.';
COMMENT ON COLUMN conversation_state.phone          IS 'E.164 phone number without leading plus — primary key.';
COMMENT ON COLUMN conversation_state.party_type     IS 'buyer or seller.';
COMMENT ON COLUMN conversation_state.current_step   IS 'Current state-machine step name (BuyerStep | SellerStep).';
COMMENT ON COLUMN conversation_state.deal_id        IS 'Associated deal UUID (null until deal is created).';
COMMENT ON COLUMN conversation_state.malformed_count IS 'Count of consecutive malformed/unrecognised inputs; used for escalation.';
COMMENT ON COLUMN conversation_state.is_stuck       IS 'True once malformed_count >= 3; triggers Q_HUMAN_ESCALATION task.';

-- ── updated_at auto-trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_state_updated_at ON conversation_state;
CREATE TRIGGER trg_conversation_state_updated_at
  BEFORE UPDATE ON conversation_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_conv_state_deal_id
  ON conversation_state (deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conv_state_last_activity
  ON conversation_state (last_activity);

CREATE INDEX IF NOT EXISTS idx_conv_state_stuck
  ON conversation_state (is_stuck)
  WHERE is_stuck = true;

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;

-- Only the service role (bot server) may read or write conversation state.
DROP POLICY IF EXISTS "service_role_all" ON conversation_state;
CREATE POLICY "service_role_all" ON conversation_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
