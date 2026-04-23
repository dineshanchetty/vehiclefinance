# UAT Test Scripts — vehiclefinance

**Version:** 1.0  
**Date:** 2026-04-17  
**Phase:** 6 — UAT Preparation  
**Seed prerequisite:** Run `packages/api/scripts/uat-reset.sh` before each session.

---

## Scenario Index

| ID | Title | Persona | Status Under Test | Severity |
|----|-------|---------|-------------------|----------|
| UAT-001 | New application initiated via WhatsApp | Buyer | APPLICATION_INITIATED | P1 |
| UAT-002 | Buyer uploads ID document | Buyer | BUYER_DOCS_PENDING | P1 |
| UAT-003 | Buyer uploads bank statement (completes docs) | Buyer | BUYER_DOCS_PENDING | P1 |
| UAT-004 | Seller submits vehicle photos (partial set) | Seller | VEHICLE_PHOTOS_PARTIAL | P1 |
| UAT-005 | Seller completes all 9 photo angles | Seller | VEHICLE_PHOTOS_PARTIAL | P1 |
| UAT-006 | Buyer views and accepts finance quote | Buyer | QUOTE_SENT | P1 |
| UAT-007 | Buyer declines finance quote | Buyer | QUOTE_SENT | P2 |
| UAT-008 | Ops agent reviews deal queue in web app | Ops Agent | Multiple | P1 |
| UAT-009 | F&I agent views deal detail and audit log | F&I Agent | QUOTE_SENT | P2 |
| UAT-010 | NATIS collection task progressed by ops | Ops Agent | NATIS_COLLECTION_PENDING | P1 |
| UAT-011 | SLA indicator displayed for overdue deal | Ops Agent | Any | P2 |
| UAT-012 | Anonymous visitor redirected from /deals to /login | Unauthenticated | RLS boundary | P0 |

---

## UAT-001 — New application initiated via WhatsApp

**ID:** UAT-001  
**Persona:** Buyer (Aiden Apleni, +27000000001)  
**Pre-conditions:**
- UAT environment reset and reseeded.
- Deal UAT-2026-001 exists in status `APPLICATION_INITIATED`.
- WhatsApp test handset connected to UAT Dialog360 channel.

**Steps:**
1. Send "Hi" from +27000000001 to the bot WhatsApp number.
2. Bot responds with a greeting and POPIA consent request.
3. Reply "I agree" to consent.
4. Bot acknowledges and explains next steps (upload ID).

**Expected results:**
- Bot reply received within 30 seconds.
- Consent acknowledgement persisted as an audit event (`POPIA_CONSENT`) in the database.
- Deal status remains `APPLICATION_INITIATED` (no premature advancement).
- `conversation_messages` row created for the exchange.

**Severity:** P1

---

## UAT-002 — Buyer uploads ID document

**ID:** UAT-002  
**Persona:** Buyer (Bongi Baloyi, +27000000002)  
**Pre-conditions:**
- Deal UAT-2026-002 exists in status `BUYER_DOCS_PENDING`.
- ID and proof-of-address documents already approved; bank statement pending.
- Test PDF ready to attach in WhatsApp.

**Steps:**
1. Send "I want to send my ID" from +27000000002.
2. Bot instructs buyer to send the ID document.
3. Attach and send a PDF (simulated ID document) in WhatsApp.
4. Bot confirms receipt and indicates extraction is in progress.
5. Wait up to 60 seconds; bot should confirm extracted fields and ask for verification.
6. Reply "Yes, that's correct".

**Expected results:**
- Document row created in `documents` with `document_type = 'ID_DOCUMENT'` and `status = 'UPLOADED'` then transitions to `UNDER_REVIEW`.
- `extraction_results` rows created with `confidence > 0`.
- Bot presents extracted name and ID number accurately.
- Audit event `DOCUMENT_CONFIRMED` logged.

**Severity:** P1

---

## UAT-003 — Buyer uploads bank statement (completes docs)

**ID:** UAT-003  
**Persona:** Buyer (Bongi Baloyi, +27000000002)  
**Pre-conditions:**
- UAT-002 completed (or deal reset to that state).
- ID and address docs approved; only bank statement outstanding.

**Steps:**
1. Send "Here is my bank statement" from +27000000002.
2. Attach and send a 3-page PDF bank statement.
3. Bot confirms receipt and extracts income/expense figures.
4. Buyer confirms the extracted figures.
5. Bot notifies buyer that documents are complete and the application is under review.

**Expected results:**
- Bank statement document transitions to `APPROVED`.
- Deal status advances from `BUYER_DOCS_PENDING` to the next pipeline status (e.g. `DOCS_REVIEW`).
- Task in queue `Q_BUYER_DOC_REVIEW` marked `COMPLETED`.
- Ops agent receives an in-app notification.

