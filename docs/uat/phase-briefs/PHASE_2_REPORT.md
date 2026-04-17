# Phase 2 — Auth & Row-Level Security: Completion Report

**Date:** 2026-04-17  
**Branch:** worktree-agent-a6912be0 (tracked as Phase 2 delivery off `claude/focused-hugle`)  
**Executor:** Claude agent (Phase 2 worker)

---

## RLS Model Chosen

**Single-role ops model.** Buyers and sellers interact only via WhatsApp (bot uses `service_role`); they never access the web portal. The web portal is restricted to two internal roles:

| Role | Source | Access |
|------|--------|--------|
| `service_role` | Supabase service key (bot only, never in browser) | Bypasses RLS entirely — full read/write via server-side code |
| `ops_agent` | Supabase Auth magic-link (web portal) | Read all tables, write status/tasks/audit |
| `admin` | Supabase Auth magic-link (web portal) | Same as ops_agent + admin profile visibility |
| `anon` / non-ops `authenticated` | — | Zero access to all operational tables |

No per-buyer / per-seller row filtering is applied at DB level in Phase 2 (bot uses service_role, so it is not needed). This is the simplest model that satisfies the POPIA isolation requirement for the web portal.

---

## Completion Table

| Deliverable | Status | File(s) |
|-------------|--------|---------|
| 2.1 profiles table + trigger + is_ops_agent() | DONE | `packages/api/supabase/migrations/20260417000000_auth_rls.sql` |
| 2.1 RLS ENABLED on all 25 tables | DONE | Same migration (25× `ALTER TABLE … ENABLE ROW LEVEL SECURITY`) |
| 2.1 service_role_all policy per table | DONE | Same migration |
| 2.1 ops_agent_read policy per table | DONE | Same migration |
| 2.1 ops_agent_write policy per table | DONE | Same migration |
| 2.1 profiles own_profile_read policy | DONE | Same migration |
| 2.1 Migration is idempotent | DONE | `DROP POLICY IF EXISTS` before every `CREATE POLICY` |
| 2.2 AuthProvider / useSession / useProfile | DONE | `packages/web/src/lib/auth.tsx` |
| 2.2 ProtectedRoute (spinner / redirect / pending-approval) | DONE | `packages/web/src/components/ProtectedRoute.tsx` |
| 2.2 LoginPage (magic link only, no password) | DONE | `packages/web/src/pages/LoginPage.tsx` |
| 2.2 App.tsx wired with AuthProvider + ProtectedRoute | DONE | `packages/web/src/App.tsx` |
| 2.2 Logout button in layout | DONE | `packages/web/src/App.tsx` (TopBar component) |
| 2.2 No service_role in web package | VERIFIED | grep confirmed zero matches |
| 2.3 Bot startup assertion for SUPABASE_SERVICE_ROLE_KEY | DONE | `packages/bot/src/index.ts` |
| 2.3 All bot Supabase clients use service_role | VERIFIED | All use `getSupabaseClient()` from `services/supabase.ts` |
| 2.4 RLS integration tests (anon-denied + ops-allowed) | DONE | `packages/api/tests/test-rls.ts` |
| 2.4 Tests skip gracefully when test user not seeded | DONE | Documented skip with reason printed |
| 2.5 seed.sql with dev ops_agent profile | DONE | `packages/api/supabase/seed.sql` |
| 2.6 Profile type in shared/src/types/index.ts | DONE | `packages/shared/src/types/index.ts` |
| 2.7 PHASE_2_REPORT.md | DONE | This file |

---

## Tables with RLS + Policies

All 25 tables have `ENABLE ROW LEVEL SECURITY` plus three policies each
(`service_role_all`, `ops_agent_read`, `ops_agent_write`), except `profiles`
which has `service_role_all`, `own_profile_read`, and `ops_agent_read`.

