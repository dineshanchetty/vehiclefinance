# UAT Handoff Package

**Status:** Ready for UAT execution
**Branch:** `claude/focused-hugle`
**Handoff date:** 2026-04-23
**Track:** VehicleFinance UAT Prep — Phases 0–7

---

## 1. Executive summary

> _Fill in once all evaluators have reported. This section is for the business sponsor and gives them a one-page read on readiness._

- **What was built:** WhatsApp intake bot + ops portal + document extraction pipeline, end-to-end on Supabase.
- **What's been verified:** _(fill from evaluator verdicts)_
- **Known gaps going into UAT:** _(fill from open-issues ledger below)_
- **Go/no-go recommendation:** _(fill last)_

---

## 2. How to read this document

UAT testers should start at **§5 Test execution**. Engineering/ops reviewers should read **§3 Phase results** and **§4 Open issues ledger** first.

If you're spinning up a fresh environment, follow **§7 Environment bring-up** end-to-end before any testing.

---

## 3. Phase results

One row per completed phase. Each row links to the phase brief (the contract we committed to), the worker's self-report (what was delivered), and the evaluator verdict (independent check).

| # | Phase | Brief | Self-report | Evaluator verdict | Commit |
|---|-------|-------|-------------|-------------------|--------|
| 0 | Repo hygiene & schema reproducibility | `phase-briefs/PHASE_0_...` _(pre-track)_ | — | — | `04d0800` |
| 1 | Deployment infra | `phase-briefs/PHASE_1_DEPLOYMENT_INFRA.md` | `PHASE_1_REPORT.md` | CHANGES_REQUESTED → fixed in `e5362c4` | `b438c1d` + `e5362c4` |
| 2 | Auth & RLS | `phase-briefs/PHASE_2_AUTH_RLS.md` | `PHASE_2_REPORT.md` | PASS_WITH_NITS | `ad535dd` |
| 3 | Web portal live data | `phase-briefs/PHASE_3_WEB_LIVE_DATA.md` | `PHASE_3_REPORT.md` | _(in flight)_ | `fb2ab7a` |
| 4 | Bot flow completion | `phase-briefs/PHASE_4_BOT_FLOWS.md` | `PHASE_4_REPORT.md` (deprecated) | PASS_WITH_NITS, then code **removed** (see below) | `2f85153` → reverted by `f587b02` |
| 5 | Document extraction | `phase-briefs/PHASE_5_EXTRACTION.md` | `PHASE_5_REPORT.md` | CHANGES_REQUESTED → fixed in `0b15bc2` | `12f357c` + `0b15bc2` |
| 6 | UAT prep package | `phase-briefs/PHASE_6_UAT_PREP.md` | `PHASE_6_REPORT.md` | _(TBD)_ | `0b15bc2` |

---

### 3a. Phase 4 removal (2026-04-23)

Phase 4 delivered a hand-coded state machine (`packages/bot/src/flows/`) that
duplicated a production-ready Claude Agent SDK path (`packages/bot/src/agent/`)
already wired into `POST /webhook/dialog360`. The flow code was never routed;
it was dead on arrival. Commit `f587b02` removed:

- `packages/bot/src/flows/` (entire dir: `buyer-flow.ts`, `seller-flow.ts`, `strings.ts`)
- `packages/bot/src/state/conversation.ts` + its `services/conversation-state.ts` peer
- `packages/bot/src/handlers/notifications.ts` (unused)
- `packages/bot/src/types/index.ts` (every type had zero callers)
- `packages/bot/tests/` and `vitest.config.ts` (all tests exercised the dead code)
- The in-process escalation scheduler in `index.ts`
- Migration `20260417010000_conversation_state.sql` superseded by a drop migration

The agent layer (`agent/agent.ts`, `agent/tools.ts`, `agent/tool-handlers.ts`,
`agent/memory.ts`, `agent/system-prompts.ts`) is canonical and untouched.
Conversation turns persist in `conversation_messages`, not `conversation_state`.

**Consequence for UAT:** stuck-conversation detection is now unimplemented.
Whether to rebuild it (driven off `conversation_messages.created_at` via
pg_cron) is a product decision tracked in §4b below.

## 4. Open issues ledger

Everything the evaluators flagged that is **not blocking** but worth tracking. Anything blocking was either fixed in a follow-up commit (see §3) or reclassified below.

### 4a. Compliance / audit

- **State transitions don't write to `audit_logs`** (Phase 4). Each handler calls `advance`/`saveState`/`incrementMalformed` but no audit row is created. Compliance gap — flagged for a post-UAT phase.
- **`conversation_messages` policies re-created** in the Phase 2 migration, silently dropping any policies the prior migration had set. Low risk but worth a confirmation sweep.

### 4b. Runtime correctness