**Severity:** P1

---

## UAT-004 — Seller submits vehicle photos (partial set)

**ID:** UAT-004  
**Persona:** Seller (Carla Cilliers, +27000000013)  
**Pre-conditions:**
- Deal UAT-2026-003 exists in status `VEHICLE_PHOTOS_PARTIAL`.
- Photo set v_pset_c has 4 of 9 angles uploaded.

**Steps:**
1. Send "I'm sending more photos" from +27000000013.
2. Bot confirms missing angles: REAR, INTERIOR_REAR, ENGINE_BAY, ODOMETER, DAMAGE_1.
3. Send one photo (REAR angle JPEG).
4. Bot confirms the angle received and lists remaining missing angles (4 remaining).

**Expected results:**
- `vehicle_photos` row created with `angle = 'REAR'` and `status = 'UPLOADED'`.
- Bot response lists the 4 remaining angles accurately.
- `vehicle_photo_sets.status` remains `UPLOADED` (not yet complete).
- Photo count via `get_photo_progress` tool returns 5/9.

**Severity:** P1

---

## UAT-005 — Seller completes all 9 photo angles

**ID:** UAT-005  
**Persona:** Seller (Carla Cilliers, +27000000013)  
**Pre-conditions:**
- UAT-004 completed; 5 angles now uploaded (4 original + 1 from UAT-004).
- 4 angles still pending.

**Steps:**
1. Send the remaining 4 photos in sequence (INTERIOR_REAR, ENGINE_BAY, ODOMETER, DAMAGE_1), one at a time.
2. After each, bot confirms receipt and updates the count.
3. After the 9th photo, bot notifies seller that all photos have been received and evaluation will begin.

**Expected results:**
- All 9 `vehicle_photos` rows present with `status = 'APPROVED'` after AI evaluation.
- `vehicle_photo_sets.status` transitions to `APPROVED`.
- `vehicle_quick_evaluations` row created with `condition_band` set and `confidence_score > 0`.
- Deal status advances out of `VEHICLE_PHOTOS_PARTIAL`.
- Seller receives WhatsApp confirmation message.

**Severity:** P1

---

## UAT-006 — Buyer views and accepts finance quote

**ID:** UAT-006  
**Persona:** Buyer (Dineo Dlamini, +27000000004)  
**Pre-conditions:**
- Deal UAT-2026-004 exists in status `QUOTE_SENT`.
- Quote v_quote_d: R175,000 loan, 72 months, R3,850/month instalment.

**Steps:**
1. Send "Can I see my quote?" from +27000000004.
2. Bot presents the full quote summary (loan amount, instalment, term, total cost of credit).
3. Reply "I accept".
4. Bot confirms acceptance and explains next steps (contracts will follow).

**Expected results:**
- `quotes.status` updated to `ACCEPTED`, `accepted_at` set.
- Deal status advances from `QUOTE_SENT` to next status (e.g. `QUOTE_ACCEPTED`).
- Audit event `QUOTE_ACCEPTED` logged.
- Ops agent notified via in-app notification.
- Bot message mentions contract signing next.

**Severity:** P1

---

## UAT-007 — Buyer declines finance quote

**ID:** UAT-007  
**Persona:** Buyer (Dineo Dlamini, +27000000004)  
**Pre-conditions:**
- Deal UAT-2026-004 reset to `QUOTE_SENT` status.
- Quote re-seeded to `SENT` state.

**Steps:**
1. Send "Show me my quote" from +27000000004.
2. Bot presents quote summary.
3. Reply "No, I decline".
4. Bot acknowledges decline, asks for a reason (optional).
5. Send "Monthly instalment is too high".

**Expected results:**
- `quotes.status` updated to `DECLINED`, `declined_at` set, `declined_reason` = "Monthly instalment is too high".
- Deal status updated to reflect declined state.
- Audit event `QUOTE_DECLINED` logged with reason.
- Task created in `Q_FNI_REVIEW` for F&I agent to follow up.
- Bot message sympathetic and explains what happens next.

**Severity:** P2

---

## UAT-008 — Ops agent reviews deal queue in web app

**ID:** UAT-008  
**Persona:** Ops Agent (authenticated web app user)  
**Pre-conditions:**
- UAT environment reseeded.
- Ops agent account exists and has appropriate RLS permissions.
- Web app deployed and accessible on UAT URL.

**Steps:**
1. Log in to the web app as the ops agent.
2. Navigate to the Queue page (`/queue`).
3. Verify that tasks for UAT-2026-002, UAT-2026-003, UAT-2026-004, UAT-2026-005 appear.
4. Click the task for UAT-2026-002 (missing bank statement).
5. Verify the task detail shows correct deal number, buyer name, and description.
6. Mark the task as "In Progress".
7. Navigate to the Deal List page (`/deals`).
8. Filter by status `BUYER_DOCS_PENDING`.
9. Confirm UAT-2026-002 appears.

