# Phase 6 — UAT environment & scripts (Worker brief)

Your job: produce the operational artefacts the humans running UAT will
use. No code changes to bot/web/api. Only docs, seed scripts, and
process artefacts.

## Absolute non-negotiables

- Work in your isolated worktree; commit + push.
- You do NOT touch `packages/bot/**`, `packages/web/**`, or app code.
- You DO touch `docs/`, `packages/api/supabase/seed.sql`, and a reset script.

## Deliverables

### 6.1 Staging reset + seed script: `packages/api/scripts/uat-reset.sh`

- Bash script that:
  1. Confirms `SUPABASE_PROJECT_ID` is a staging project (refuses if it
     looks like prod — hardcode a list of known-prod ids to refuse).
  2. Runs a SQL cleanup: deletes test deals (`notes = 'uat_seed'`) and
     all cascaded children.
  3. Runs `supabase/seed.sql` to reinstate 5 canonical UAT deals.

### 6.2 `packages/api/supabase/seed.sql`

5 canonical deals at different statuses:

1. Deal A — fresh buyer, nothing uploaded yet (`APPLICATION_INITIATED`).
2. Deal B — buyer docs uploaded and awaiting extraction (`BUYER_DOCS_PENDING`).
3. Deal C — seller onboarded, vehicle photos partial (`VEHICLE_PHOTOS_PARTIAL`).
4. Deal D — quote sent, awaiting buyer acceptance (`QUOTE_SENT`).
5. Deal E — both contracts signed, awaiting NATIS collection (`NATIS_COLLECTION_PENDING`).

Include buyer, seller, vehicle, documents (metadata only, no real files),
photos (placeholder URLs), quotes, contracts as appropriate for each deal's
status. Mark each deal with `notes = 'uat_seed'` so the reset script finds them.

### 6.3 `docs/uat/TEST_SCRIPTS.md`

12 numbered scenarios. Format for each:
- **ID** (UAT-001…)
- **Persona** (Buyer / Seller / Ops Agent)
- **Pre-conditions** (which seed deal, which account)
- **Steps** (numbered, imperative)
- **Expected results** (measurable)
- **Severity if failing** (P0 blocker / P1 major / P2 minor)

Suggested coverage:
- UAT-001 Buyer happy path via WhatsApp end-to-end
- UAT-002 Seller happy path via WhatsApp end-to-end
- UAT-003 Buyer drops off mid-document-upload, returns next day, resumes
- UAT-004 Buyer uploads unreadable PoA → escalation to Q_HUMAN_ESCALATION
- UAT-005 Ops agent logs in and sees all pipeline deals
- UAT-006 Ops agent opens Deal C, reviews photos, approves quick eval
- UAT-007 Ops agent claims a task from Q_BUYER_DOC_REVIEW, completes it
- UAT-008 Ops agent escalates a stuck deal
- UAT-009 Low-confidence extraction triggers Q_MISMATCH_REVIEW task that ops agent resolves
- UAT-010 Realtime: a new task appears in the queue without page refresh
- UAT-011 Contract signed via link → signature_events populated → deal advances
- UAT-012 Anonymous visitor hitting /deals is redirected to /login (RLS boundary check)

### 6.4 `docs/uat/SIGNOFF.md`

- **Entry criteria** (what must be true before UAT starts).
- **Exit criteria** (all P0/P1 closed, list of open P2s acceptable).
- **Defect severity scale** (P0 through P3 with response SLAs).
- **Daily triage cadence** (9:30 meeting, bug triage rules).
- **Sign-off table** with slots for: Product owner, Compliance lead,
  Ops lead, Engineering lead. Each to initial + date.

### 6.5 `docs/uat/DEFECTS.md`

- GitHub Issues template for a UAT defect: title format
  `[UAT-XXX] <short desc>`, labels `uat`, `severity:P?`, `area:bot|web|api`.
- How to file, who triages, how to link to fix PRs.

### 6.6 `docs/uat/PARTICIPANTS.md`

Template for filling in real participants:

- Ops agent A, B (logins, test phones)
- Buyer test identities (WhatsApp phone numbers)
- Seller test identities
- Sandbox phone number for Dialog360

Fields are placeholders — user will fill real values before UAT.

## Exit criteria

1. `uat-reset.sh` + `seed.sql` present; seed creates exactly 5 deals each in a different status.
2. 12 test scripts, each with pre-conditions and measurable expected results.
3. `SIGNOFF.md` covers entry / exit / triage / sign-off table.
4. `DEFECTS.md` describes defect lifecycle.
5. `PARTICIPANTS.md` template in place.
6. `PHASE_6_REPORT.md` in `docs/uat/phase-briefs/`.

## Process

1. Read this brief + `docs/uat/UAT_TRACK_B_ROADMAP.md`.
2. Write seed + reset first (concrete).
3. Write test scripts. Be specific — "ops agent opens the deal and sees the buyer name match" not "checks the deal".
4. Commit + push + report.
