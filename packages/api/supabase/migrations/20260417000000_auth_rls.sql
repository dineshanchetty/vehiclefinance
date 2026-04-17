-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  Migration: auth_rls                                                       ║
-- ║  Phase 2 — Auth & Row-Level Security (UAT Track B)                         ║
-- ║                                                                            ║
-- ║  Idempotent: safe to re-run. Uses DROP POLICY IF EXISTS before each        ║
-- ║  CREATE POLICY, and IF NOT EXISTS / DO ... EXCEPTION for schema objects.   ║
-- ║                                                                            ║
-- ║  Tables covered (24 total):                                                ║
-- ║    deals, buyers, sellers, vehicles, documents, extraction_results,        ║
-- ║    extraction_tasks, verification_checks, vehicle_photo_sets,              ║
-- ║    vehicle_photos, vehicle_quick_evaluations, valuations,                  ║
-- ║    damage_assessments, quotes, inspections, contracts, signature_events,   ║
-- ║    natis_fulfilments, notifications, tasks, ops_tasks, audit_events,       ║
-- ║    audit_logs, conversation_messages, profiles                             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 1. profiles table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'ops_agent' CHECK (role IN ('ops_agent', 'admin')),
  full_name   text,
  created_at  timestamptz DEFAULT now()
);

-- ── 2. Trigger: auto-insert profile on auth.users creation ───────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 3. Helper function: is_ops_agent() ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_ops_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('ops_agent', 'admin')
  );
$$;

-- ── 4. Enable RLS on all operational tables ───────────────────────────────────
-- NOTE: ENABLE ROW LEVEL SECURITY is idempotent — safe to run multiple times.

ALTER TABLE deals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_checks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_photo_sets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_photos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_quick_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE natis_fulfilments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;

-- ── 5. Policies ───────────────────────────────────────────────────────────────
-- Pattern for operational tables (all except profiles):
--   • service_role_all    — service_role bypasses RLS for bot server-side ops
--   • ops_agent_read      — authenticated ops_agent/admin can SELECT
--   • ops_agent_write     — authenticated ops_agent/admin can INSERT/UPDATE/DELETE

-- ─────────────────────────────────────────────────────────────────────────────
-- deals
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all    ON deals;
DROP POLICY IF EXISTS ops_agent_read      ON deals;
DROP POLICY IF EXISTS ops_agent_write     ON deals;

CREATE POLICY service_role_all ON deals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON deals
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON deals
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- buyers
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON buyers;
DROP POLICY IF EXISTS ops_agent_read   ON buyers;
DROP POLICY IF EXISTS ops_agent_write  ON buyers;

CREATE POLICY service_role_all ON buyers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON buyers
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON buyers
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- sellers
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON sellers;
DROP POLICY IF EXISTS ops_agent_read   ON sellers;
DROP POLICY IF EXISTS ops_agent_write  ON sellers;

CREATE POLICY service_role_all ON sellers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON sellers
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON sellers
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicles
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON vehicles;
DROP POLICY IF EXISTS ops_agent_read   ON vehicles;
DROP POLICY IF EXISTS ops_agent_write  ON vehicles;

CREATE POLICY service_role_all ON vehicles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON vehicles
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON vehicles
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- documents
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON documents;
DROP POLICY IF EXISTS ops_agent_read   ON documents;
DROP POLICY IF EXISTS ops_agent_write  ON documents;

CREATE POLICY service_role_all ON documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON documents
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON documents
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- extraction_results
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON extraction_results;
DROP POLICY IF EXISTS ops_agent_read   ON extraction_results;
DROP POLICY IF EXISTS ops_agent_write  ON extraction_results;

CREATE POLICY service_role_all ON extraction_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON extraction_results
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON extraction_results
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- extraction_tasks
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON extraction_tasks;
DROP POLICY IF EXISTS ops_agent_read   ON extraction_tasks;
DROP POLICY IF EXISTS ops_agent_write  ON extraction_tasks;

CREATE POLICY service_role_all ON extraction_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON extraction_tasks
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON extraction_tasks
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- verification_checks
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON verification_checks;
DROP POLICY IF EXISTS ops_agent_read   ON verification_checks;
DROP POLICY IF EXISTS ops_agent_write  ON verification_checks;

CREATE POLICY service_role_all ON verification_checks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON verification_checks
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON verification_checks
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicle_photo_sets
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON vehicle_photo_sets;
DROP POLICY IF EXISTS ops_agent_read   ON vehicle_photo_sets;
DROP POLICY IF EXISTS ops_agent_write  ON vehicle_photo_sets;

CREATE POLICY service_role_all ON vehicle_photo_sets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON vehicle_photo_sets
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON vehicle_photo_sets
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicle_photos
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON vehicle_photos;
DROP POLICY IF EXISTS ops_agent_read   ON vehicle_photos;
DROP POLICY IF EXISTS ops_agent_write  ON vehicle_photos;

