# Phase 2 — Auth & Row-Level Security (Worker brief)

Your job: make the web portal require login, make the DB enforce user
isolation, and make the bot's service-role boundary explicit.

## Absolute non-negotiables

- Work in your isolated worktree. Commit + push your branch.
- The service role key must NEVER leak into the web package. If you see it
  referenced from any `packages/web/**` file, flag it loudly and remove.
- RLS policies must be added as a proper migration file under
  `packages/api/supabase/migrations/`, NOT by running raw SQL.
- Exit criterion is DB-enforced: an anonymous session cannot read any
  `deals`, `buyers`, `sellers`, `documents`, `audit_events`, etc.

## Role model

| Role | Obtained via | Capabilities |
|------|--------------|---------------|
| `service_role` | Supabase service key (bot only) | Bypasses RLS. Only used server-side. |
| `ops_agent` | Supabase Auth magic-link login via web portal | Read all deals and writes; can update status, assign/complete tasks, insert audit_events. |
| `authenticated` (non-ops) | Any logged-in user who is not an ops_agent | No access to operational tables. |
| `anon` | No session | Zero access to operational tables. |

Buyers and sellers are NOT web portal users. They interact only via
WhatsApp through the bot (which uses service_role). So we do NOT need
per-buyer / per-seller RLS on operational tables at this time; we only
need to lock anon + non-ops authenticated users out.

## Deliverables

### 2.1 Migration: `packages/api/supabase/migrations/20260417000000_auth_rls.sql`

- Create a `profiles` table linked 1:1 to `auth.users`:
  - `id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
  - `email text NOT NULL UNIQUE`
  - `role text NOT NULL DEFAULT 'ops_agent' CHECK (role IN ('ops_agent','admin'))`
  - `full_name text`, `created_at timestamptz DEFAULT now()`
- Trigger `on_auth_user_created` that inserts into `profiles` when a new
  `auth.users` row appears.
- A helper function `public.is_ops_agent()` returning boolean — checks the
  current user's profile role.
- Enable RLS on ALL public tables used by the app:
  `deals, buyers, sellers, vehicles, documents, extraction_results,`
  `extraction_tasks, verification_checks, vehicle_photo_sets, vehicle_photos,`
  `vehicle_quick_evaluations, valuations, damage_assessments, quotes,`
  `inspections, contracts, signature_events, natis_fulfilments,`
  `notifications, tasks, ops_tasks, audit_events, audit_logs,`
  `conversation_messages, profiles`.
- Policies per table: two policies each:
  - `ops_agent_read`: `FOR SELECT TO authenticated USING (public.is_ops_agent())`
  - `ops_agent_write`: `FOR ALL TO authenticated USING (public.is_ops_agent()) WITH CHECK (public.is_ops_agent())`
  - Plus the existing `service_role_all` policy pattern for `service_role`.
  - `profiles` gets a policy so a user can read their own profile row (`USING (auth.uid() = id)`).
- Make the migration idempotent (wrap policy creation in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` or use `DROP POLICY IF EXISTS` + `CREATE POLICY`).

### 2.2 Web: Supabase Auth wiring

- Install `@supabase/auth-helpers-react` is NOT required; use the base client + a custom hook. Use what's already in `packages/web/package.json`.
- Update `packages/web/src/lib/supabase.ts` so it can expose both an anon client and the user's session-aware client (session handled automatically by Supabase JS).
- Add `packages/web/src/lib/auth.tsx`:
  - `AuthProvider` context that subscribes to `supabase.auth.onAuthStateChange`.
  - `useSession()` hook returning `{ session, loading, user, profile }`.
  - `useProfile()` hook that looks up `profiles` for the current user (ops_agent gate).
- Add `packages/web/src/components/ProtectedRoute.tsx`:
  - If `loading`, render a spinner.
  - If no session → redirect to `/login`.
  - If session but profile.role isn't `ops_agent` or `admin` → render a "waiting for approval" screen.
- Add `packages/web/src/pages/LoginPage.tsx`:
  - Email input.
  - "Send magic link" button calling `supabase.auth.signInWithOtp({ email })`.
  - Success state: "Check your email". No password flow.
  - Basic Tailwind styling.
- Wrap the router in `<AuthProvider>` and wrap ops routes in `<ProtectedRoute>`. Route `/login` stays public.
- Add a logout button in the main layout (top bar).

### 2.3 Bot: service-role boundary

- Audit `packages/bot/src/**/*.ts` and confirm every Supabase client uses
  `SUPABASE_SERVICE_ROLE_KEY`. Add an assertion at startup that fails fast
  if the key is missing (we already do in some places — make it consistent).

### 2.4 RLS integration tests: `packages/api/tests/test-rls.ts`

- New Deno test suite. Uses two clients:
  - `anonClient` built with the anon key.
  - `opsClient` built by signing in as a seeded ops_agent via
    `supabase.auth.signInWithPassword` OR a server-generated JWT.
- Must cover:
  - anon SELECT on deals → 0 rows or error (confirm RLS bites).
  - anon INSERT on deals → error.
  - ops_agent SELECT on deals → success.
  - ops_agent INSERT/UPDATE on tasks → success.
- Add seed step to create an ops_agent user for tests (or skip test if
  seed not available, documented in the report).

### 2.5 Seed script: `packages/api/supabase/seed.sql`

- Inserts one dev ops_agent profile (by email) for local/staging use.
- Documented in `PHASE_2_REPORT.md`.

## Exit criteria

1. New migration file exists and is idempotent (DROP POLICY IF EXISTS / DO blocks).
2. `is_ops_agent()` function defined, used in policies.
3. All operational public tables have RLS enabled and at least one policy.
4. `profiles` table created with trigger.
5. Web: login page, protected routes, logout works (describe flow in report).
6. No `SUPABASE_SERVICE_ROLE_KEY` or equivalent referenced anywhere under `packages/web/`.
7. RLS Deno test suite exists (tests may be skipped if seeded user can't be created, but the suite must exist and have test cases).
8. `PHASE_2_REPORT.md` with completion table.

## Process

1. Read this brief + `docs/uat/UAT_TRACK_B_ROADMAP.md`.
2. Look at `packages/shared/src/types/database.ts` for the `profiles` type shape (hint: it doesn't exist yet, which is fine — after your migration lands, Phase 0's `gen:types` will pick it up. For now, add `profiles` to `packages/shared/src/types/index.ts` manually).
3. Implement migration, then web auth, then RLS tests, then report.
4. Commit + push. Write `PHASE_2_REPORT.md`.
