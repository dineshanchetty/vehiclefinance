# UAT Track B — Full Remediation Roadmap

**Goal:** Close every critical and high-severity gap identified in the readiness assessment, then run a clean end-to-end UAT with ops, buyer, and seller personas. Sign-off gate for each phase. No UAT scheduling until Phase 6 completes.

**Target:** Formal UAT kickoff ~5–7 weeks from 2026-04-17.

---

## Phase 0 — Repo hygiene & reproducibility   *(target: 2–3 days)*

**Why:** Today the live DB (`sahvfsoclzgsuewbiiah.supabase.co`) is the *only* source of truth for schema, triggers, and data types. A fresh checkout cannot reproduce it. Everything downstream (CI, staging, UAT env) needs this fixed first.

**Deliverables**

- [ ] All migrations applied to the live DB exported as numbered SQL files in `packages/api/supabase/migrations/`.
- [ ] `packages/shared/src/types/database.ts` generated from live schema and committed; `packages/shared/src/index.ts` re-exports it.
- [ ] Constants file `packages/shared/src/constants/index.ts` populated with DB enum values (deal_status, document_type, photo_angle, etc.) so bot/web don't reinvent them.
- [ ] Root `.env.example` that explains which env file each package needs.
- [ ] `.nvmrc` + `engines` block in root `package.json` pinning Node version.
- [ ] `pnpm run gen:types` wired so types regenerate from staging on demand.
- [ ] Verified: `pnpm install && pnpm build && pnpm typecheck` succeeds from a clean checkout.

**Exit criteria:** A fresh clone on a new machine can reproduce the DB schema via `supabase db reset` and typecheck passes.

---

## Phase 1 — Deployment infrastructure   *(target: 3–4 days)*

**Why:** No staging = no UAT. No CI = no confidence. This phase makes the whole thing shippable.

**Decisions needed up-front**

- **Bot hosting:** Fly.io (recommended — low friction Node + secrets), Railway, Cloud Run, or Render?
- **Web hosting:** Vercel (recommended) or Cloudflare Pages?
- **Staging DB:** Supabase branch off the main project, or a separate free-tier project?

**Deliverables**

- [ ] `packages/bot/Dockerfile` + deploy config (fly.toml if Fly).
- [ ] `packages/web/vercel.json` (or equivalent) with build command and env var list.
- [ ] Staging Supabase environment provisioned, secrets recorded in 1Password / team vault.
- [ ] `.github/workflows/ci.yml` — on PR: typecheck, lint, build, run Deno integration tests against a PR-scoped Supabase branch.
- [ ] `.github/workflows/deploy.yml` — on merge to `main`: deploy bot + web to staging; on tag `v*`: deploy to prod.
- [ ] Runbook `docs/ops/DEPLOY.md` covering deploy, rollback, env var rotation, secret management.

**Exit criteria:** Merge a PR to `main` and see bot + web come up on staging URLs automatically, with a passing green check on CI.

---

## Phase 2 — Auth & Row-Level Security   *(target: 3–5 days)*

**Why:** Web portal is currently wide open. UAT cannot proceed without user isolation. POPIA hard requirement.

**Design**

Three roles in the system:
- **`ops_agent`** — loan officers, operations team. Authenticated via Supabase email magic link. Can read all non-PII-restricted deal data, update status, assign/complete tasks, post audit entries.
- **`buyer` / `seller`** — end users. Do NOT log into the web portal. Identified via WhatsApp phone. RLS scopes their queries by phone match.
- **`service_role`** — bot only. Bypasses RLS. Must never be used from the browser.

**Deliverables**

- [ ] Supabase Auth magic-link login page at `/login` in web package.
- [ ] `useSession()` hook; `<ProtectedRoute>` wrapper on all ops pages.
- [ ] `profiles` table + trigger linking `auth.users` to an `ops_agent` role.
- [ ] RLS policies authored as migrations for all 21 tables (three policy classes: ops_agent_read, ops_agent_write, buyer_self, seller_self).
- [ ] RLS integration tests (new Deno suite `test-rls.ts`) proving an anon JWT can't read other users' data and an ops agent can.
- [ ] Seed script creates one ops_agent user for dev convenience.
- [ ] Web portal strictly uses `SUPABASE_ANON_KEY`, never the service role.

**Exit criteria:** A signed-out visitor hitting `/deals` is redirected to `/login`. An ops agent signed in can see all deals. RLS tests green.

---

## Phase 3 — Web portal live data   *(target: 5–7 days)*

**Why:** Every page today renders hardcoded mock arrays. UAT can't happen on mocks.

**Deliverables**

- [ ] `packages/web/src/lib/queries.ts` — typed Supabase query helpers using `packages/shared` types.
- [ ] `DealList.tsx` — paginated, filterable, sortable list backed by real `deals` + joins for buyer/seller/vehicle.
- [ ] `DealDetail.tsx` — live view of deal + buyer + seller + vehicle + documents (with thumbnails) + photos (9-angle grid + evaluation) + quote + contracts + signature events + audit trail. Action buttons: approve, reject, reassign, escalate.
- [ ] `QueuePage.tsx` — live task queue, assignment claim/release, status transitions, SLA timers.
- [ ] `AuditLog.tsx` — filterable audit feed across `audit_events` + `audit_logs`.
- [ ] Supabase Realtime subscription on the queue page so new tasks appear without refresh.
- [ ] Loading / error / empty states on every page.
- [ ] Vitest + React Testing Library coverage for each page's happy path.
- [ ] Lighthouse / a11y pass on the ops pages.

