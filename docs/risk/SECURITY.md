# Claimtec FinOps — Security Risk Register

_Last reviewed: 2026-05-25_

This document is the security risk audit for the Claimtec FinOps dashboard +
edge function platform. It walks the actual codebase (not a generic template)
and flags concrete risks with severity, exploitability, and mitigation status.

Format per entry: **ID · Title · Severity · Status**

Severity:
- 🔴 **CRITICAL** — immediate exploit possible, customer data at risk
- 🟠 **HIGH** — exploit requires effort or insider position
- 🟡 **MEDIUM** — defence-in-depth gap, no current direct path
- 🟢 **LOW** — best-practice nudge

Status: **Open / Mitigated / Accepted / Tracked**

---

## 1. Authentication & session

### S-1.1 · Supabase auth-state-change wiring · 🟢 Low · Mitigated
**Where:** `packages/web/src/lib/auth.tsx`
**Risk:** A hung `getSession()` or `fetchProfile()` could trap the user on a permanent loading screen.
**Mitigation in place:** Hard 5s timeout on `fetchProfile` + 8s belt-and-braces timeout that force-flips `loading=false`.
**Action:** None — defensive code already in place.

### S-1.2 · Magic-link sole-factor authentication · 🟡 Medium · Accepted
**Where:** `packages/web/src/pages/LoginPage.tsx` — `signInWithOtp`.
**Risk:** Anyone with control of an operator's mailbox can sign in. No MFA.
**Mitigation:** Acceptable for current stage (small ops team, internal-only). Track:
- Add WebAuthn or TOTP enrolment as a hard requirement before opening dashboard to >5 operators.
- Restrict invite domain to `@claimtec.co.za` (currently any email accepted).

### S-1.3 · Service role key as inter-function bearer token · 🟠 High · Mitigated
**Where:** `packages/api/supabase/functions/_shared/tool-handlers.ts:114` — bot calls `extract-document` with `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`.
**Risk:** If the service-role key leaks (e.g. logged accidentally), any caller can talk to any RLS-bypass endpoint.
**Mitigation in place:** `extract-document` is deployed with `--no-verify-jwt`; the bot can call it without auth. The function still reads from storage using the service role _internally_ (via its env var, never exposed to caller). Same pattern for `cars-alternatives`.
**Action:** **Rename the local env var** from `SUPABASE_SERVICE_ROLE_KEY` to `INTERNAL_SERVICE_ROLE` so it can be set/rotated via `supabase secrets set` (the CLI refuses the `SUPABASE_` prefix, forcing dashboard-only updates).

### S-1.4 · `profiles` table self-insert protection · 🟢 Low · Mitigated
**Where:** `packages/api/supabase/migrations/20260417000000_auth_rls.sql`.
**Risk:** A newly-invited user could insert their own `profiles` row with role=admin if no row-level policy enforces this.
**Mitigation:** Reviewed — `profiles` writes are gated to `service_role` only. Operators land in "pending approval" until ops manually runs the role-grant SQL (per `docs/ari-demo-handoff.md`).

---

## 2. Authorisation & RLS

### S-2.1 · RLS enabled on all 23 tables · 🟢 Low · Mitigated
Every customer-data table (deals, buyers, sellers, vehicles, documents, extractions, photos, quotes, inspections, contracts, signatures, NATIS, tasks, audit) has `ENABLE ROW LEVEL SECURITY` + at least one `ops_agent_read` policy and one `service_role_all` policy. 76 policies total.

### S-2.2 · `audit_events` is immutable (correct posture) · 🟢 Low · Mitigated
**Where:** Trigger `prevent_audit_event_modification()` raises P0001 on any UPDATE/DELETE.
**Risk:** Compliance-grade audit trail. Cannot be tampered with via dashboard or scripts.
**Action:** None.

### S-2.3 · Storage bucket policies not yet audited · 🟡 Medium · Open
**Where:** Supabase storage — `documents` bucket (OTPs, IDs, POAs, bank statements).
**Risk:** Unknown whether bucket is set to private + RLS-policied, or public.
**Action:** Run `select * from storage.buckets; select * from storage.policies;` and document. If public, restrict.