CREATE POLICY service_role_all ON vehicle_photos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON vehicle_photos
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON vehicle_photos
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicle_quick_evaluations
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON vehicle_quick_evaluations;
DROP POLICY IF EXISTS ops_agent_read   ON vehicle_quick_evaluations;
DROP POLICY IF EXISTS ops_agent_write  ON vehicle_quick_evaluations;

CREATE POLICY service_role_all ON vehicle_quick_evaluations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON vehicle_quick_evaluations
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON vehicle_quick_evaluations
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- valuations
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON valuations;
DROP POLICY IF EXISTS ops_agent_read   ON valuations;
DROP POLICY IF EXISTS ops_agent_write  ON valuations;

CREATE POLICY service_role_all ON valuations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON valuations
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON valuations
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- damage_assessments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON damage_assessments;
DROP POLICY IF EXISTS ops_agent_read   ON damage_assessments;
DROP POLICY IF EXISTS ops_agent_write  ON damage_assessments;

CREATE POLICY service_role_all ON damage_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON damage_assessments
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON damage_assessments
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- quotes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON quotes;
DROP POLICY IF EXISTS ops_agent_read   ON quotes;
DROP POLICY IF EXISTS ops_agent_write  ON quotes;

CREATE POLICY service_role_all ON quotes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON quotes
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON quotes
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- inspections
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON inspections;
DROP POLICY IF EXISTS ops_agent_read   ON inspections;
DROP POLICY IF EXISTS ops_agent_write  ON inspections;

CREATE POLICY service_role_all ON inspections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON inspections
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON inspections
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- contracts
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON contracts;
DROP POLICY IF EXISTS ops_agent_read   ON contracts;
DROP POLICY IF EXISTS ops_agent_write  ON contracts;

CREATE POLICY service_role_all ON contracts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON contracts
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON contracts
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- signature_events
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON signature_events;
DROP POLICY IF EXISTS ops_agent_read   ON signature_events;
DROP POLICY IF EXISTS ops_agent_write  ON signature_events;

CREATE POLICY service_role_all ON signature_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON signature_events
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON signature_events
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- natis_fulfilments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON natis_fulfilments;
DROP POLICY IF EXISTS ops_agent_read   ON natis_fulfilments;
DROP POLICY IF EXISTS ops_agent_write  ON natis_fulfilments;

CREATE POLICY service_role_all ON natis_fulfilments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON natis_fulfilments
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON natis_fulfilments
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON notifications;
DROP POLICY IF EXISTS ops_agent_read   ON notifications;
DROP POLICY IF EXISTS ops_agent_write  ON notifications;

CREATE POLICY service_role_all ON notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON notifications
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON notifications
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON tasks;
DROP POLICY IF EXISTS ops_agent_read   ON tasks;
DROP POLICY IF EXISTS ops_agent_write  ON tasks;

CREATE POLICY service_role_all ON tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON tasks
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON tasks
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- ops_tasks
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON ops_tasks;
DROP POLICY IF EXISTS ops_agent_read   ON ops_tasks;
DROP POLICY IF EXISTS ops_agent_write  ON ops_tasks;

CREATE POLICY service_role_all ON ops_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON ops_tasks
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON ops_tasks
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_events
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON audit_events;
DROP POLICY IF EXISTS ops_agent_read   ON audit_events;
DROP POLICY IF EXISTS ops_agent_write  ON audit_events;

CREATE POLICY service_role_all ON audit_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON audit_events
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON audit_events
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON audit_logs;
DROP POLICY IF EXISTS ops_agent_read   ON audit_logs;
DROP POLICY IF EXISTS ops_agent_write  ON audit_logs;

CREATE POLICY service_role_all ON audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON audit_logs
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON audit_logs
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- conversation_messages
-- Note: service_role_all policy may already exist from the earlier migration.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all ON conversation_messages;
DROP POLICY IF EXISTS ops_agent_read   ON conversation_messages;
DROP POLICY IF EXISTS ops_agent_write  ON conversation_messages;
-- conversation_messages already had ENABLE ROW LEVEL SECURITY from 20260415000001

CREATE POLICY service_role_all ON conversation_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ops_agent_read ON conversation_messages
  FOR SELECT TO authenticated USING (public.is_ops_agent());

CREATE POLICY ops_agent_write ON conversation_messages
  FOR ALL TO authenticated
  USING (public.is_ops_agent())
  WITH CHECK (public.is_ops_agent());

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles  (special: users can read their own row)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_role_all  ON profiles;
DROP POLICY IF EXISTS ops_agent_read    ON profiles;
DROP POLICY IF EXISTS ops_agent_write   ON profiles;
DROP POLICY IF EXISTS own_profile_read  ON profiles;

CREATE POLICY service_role_all ON profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Any authenticated user can read their own profile row (needed at login time
-- before role is confirmed, so they can see their own role).
CREATE POLICY own_profile_read ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- Ops agents can see all profiles (useful for the admin view).
CREATE POLICY ops_agent_read ON profiles
  FOR SELECT TO authenticated USING (public.is_ops_agent());

-- Only service_role may write to profiles (profile is created by the trigger).
-- No ops_agent_write here — ops agents do not self-modify roles.
