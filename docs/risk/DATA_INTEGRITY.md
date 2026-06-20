# Claimtec FinOps — Data Integrity & Migration Risk Register

_Last reviewed: 2026-05-25_

This document covers what can break, corrupt, or be lost during normal
operations, deploys, and recovery scenarios. Walks the actual schema —
not a generic checklist.

---

## 1. Schema drift between environments

### D-1.1 · Migrations are not yet auto-applied to production · 🟠 High · Open
**Where:** `packages/api/supabase/migrations/` has 10 ordered migration files. The dashboard project at `sahvfsoclzgsuewbiiah` was bootstrapped manually + has had ad-hoc fixes applied.
**Risk:** Running `supabase db push` against prod could overwrite hot-fixes or fail mid-migration. No clear "baseline = current prod state" anchor.
**Mitigation needed:**
1. Run `supabase db dump --linked > snapshots/prod-snapshot-$(date +%F).sql` weekly.
2. Reconcile current prod schema to an idempotent baseline migration.
3. Add `pnpm db:verify` to CI that runs the migration set against an ephemeral DB and asserts no errors.

### D-1.2 · Type generation lag · 🟡 Medium · Tracked
**Where:** `packages/web/src/types/database.ts` is generated from Supabase types but currently doesn't include `profiles` (added in `20260417000000_auth_rls.sql`).
**Mitigation in place:** `auth.tsx` already casts `supabase as any` to work around it. Comment is in the code.
**Action:** Run `pnpm gen:types` and commit. Add to CI to prevent recurrence.

---

## 2. Cascade deletes

### D-2.1 · Cascade depth across 23 tables · 🟡 Medium · Tracked
**Where:** A `DELETE FROM deals` cascades into ~20 child tables. Hot-fix migration `20260415064559_fix_cascade_deletes_for_tests.sql` had to add explicit `ON DELETE CASCADE` to allow Ari profile resets to work.
**Risk:** A misclick on the wrong deal in Supabase Studio nukes the entire deal history including audit. (Audit events stay due to immutability trigger but reference orphan IDs.)
**Mitigation:** Document the "Ari reset" SQL in `docs/ari-demo-handoff.md` so the cascade scope is auditable.
**Action:** Add a soft-delete column to `deals` (`deleted_at TIMESTAMPTZ`) and treat hard-delete as a privileged migration-only op.

### D-2.2 · `audit_events` immutability blocks hard-delete cascades · 🟢 Low · Mitigated
**Where:** `prevent_audit_event_modification` trigger.
**Confirmed behaviour:** Cascade-delete of a `deals` row fails when audit_events reference it, so we skip that table in the reset query. Orphaned audit events are intentional (compliance posture).

### D-2.3 · `extraction_results` orphans on document re-extract · 🟡 Medium · Open
**Where:** When a document is re-uploaded with a new extraction, old extraction_results rows are not deleted.
**Risk:** Storage waste + confusing downstream queries that don't filter by latest extraction.
**Action:** Either change `extraction_results.document_id` to ON DELETE CASCADE *via document recreation*, or add a `latest BOOLEAN` flag + index.

---

## 3. Mid-deploy hazards

### D-3.1 · Edge function deploys are non-atomic · 🟠 High · Tracked
**Where:** `supabase functions deploy` updates one function at a time. If `dialog360-webhook` and `extract-document` need a coordinated change, the gap between deploys is a broken window.
**Risk:** A buyer sending a message during deploy could hit the old bot calling the new extract-document — or vice versa — leading to either silent failures or wrong-shape responses.
**Mitigation idea:** Add a feature-flag column on `documents` (`extraction_strategy ENUM('mindee_only', 'cloudflare_first')`) so the bot can dynamically route to the right code path.
**Action:** For now, deploy during low-traffic windows (Sat morning).

### D-3.2 · Web deploy + edge function deploy are not coordinated · 🟡 Medium · Open
**Where:** Azure SWA deploys via Vercel CLI in a separate workflow from edge function deploys.
**Risk:** Dashboard could ship UI calling a tool name that doesn't exist yet on the bot side.
**Mitigation:** Backwards-compatibility checks in `tool-handlers.ts` (graceful 404 → fallback message).
**Action:** Pin a contract test — query bot's `/tools` endpoint at app boot and compare to what the UI calls.

### D-3.3 · Long-running Mindee jobs orphan after function timeout · 🟡 Medium · Mitigated (recently)
**Where:** `extract-document` polls Mindee for 60s. If it times out, the extraction_task is left `pending` forever.
**Mitigation in place:** Just fixed in this session — `handle_get_extraction_results` now surfaces elapsed time + tells the bot to retry; eventually the parent function does complete and writes results.
**Open follow-up:** Add a scheduled `cleanup_stale_extraction_tasks()` function that marks tasks failed after 5 min.

---

## 4. Backups & recovery

