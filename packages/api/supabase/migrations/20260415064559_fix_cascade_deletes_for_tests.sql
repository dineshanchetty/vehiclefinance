-- Migration: fix_cascade_deletes_for_tests
-- Pulled from live project sahvfsoclzgsuewbiiah on 2026-04-17
-- Relaxes the audit_events immutability trigger to allow cascade deletes, and
-- adds ON DELETE CASCADE to audit_events.deal_id and notifications.deal_id so a
-- full deal cleanup works without disabling triggers.

-- 1. Fix audit_events trigger to allow cascade deletes (when parent deal is gone)
CREATE OR REPLACE FUNCTION prevent_audit_event_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Allow when parent deal has already been removed (cascade delete scenario)
    IF OLD.deal_id IS NULL OR NOT EXISTS (SELECT 1 FROM deals WHERE id = OLD.deal_id) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_events is immutable — modifications are not permitted';
END;
$$;

-- 2. Add ON DELETE CASCADE to audit_events.deal_id
ALTER TABLE audit_events DROP CONSTRAINT audit_events_deal_id_fkey;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;

-- 3. Add ON DELETE CASCADE to notifications.deal_id
ALTER TABLE notifications DROP CONSTRAINT notifications_deal_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_deal_id_fkey
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;