### S-2.4 · `extract-document` accepts arbitrary `document_id` UUIDs without auth · 🟠 High · Mitigated
**Where:** `packages/api/supabase/functions/extract-document/index.ts` deployed with `--no-verify-jwt`.
**Risk:** Anyone with a valid document_id can trigger an extraction (and burn Mindee credit).
**Mitigation:** Document IDs are UUIDv4 — not enumerable. To exploit, an attacker would need to either (a) compromise the dashboard session (so they could read deal IDs from queries.ts), or (b) intercept a webhook payload.
**Action:** Add request-rate limiting per IP at the Supabase platform layer (or add a lightweight shared-secret header).

### S-2.5 · `ops-api` CORS allows any `.azurestaticapps.net` origin · 🟡 Medium · Tracked
**Where:** `packages/api/supabase/functions/ops-api/index.ts`.
**Risk:** Any deployed Static Web App can call our ops-api endpoints (read-only by RLS but still a wider surface).
**Action:** Pin allow-list to specific subdomains once we know the production SWA name.

---

## 3. Input validation & injection

### S-3.1 · SQL injection · 🟢 Low · Mitigated
All DB access goes through Supabase JS / postgrest, which uses parameterised queries. No `supabase.rpc('exec', { sql: rawString })` calls in the codebase.

### S-3.2 · XSS in dashboard · 🟢 Low · Mitigated
React renders all user content as text by default. No `dangerouslySetInnerHTML` calls found in `packages/web/src`. Confirmed via grep.

### S-3.3 · `runTaskAction` builds buyer-facing WhatsApp message from operator-typed reason · 🟡 Medium · Tracked
**Where:** `packages/web/src/lib/runTaskAction.ts:34`.
**Risk:** Operator reason text is concatenated into the buyer WhatsApp body and the audit log. A malicious operator (or social engineering target) could push misleading content downstream.
**Mitigation:** WhatsApp templates are pre-approved by Meta; free-form reasons go in `{{reason}}` placeholders only.
**Action:** Add length cap (e.g. 500 chars) on the reason field client-side + server-side.

### S-3.4 · SA ID validation present but not enforced at API layer · 🟡 Medium · Open
**Where:** Buyer / seller `id_number` columns accept any 13-digit string. The Luhn checksum is computed during extraction cross-check but not enforced as a column constraint.
**Risk:** Malformed IDs can be saved if extraction is bypassed (e.g. manual capture path).
**Action:** Add a DB trigger `CHECK (id_number IS NULL OR sa_id_luhn_valid(id_number))` on buyers + sellers.

---

## 4. Secret handling

### S-4.1 · No secrets committed to git · 🟢 Low · Mitigated
Verified: `git log --all -p | grep -E "MINDEE_API_KEY=md_|sk-ant-"` returns nothing. `.env`, `.env.local`, `.env.production` are all in `.gitignore`.

### S-4.2 · Service role key in `packages/bot/.env` (local-only) · 🟢 Low · Mitigated
Used only for local dev. Gitignored. Rotation playbook should include this file.

### S-4.3 · Cloudflare API token has unknown scope · 🟡 Medium · Open
**Where:** `CLOUDFLARE_API_TOKEN` Supabase secret.
**Risk:** If the token is account-wide rather than scoped to Workers AI inference only, a compromise grants broad Cloudflare access.
**Action:** Verify in Cloudflare dashboard the token only has `Account:AI Read/Run` permissions and nothing else.

### S-4.4 · Mindee API key rotation procedure not documented · 🟡 Medium · Open
**Risk:** When the Mindee subscription expired earlier today, there was no documented playbook — required ad-hoc Supabase Studio updates.
**Action:** Add a `docs/runbooks/secret-rotation.md` with the rotation steps for each: Mindee, Cloudflare, Anthropic, Dialog360, Supabase service role.

---

## 5. Frontend security

### S-5.1 · `vehiclefinance-auth` localStorage key (Supabase default) · 🟢 Low · Accepted
Standard Supabase JS client behaviour. Token visible in `localStorage` is intentional for refresh handling. Risk if user's machine is compromised — same risk as cookie-based session.