**Expected results:**
- All 4 task queue items rendered correctly.
- Task status updates persist and are reflected on reload.
- Deal list filter works and returns correct results.
- All page loads complete in under 3 seconds.
- No console errors.

**Severity:** P1

---

## UAT-009 — F&I agent views deal detail and audit log

**ID:** UAT-009  
**Persona:** F&I Agent (authenticated web app user)  
**Pre-conditions:**
- Deal UAT-2026-004 in status `QUOTE_SENT`.
- F&I agent account configured.

**Steps:**
1. Log in as F&I agent.
2. Navigate to Deal Detail for UAT-2026-004.
3. Verify vehicle details: Hyundai i20 2022, VIN UATVIN00000000004, 22,000 km.
4. Verify buyer details: Dineo Dlamini, +27000000004.
5. Verify quote panel shows: R175,000 loan, R3,850/month, 72 months.
6. Navigate to Audit Log tab.
7. Verify `DEAL_CREATED` and `QUOTE_SENT` events present with correct timestamps.

**Expected results:**
- All deal fields rendered accurately.
- Quote panel visible and data matches seed.
- Audit log shows at least 2 events in correct chronological order.
- ExtractionConfidencePanel component renders without error if documents present.

**Severity:** P2

---

## UAT-010 — NATIS collection task progressed by ops

**ID:** UAT-010  
**Persona:** Ops Agent  
**Pre-conditions:**
- Deal UAT-2026-005 in status `NATIS_COLLECTION_PENDING`.
- NATIS fulfilment row exists with status `SUBMITTED`.

**Steps:**
1. Log in as ops agent.
2. Navigate to the Queue page; find task "Collect NATIS — Deal UAT-2026-005".
3. Open task detail. Verify collection address is "DLTC Bellville, 1 Oak Street, Bellville, 7530".
4. Mark task `COMPLETED`.
5. In the database (or via an admin panel), update `natis_fulfilments.status` to `COMPLETE` and set `completed_at`.
6. Verify deal status advances to next stage.

**Expected results:**
- Task status updates to `COMPLETED`.
- `natis_fulfilments.status` = `COMPLETE`, `completed_at` populated.
- Deal status advances from `NATIS_COLLECTION_PENDING`.
- Audit event `NATIS_COMPLETE` created.
- Buyer receives WhatsApp notification (if bot notification is triggered).

**Severity:** P1

---

## UAT-011 — SLA indicator displayed for overdue deal

**ID:** UAT-011  
**Persona:** Ops Agent  
**Pre-conditions:**
- At least one UAT deal has `sla_due_at` in the past. To set this up: manually update `deals.sla_due_at = NOW() - INTERVAL '1 hour'` for deal UAT-2026-002 via psql.

**Steps:**
1. Log in as ops agent.
2. Navigate to the Deal List.
3. Locate deal UAT-2026-002.
4. Inspect the SLA indicator (`SLAIndicator` component) next to the deal.
5. Confirm the indicator shows a red/overdue state.
6. Navigate to the Queue and confirm the corresponding task is highlighted as overdue.

**Expected results:**
- `SLAIndicator` renders red/danger colour for overdue SLA.
- No errors thrown if `sla_due_at` is null for other deals.
- Status badge (`StatusBadge` component) shows `BUYER_DOCS_PENDING` correctly.
- Tooltip or label shows the overdue duration (e.g. "Overdue by 1h").

**Severity:** P2

---

## UAT-012 — Anonymous visitor redirected from /deals to /login

**ID:** UAT-012  
**Persona:** Unauthenticated (anonymous browser session)  
**Pre-conditions:**
- UAT web app deployed.
- No active session cookies / local storage tokens in the browser.
- Supabase RLS policies are active (not bypassed by service role in the web client).

**Steps:**
1. Open a private/incognito browser window.
2. Navigate directly to `<UAT_WEB_URL>/deals`.
3. Observe the browser behaviour.
4. Attempt to navigate directly to `<UAT_WEB_URL>/deals/00000000-0004-0004-0004-000000000004`.
5. Observe the browser behaviour.

**Expected results:**
- Step 3: Browser redirects to `/login` (or equivalent auth page) without rendering any deal data.
- Step 5: Same redirect to `/login`; the deal UUID is NOT exposed in any error message or partial render.
- No deal rows, buyer PII, or vehicle data are returned by the Supabase API for an unauthenticated request (verify via browser DevTools → Network → confirm 401 or empty rows from RLS).
- No JavaScript errors related to undefined auth tokens appear in console that could leak schema structure.

**Severity:** P0 — RLS boundary. Failure here is a security defect and blocks sign-off.

---

*End of test scripts. For defect reporting see `docs/uat/DEFECTS.md`.*