**Exit criteria:** Create a deal via the bot (or SQL), refresh the portal, see it appear with all joined data and be able to act on it.

---

## Phase 4 — Bot flow completion   *(target: 5–7 days)*

**Why:** Buyer & seller flows are scaffolded state machines. Need to confirm every state handler is real, persisted, idempotent, and resumable.

**Deliverables**

- [ ] Audit every state in `buyer-flow.ts` and `seller-flow.ts`; fill any stubs.
- [ ] `conversations` table (or reuse existing) stores per-phone state so a user who drops off at POA_UPLOAD resumes there on their next message.
- [ ] "Hang up & come back" test: simulate a user pausing 24h at each state, verify correct resumption.
- [ ] Timeout / escalation: if a buyer is stuck for > N hours, auto-create `Q_HUMAN_ESCALATION` task.
- [ ] Deterministic tests for flow transitions (Vitest) — no API calls, just the state machine.
- [ ] Integration tests: run a simulated full WhatsApp conversation against a staging bot, verify DB state at each step.

**Exit criteria:** A QA runs the full buyer journey via WhatsApp in staging and every state transition is recorded correctly in Supabase.

---

## Phase 5 — Document extraction   *(target: 5–10 days)*   ⚠️ largest unknown

**Why:** Today `trigger_extraction` just creates a pending row. Without real OCR/extraction, the buyer flow stalls at document upload. This is the single biggest risk in the roadmap.

**Decision up-front**

Three credible paths:
1. **Claude vision via agent tool** — reuse the Anthropic SDK the bot already has. Cheapest to build, good on structured SA docs, slower per request. **Recommended for MVP.**
2. **Google Document AI** — better on bank statements with tabular data, requires GCP project + billing.
3. **AWS Textract** — similar to GDAI.

**Deliverables (assuming path 1)**

- [ ] Supabase Edge Function `extract-document` that takes a `document_id`, fetches the file from storage, sends to Claude vision with a structured-output prompt per `doc_type`, writes `extraction_results` + confidence per field.
- [ ] `trigger_extraction` tool in bot actually invokes the edge function and awaits (or polls) result.
- [ ] Human review UI in web portal for results below confidence threshold (< 0.80).
- [ ] Reject / re-upload flow in bot when extraction fails or confidence is critically low (< 0.60).
- [ ] Golden-fixture tests: 5 sample SA_IDs, 5 bank statements, 5 PoA documents — known expected output, diff-asserted.

**Exit criteria:** Upload a buyer SA_ID via WhatsApp; within 30s the `extraction_results` rows populate with name, ID number, DOB, gender, etc. at realistic confidence scores.

---

## Phase 6 — UAT environment & scripts   *(target: 2–3 days)*

**Deliverables**

- [ ] Staging Supabase reset-and-seed script: wipes test data, inserts 5 canonical deals at various statuses (fresh, awaiting-docs, awaiting-photos, awaiting-quote-approval, ready-to-fulfil).
- [ ] 3 test WhatsApp numbers provisioned in Dialog360 sandbox.
- [ ] 2 UAT ops agent accounts created.
- [ ] `docs/uat/TEST_SCRIPTS.md` — one scripted scenario per persona-path. ~12 scenarios.
- [ ] `docs/uat/SIGNOFF.md` — entry/exit criteria, defect severity scale, who signs what.
- [ ] Defect tracking process: GitHub Issues labelled `uat` + severity; daily triage; fix-forward on `main` with auto-deploy.

**Exit criteria:** Docs reviewed + approved by product owner; staging seeded; UAT participants have access.

---

## Phase 7 — UAT execution   *(target: 1–2 weeks)*

- Daily defect triage + fix cycle.
- Weekly progress report.
- Sign-off meeting at end.

**Exit criteria:** All CRITICAL and HIGH defects resolved; product owner and compliance lead sign `SIGNOFF.md`.

---

## Risks & dependencies

| Risk | Mitigation |
|------|------------|
| Extraction quality below UAT bar | Start Phase 5 earlier; test on real (anonymised) document samples from day one |
| Dialog360 WhatsApp verification delay | Confirm production template approvals NOW; Phase 1 in parallel |
| RLS policy gaps expose data | Phase 2 exit criteria include adversarial tests |
| Staging Supabase diverges from prod | CI runs migrations on a fresh ephemeral branch each PR |
| Scope creep during UAT | Strict "Track B doesn't add features, only closes gaps" rule |

## Status log

| Date | Phase | Note |
|------|-------|------|
| 2026-04-17 | Phase 0 | Kickoff. Roadmap committed. Beginning migrations export + type generation. |