### S-5.2 · No CSP header configured on Azure SWA · 🟡 Medium · Open
**Where:** Static Web App has no `staticwebapp.config.json` global headers section.
**Action:** Add a strict CSP: `default-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' data: https://*.supabase.co`.

### S-5.3 · `import.meta.env.VITE_*` values are inlined into bundled JS · 🟢 Low · Accepted
All `VITE_*` env vars end up in the client bundle. The codebase only exposes URL-shaped + anon key vars (`VITE_SUPABASE_URL`, `VITE_BOT_API_URL`). No secrets in this list — verified.

---

## 6. Webhook & inter-service

### S-6.1 · `dialog360-webhook` accepts unauthenticated POSTs · 🟠 High · Mitigated
**Where:** Deployed with `--no-verify-jwt` (required — Dialog360 doesn't sign payloads with a JWT).
**Mitigation in place:** The function verifies the webhook secret (`DIALOG360_WEBHOOK_VERIFY_TOKEN`) before processing.
**Action:** Confirm the verify-token check is bypassed nowhere in the codebase.

### S-6.2 · `mindee-webhook` similarly unauthenticated · 🟠 High · Mitigated
**Where:** Mindee webhook callback for async extraction results.
**Mitigation:** Verifies HMAC signature from Mindee.

### S-6.3 · No request-rate limit on any edge function · 🟡 Medium · Open
**Risk:** A misbehaving (or malicious) client could spam extract-document, exhausting Mindee credit (₂1k jobs/mo on current plan).
**Action:** Configure Supabase edge function rate limits in the dashboard (1k req/min default is too high for production).

---

## 7. Dependency security

### S-7.1 · pnpm-lock.yaml + frozen-lockfile CI guard · 🟢 Low · Mitigated
All dependency versions pinned. CI uses `--frozen-lockfile`.

### S-7.2 · No `pnpm audit` in CI · 🟡 Medium · Open
**Action:** Add `pnpm audit --prod --audit-level=high` to CI pipeline. Fail on new high/critical advisories.

### S-7.3 · React Router v6 — flagged future-breaking changes · 🟢 Low · Tracked
Two warnings logged: `v7_startTransition` and `v7_relativeSplatPath`. Upgrade path is straightforward but not urgent.

---

## 8. POPIA / GDPR-style data subject rights

### S-8.1 · "Right to be forgotten" workflow exists · 🟢 Low · Mitigated
Verified during demo prep: full row-cascade delete works (see `Ari profile reset` history). Doesn't violate the immutable audit_events trigger — those rows remain but reference deleted FKs.

### S-8.2 · No data export / portability endpoint · 🟡 Medium · Open
**Action:** Add `GET /api/ops/data-export?buyer_id=<uuid>` that returns the buyer's complete record as JSON. Currently would have to be done by ops via SQL.

### S-8.3 · No data retention policy enforced · 🟡 Medium · Open
**Action:** Define + enforce retention for declined deals (e.g. 7 years for NCA compliance). Add a scheduled function to anonymise rows after that window.

---

## 9. Operational security

### S-9.1 · No 2FA on Supabase project · 🟠 High · Open
**Risk:** Anyone with the Supabase login can dump the entire DB.
**Action:** Enable Supabase team 2FA. Move project ownership to a team account.

### S-9.2 · No alerting on auth failures · 🟡 Medium · Open
**Action:** Subscribe Supabase auth logs to a webhook → Slack alert when >5 failed logins / minute from a single IP.

### S-9.3 · Edge function logs aren't shipped anywhere · 🟡 Medium · Open
Logs only visible in Supabase dashboard, kept for 24h.
**Action:** Forward to a SIEM (Datadog / Logflare / Better Stack).

---

## Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 0 |
| 🟠 High | 5 (3 mitigated, 2 open) |
| 🟡 Medium | 12 (3 mitigated, 9 open) |
| 🟢 Low | 11 |

**Recommended next 5 actions, in order:**
1. Add `staticwebapp.config.json` with strict CSP (S-5.2)
2. Set up Supabase 2FA + team account (S-9.1)
3. Audit storage bucket policies (S-2.3)
4. Document secret rotation runbook (S-4.4)
5. Add edge-function rate limits (S-6.3)
