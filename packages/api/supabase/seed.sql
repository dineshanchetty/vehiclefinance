-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  seed.sql — Development / staging seed data                                ║
-- ║                                                                            ║
-- ║  IMPORTANT: This file inserts a row into the `profiles` table ONLY.       ║
-- ║  The corresponding `auth.users` row must be created separately via:       ║
-- ║                                                                            ║
-- ║    Option A — Supabase Dashboard:                                          ║
-- ║      Authentication → Users → Invite user                                 ║
-- ║      Email: ops-dev@vehiclefinance.local                                  ║
-- ║                                                                            ║
-- ║    Option B — Supabase CLI:                                                ║
-- ║      supabase auth users create \                                          ║
-- ║        --email ops-dev@vehiclefinance.local \                              ║
-- ║        --password DevOps1234!                                              ║
-- ║                                                                            ║
-- ║  After the auth.users row exists, run this file:                          ║
-- ║      supabase db reset   (local)                                           ║
-- ║      psql $DATABASE_URL -f packages/api/supabase/seed.sql  (staging)      ║
-- ║                                                                            ║
-- ║  The trigger `on_auth_user_created` will have already inserted a profile  ║
-- ║  row automatically when the auth user was created. This UPSERT ensures    ║
-- ║  the role is set to `ops_agent` even if the trigger ran first.            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── Dev ops_agent profile ─────────────────────────────────────────────────────
-- This upsert is safe to run multiple times.
-- Replace the UUID below with the actual auth.users.id after creating the user.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Look up the auth user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'ops-dev@vehiclefinance.local'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Seed: auth user ops-dev@vehiclefinance.local not found. '
      'Create it first via the Supabase dashboard or CLI, then re-run seed.sql.';
  ELSE
    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (
      v_user_id,
      'ops-dev@vehiclefinance.local',
      'ops_agent',
      'Dev Ops Agent'
    )
    ON CONFLICT (id) DO UPDATE SET
      role      = 'ops_agent',
      full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Seed: upserted ops_agent profile for % (id=%)', 'ops-dev@vehiclefinance.local', v_user_id;
  END IF;
END;
$$;

-- ── Second dev user: admin ────────────────────────────────────────────────────
-- Create via dashboard/CLI with email: admin-dev@vehiclefinance.local

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'admin-dev@vehiclefinance.local'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (
      v_user_id,
      'admin-dev@vehiclefinance.local',
      'admin',
      'Dev Admin'
    )
    ON CONFLICT (id) DO UPDATE SET
      role      = 'admin',
      full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Seed: upserted admin profile for % (id=%)', 'admin-dev@vehiclefinance.local', v_user_id;
  END IF;
END;
$$;
