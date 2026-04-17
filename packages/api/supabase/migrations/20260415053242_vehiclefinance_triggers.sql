-- Migration: vehiclefinance_triggers
-- Pulled from live project sahvfsoclzgsuewbiiah on 2026-04-17
-- Adds the four trigger functions that power domain invariants.

-- ── Photo quality → quality_status trigger ────────────────────
CREATE OR REPLACE FUNCTION set_photo_quality_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quality_score IS NOT NULL THEN
    IF NEW.quality_score >= 80 THEN
      NEW.quality_status := 'ACCEPTED';
    ELSIF NEW.quality_score >= 60 THEN
      NEW.quality_status := 'ACCEPTED_WITH_WARNING';
    ELSE
      NEW.quality_status := 'REJECTED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicle_photos_quality_status
  BEFORE INSERT OR UPDATE ON vehicle_photos
  FOR EACH ROW EXECUTE FUNCTION set_photo_quality_status();

-- ── Photo set mandatory counter ───────────────────────────────
-- NOTE: this version uses placeholder enum values; corrected in 20260415054026.
CREATE OR REPLACE FUNCTION update_photo_set_mandatory_count()
RETURNS TRIGGER AS $$
DECLARE
  mandatory_angles photo_angle[] := ARRAY[
    'FRONT','REAR','DRIVER_SIDE','PASSENGER_SIDE',
    'INTERIOR_FRONT','INTERIOR_REAR','ENGINE_BAY','ODOMETER','BOOT'
  ]::photo_angle[];
  cnt INTEGER;
BEGIN
  IF NEW.angle_type = ANY(mandatory_angles) THEN
    SELECT COUNT(DISTINCT angle_type) INTO cnt
    FROM vehicle_photos
    WHERE photo_set_id = NEW.photo_set_id
      AND angle_type = ANY(mandatory_angles)
      AND (quality_status IS NULL OR quality_status != 'REJECTED');
    UPDATE vehicle_photo_sets SET mandatory_received = cnt WHERE id = NEW.photo_set_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicle_photos_update_set
  AFTER INSERT OR UPDATE ON vehicle_photos
  FOR EACH ROW EXECUTE FUNCTION update_photo_set_mandatory_count();

-- ── audit_events immutability ────────────────────────────────
-- NOTE: this version blocks all updates/deletes; relaxed in 20260415064559 to allow cascade deletes.
CREATE OR REPLACE FUNCTION prevent_audit_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is immutable — modifications are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_modification();

CREATE TRIGGER trg_audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_modification();

-- ── requires_manual_review trigger ───────────────────────────
CREATE OR REPLACE FUNCTION set_requires_manual_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.overall_confidence < 0.60 OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.damage_items, '[]'::jsonb)) item
             WHERE item->>'severity' = 'SEVERE') THEN
    NEW.requires_manual_review := TRUE;
  ELSE
    NEW.requires_manual_review := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicle_quick_evaluations_manual_review
  BEFORE INSERT OR UPDATE ON vehicle_quick_evaluations
  FOR EACH ROW EXECUTE FUNCTION set_requires_manual_review();
