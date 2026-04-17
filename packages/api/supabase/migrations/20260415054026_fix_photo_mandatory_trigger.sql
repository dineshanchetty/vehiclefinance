-- Migration: fix_photo_mandatory_trigger
-- Pulled from live project sahvfsoclzgsuewbiiah on 2026-04-17
-- Corrects the mandatory_angles array in update_photo_set_mandatory_count() to use the actual photo_angle enum values.

CREATE OR REPLACE FUNCTION update_photo_set_mandatory_count()
RETURNS TRIGGER AS $$
DECLARE
  mandatory_angles photo_angle[] := ARRAY[
    'FRONT_VIEW','REAR_VIEW','LEFT_SIDE','RIGHT_SIDE',
    'FRONT_LEFT_ANGLE','FRONT_RIGHT_ANGLE',
    'ODOMETER','INTERIOR_DASHBOARD','ENGINE_BAY'
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