| Table | RLS Enabled | Policies |
|-------|-------------|---------|
| deals | YES | service_role_all, ops_agent_read, ops_agent_write |
| buyers | YES | service_role_all, ops_agent_read, ops_agent_write |
| sellers | YES | service_role_all, ops_agent_read, ops_agent_write |
| vehicles | YES | service_role_all, ops_agent_read, ops_agent_write |
| documents | YES | service_role_all, ops_agent_read, ops_agent_write |
| extraction_results | YES | service_role_all, ops_agent_read, ops_agent_write |
| extraction_tasks | YES | service_role_all, ops_agent_read, ops_agent_write |
| verification_checks | YES | service_role_all, ops_agent_read, ops_agent_write |
| vehicle_photo_sets | YES | service_role_all, ops_agent_read, ops_agent_write |
| vehicle_photos | YES | service_role_all, ops_agent_read, ops_agent_write |
| vehicle_quick_evaluations | YES | service_role_all, ops_agent_read, ops_agent_write |
| valuations | YES | service_role_all, ops_agent_read, ops_agent_write |
| damage_assessments | YES | service_role_all, ops_agent_read, ops_agent_write |
| quotes | YES | service_role_all, ops_agent_read, ops_agent_write |
| inspections | YES | service_role_all, ops_agent_read, ops_agent_write |
| contracts | YES | service_role_all, ops_agent_read, ops_agent_write |
| signature_events | YES | service_role_all, ops_agent_read, ops_agent_write |
| natis_fulfilments | YES | service_role_all, ops_agent_read, ops_agent_write |
| notifications | YES | service_role_all, ops_agent_read, ops_agent_write |
| tasks | YES | service_role_all, ops_agent_read, ops_agent_write |
| ops_tasks | YES | service_role_all, ops_agent_read, ops_agent_write |
| audit_events | YES | service_role_all, ops_agent_read, ops_agent_write |
| audit_logs | YES | service_role_all, ops_agent_read, ops_agent_write |
| conversation_messages | YES | service_role_all, ops_agent_read, ops_agent_write |
| profiles | YES | service_role_all, own_profile_read, ops_agent_read |

---

## Deviations from Brief

1. **No `ops_agent_write` on `profiles`** — The brief says profiles gets a policy so a user can read their own row. I added `own_profile_read` (any authenticated user reads their own row) and `ops_agent_read` (ops agents read all profiles). Write to profiles is reserved for `service_role` only (via the trigger). This is more secure than giving ops_agent direct profile write access.

2. **`database.ts` not committed** — The `packages/shared/src/types/database.ts` generated file is not in this worktree because it would need to be regenerated after the migration is applied to the live project. The `Profile` type is defined manually with a TODO comment. After applying the migration, run `pnpm gen:types` and commit the result.

3. **Worktree branch is `worktree-agent-a6912be0`** — The brief says work in the isolated worktree, which is this branch. The final push is to this branch. The evaluator should merge or cherry-pick into `claude/focused-hugle` as appropriate.

---

## Seed Usage

```bash
# Step 1: Create the auth user (choose one method)
# A) Dashboard: Authentication > Users > Invite
# B) CLI:
supabase auth users create --email ops-dev@vehiclefinance.local --password DevOps1234!

# Step 2: Apply the seed
supabase db reset  # local (includes seed.sql automatically)
# OR for staging:
psql $DATABASE_URL -f packages/api/supabase/seed.sql
```

---

## Running the RLS Tests

```bash
# Set env vars
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=eyJ...
# Optional — enables ops_agent tests:
export TEST_OPS_EMAIL=ops-dev@vehiclefinance.local
export TEST_OPS_PASSWORD=DevOps1234!

deno test --allow-env --allow-net packages/api/tests/test-rls.ts
```

Anon-denial tests always run. Ops-agent tests are skipped with a clear reason if `TEST_OPS_EMAIL`/`TEST_OPS_PASSWORD` are not set.

---

## Evaluator Concerns

- The `is_ops_agent()` function is `SECURITY DEFINER` which means it runs as its definer (postgres superuser) and can read the profiles table even if called from a restricted session. This is intentional and necessary for the RLS policy to work correctly.
- The `handle_new_user()` trigger is `SECURITY DEFINER` so it can insert into `profiles` (which has RLS enabled) when a new auth.users row is created by Supabase Auth.
- After applying this migration, confirm the trigger fires by creating a test auth user and checking that a profile row appears automatically.