### D-4.1 · Daily backup status unknown · 🟠 High · Open
**Where:** Supabase Pro tier includes daily backups; current project tier not verified.
**Action:** Confirm tier on `sahvfsoclzgsuewbiiah`. If on Free, upgrade or add nightly `pg_dump` cron.

### D-4.2 · No tested restore procedure · 🟠 High · Open
**Risk:** Backups that aren't restore-tested are theatre.
**Action:** Quarterly restore drill to an ephemeral project. Document in `docs/runbooks/restore-from-backup.md`.

### D-4.3 · Storage bucket (PDFs + photos) backup posture unknown · 🟠 High · Open
**Risk:** All extracted documents live in Supabase Storage. If storage is not backed up separately, a regional outage could lose all buyer documents.
**Action:** Mirror storage to a separate S3 / R2 bucket nightly.

---

## 5. Concurrency & ordering

### D-5.1 · `runTaskAction` does 4 DB ops sequentially without a transaction · 🟡 Medium · Open
**Where:** `packages/web/src/lib/runTaskAction.ts` performs:
1. Update task
2. Insert audit_event
3. Update deals
4. Append milestone (read-modify-write race condition)
**Risk:** If the operator's tab crashes between steps 1 and 4, the task is closed but the deal phase hasn't advanced. Manual recovery needed.
**Action:** Wrap in a Supabase RPC function (Postgres function with `LANGUAGE plpgsql`) so all 4 ops run in one transaction. Existing pattern in `bulk_populate_from_otp`.

### D-5.2 · Milestone array append race · 🟠 High · Open
**Where:** `runTaskAction.ts:71-85` reads `completed_milestones`, appends, writes back. Classic read-modify-write race.
**Risk:** Two operators completing concurrent tasks on the same deal could lose one milestone.
**Action:** Replace with `UPDATE deals SET completed_milestones = array_append(completed_milestones, $1) WHERE NOT $1 = ANY(completed_milestones)` — atomic.

### D-5.3 · `dialog360-webhook` doesn't dedupe re-delivered messages · 🟡 Medium · Open
**Where:** Dialog360 may retry webhooks on 5xx. Bot doesn't track `message_id` uniqueness.
**Risk:** Duplicate buyer-side messages → bot processes the same upload twice → two extraction tasks → wasted Mindee credit.
**Action:** Add `UNIQUE INDEX conversation_messages_dialog_message_id_idx ON conversation_messages(dialog_message_id) WHERE dialog_message_id IS NOT NULL`.

---

## 6. Data validation gaps

### D-6.1 · SA ID Luhn not enforced at column level · 🟡 Medium · Open
See `SECURITY.md S-3.4`.

### D-6.2 · Phone numbers not normalised · 🟡 Medium · Open
**Where:** `buyers.phone`, `sellers.phone`, `conversation_messages.phone` accept any string. Today we have `+27 84 …`, `27848…`, `0848…` formats coexisting (verified during Ari reset).
**Risk:** Lookups by phone miss rows. Already caused friction during the Ari cleanup query.
**Action:** Trigger that normalises to E.164 (`+27...`) on insert/update.

### D-6.3 · Currency stored as numeric without explicit unit · 🟡 Medium · Tracked
**Where:** `deals.phase_state.agreed_price` is a numeric in cents-or-rand-ambiguous form.
**Risk:** Off-by-100 in display. Verified the UI assumes rand (no `/100` anywhere).
**Action:** Document the convention + add a `CHECK (agreed_price > 1000)` constraint (smallest realistic deal in cents would be 1000 cents = R10; in rand 1000 ≈ R1000 which is still below R30k floor).

### D-6.4 · Vehicle year not bounded · 🟢 Low · Open
**Where:** `vehicles.year` is a smallint with no range constraint.
**Action:** `CHECK (year BETWEEN 1950 AND extract(year from now()) + 1)`.

---

## 7. Irreversible operations checklist

For ops or eng, the following actions cannot be undone via dashboard:
- Hard-delete from `deals` (cascade to all children — except audit_events which orphan)
- Bot writing a NATIS fulfilment row with payment authorisation
- Mindee subscription cancellation (loses access to trained models; we own model IDs but can't query them without an active sub)
- Dialog360 channel disconnection (loses the WhatsApp number — Meta number-port required to re-acquire)
- Rotating the Supabase service role key without coordinated env-var update

**Action:** Add a `DESTRUCTIVE_ACTIONS.md` runbook with the exact pre-flight checks for each.

---

## Summary

| Severity | Count |
|---|---|
| 🟠 High | 6 (1 mitigated, 5 open) |
| 🟡 Medium | 11 (4 mitigated, 7 open) |
| 🟢 Low | 2 |

**Top 3 mitigations to land first:**
1. Confirm backup tier + run a restore drill (D-4.1 / D-4.2)
2. Wrap `runTaskAction` in a single transaction + fix the milestone race (D-5.1 / D-5.2)
3. Reconcile prod schema to migration baseline (D-1.1)