- **Extraction edge function treats PDFs as base64 images** (Phase 5). Claude Vision does not accept PDFs this way — PDF workflows likely 500 in production. Needs rasterization at caller or media-type tool path.
- **`extraction_results` schema mismatch** — the edge function inserts a single row with a `extracted_data` JSONB blob; the schema has per-field rows. Whether this is a fatal mismatch depends on downstream consumers.
- **Rate limit is process-local** (`_rateLimitMap` in `webhook.ts`). Multi-instance or redeploy resets the window. Acceptable for UAT; must move to Redis/Supabase before prod.
- **`getIdleConversations` doesn't filter `is_stuck = false`** — re-scans already-stuck rows each sweep. Wasted query, not a correctness issue (guarded at `markStuckIfIdle`).

### 4c. Deviations from the brief (self-consistent)

- **Phase 4 conversation_state schema** — worker used `current_step`, `context`, `last_activity`, `is_stuck` instead of brief's `current_state`, `state_context`, `last_message_at`, `stuck_since`. Internally consistent across code + types.
- **`PHOTO_SET_COMPLETE` state absent** — Phase 4 flow goes photos-complete → DATA_CONFIRMATION directly. Functionally equivalent, naming-only deviation.
- **Extraction route is `/extraction/:documentId`** — brief said `/deals/:id/extraction/:documentId`. Low severity.

### 4d. Documentation

- `PHASE_5_REPORT.md` lacks explicit Pass/Fail column per doc-type (brief asked for a matrix).
- No per-package `packages/bot/DEPLOY.md` stub (the fuller runbook lives at `docs/ops/DEPLOY.md`; stubs were added but are thin).

### 4e. Security follow-ups (post-UAT)

- `is_ops_agent()` is `SECURITY DEFINER`; grant `EXECUTE` only to `authenticated` + `service_role`, revoke from `anon`.
- No bearer-token validation in the extract-document edge function; relies on Supabase platform JWT injection. Confirm before prod exposure.
- **UAT sign-off P0 blocker (UAT-012):** verify `packages/web/src/lib/supabase.ts` uses the **anon** key, never `SUPABASE_SERVICE_ROLE_KEY`. If RLS is bypassed client-side, the entire Phase 2 auth story collapses.

---

## 5. Test execution

Everything the UAT team needs to run the test pass.

- **Test scripts:** `docs/uat/TEST_SCRIPTS.md` — 12 scenarios, UAT-001 to UAT-012.
- **Sign-off process:** `docs/uat/SIGNOFF.md` — entry/exit criteria, P0–P3 severity, daily triage cadence.
- **Defect logging:** `docs/uat/DEFECTS.md` — GitHub Issues template, 5-step triage.
- **Participants & credentials:** `docs/uat/PARTICIPANTS.md` — role assignments and environment access.
- **Reset between runs:** `packages/api/scripts/uat-reset.sh` — hard prod guard, FK-safe cascade, reseeds from `packages/api/supabase/seed.sql`.

> _Run `chmod +x packages/api/scripts/uat-reset.sh` once after cloning._

### Seed data overview

5 canonical deals (UAT-2026-001 to 005), one per pipeline status:
- 001 — `APPLICATION_INITIATED`
- 002 — `BUYER_DOCS_PENDING`
- 003 — `VEHICLE_PHOTOS_PARTIAL`
- 004 — `QUOTE_SENT`
- 005 — `NATIS_COLLECTION_PENDING`

All data is synthetic (E.164 `+27000000xxx` phones, `000000000000x` IDs, `UATVINxxx` VINs, every row tagged `notes = 'uat_seed'`).

---

## 6. Deployment state

- **Bot:** Fly.io app `vehiclefinance-bot`, region `jnb`. Deploys via `.github/workflows/deploy-bot.yml` on CI-success push to `main`.
- **Web:** Vercel project. Deploys via `.github/workflows/deploy-web.yml` on CI-success push to `main`. `vercel.json` at repo root; root directory = repo root.
- **DB:** Supabase project (ref in `SUPABASE_PROJECT_ID`). CI creates an ephemeral branch per PR and runs Deno integration tests against it, then destroys on `if: always()`.

Full runbook: `docs/ops/DEPLOY.md`.

---

## 7. Environment bring-up checklist

For someone spinning this up from a cold clone:

- [ ] `pnpm install --frozen-lockfile` at repo root
- [ ] `pnpm --filter @vehiclefinance/shared build`
- [ ] `pnpm --filter @vehiclefinance/bot typecheck && pnpm --filter @vehiclefinance/web typecheck`
- [ ] Supabase: apply all migrations in `packages/api/supabase/migrations/` (ordered)
- [ ] Supabase: run `packages/api/supabase/seed.sql` (requires ops-agent auth.users row first — see top of seed.sql)
- [ ] Set bot secrets via `flyctl secrets set` — see `packages/bot/DEPLOY.md`
- [ ] Set edge-function secrets via `supabase secrets set` — `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Deploy edge function: `supabase functions deploy extract-document --project-ref $SUPABASE_PROJECT_ID`
- [ ] Web env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (**anon**, never service_role)
- [ ] Sanity check: curl bot health `GET /health`, hit web `/login`, trigger test extraction

---

## 8. Sign-off

| Role | Name | Decision | Date |
|------|------|----------|------|
| Engineering lead | | | |
| Product owner | | | |
| Ops lead | | | |
| Compliance | | | |

Final decision template in `docs/uat/SIGNOFF.md`.
