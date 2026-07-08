-- Follow-up tracking for the automated outreach agent (recovery-followup).
ALTER TABLE decline_leads
  ADD COLUMN IF NOT EXISTS followup_count   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz;

COMMENT ON COLUMN decline_leads.followup_count IS 'Automated nudges sent this engagement (capped by recovery-followup).';
COMMENT ON COLUMN decline_leads.last_followup_at IS 'When the last automated nudge was sent.';
