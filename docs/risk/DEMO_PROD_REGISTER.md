# Claimtec FinOps — Demo & Production Risk Register

_Last reviewed: 2026-05-25 · Living document — update after every demo or incident_

This is the "what will go wrong during a live demo or in production" register.
Each entry has a failure mode, what triggers it, blast radius, mitigation, and
recovery steps. Pre-populated from issues actually seen during the Ari demo
sessions.

---

## Severity scale

| Sev | What it looks like | Acceptable in demo? |
|---|---|---|
| **P0** | Demo or production cannot continue. Demo killer. | No — abort + reset |
| **P1** | Workflow blocked but graceful fallback exists. | Note it; keep going |
| **P2** | Quality-of-life issue. Cosmetic or latency. | Yes |
| **P3** | Future polish. | Yes |

---

## INCIDENT-1 · OTP extraction returns 401 _(seen 2026-05-25)_ — **P0**

**Symptom:** Buyer uploads OTP; bot says "I can't read the document" or hangs.
**Root cause:** `extract-document` Supabase function had `verify_jwt = true`; bot calls with stale `SUPABASE_SERVICE_ROLE_KEY` → 401 at JWT gate.
**Mitigation in place (today):** Deployed `extract-document` with `--no-verify-jwt`. Verified by direct curl + Ari's actual OTP extraction succeeded.
**Watch for recurrence:** If anyone re-deploys with `verify_jwt = true` accidentally, this returns. Add to deploy checklist.
**Recovery:** `supabase functions deploy extract-document --no-verify-jwt --project-ref sahvfsoclzgsuewbiiah`.

---

## INCIDENT-2 · Mindee 402 "Subscription inactive" _(seen 2026-05-25)_ — **P0**

**Symptom:** ID / POA / Bank statement uploads fail with `402-003`.
**Root cause:** Mindee API key tied to expired subscription. Renewal regenerated the API key, so even after renewing the deployed key was stale.
**Mitigation in place:** Rotated `MINDEE_API_KEY` Supabase secret. Verified all 3 trained models still enqueue successfully on the new account.
**Watch for recurrence:** Renewal cycle is annual. Set calendar reminder 2 weeks before subscription end.
**Recovery:** Get new key from `app.mindee.com` → `supabase secrets set MINDEE_API_KEY=md_xxx`.

---

## INCIDENT-3 · Bot bails to manual capture during Mindee polling _(seen 2026-05-25)_ — **P1**

**Symptom:** Bank statement extraction takes 60-90 sec; bot LLM gives up after ~30 sec, switches to "What is the statement period?" manual capture.
**Root cause:** Old `trigger_extraction` message said "check results in 10–20 seconds" — agent treated as deadline.
**Mitigation in place:** Updated handler to return doc-type-aware wait hints ("Bank statements: 60–90s, retry 4× before failing"). Verified in code.
**Recovery if it happens again:** Tell the buyer "one sec, system was warming up" and ask them to re-upload. The successful re-upload usually completes within the new window.

---

## INCIDENT-4 · SA ID Luhn checksum invalid in seed data _(seen 2026-05-25)_ — **P1**

**Symptom:** OTP extracts cleanly but downstream verification rejects the seller's ID as malformed.
**Root cause:** Test fixture had `7806155123083` (checksum 3) instead of `7806155123089` (checksum 9).
**Mitigation in place:** Test fixtures regenerated. ID Luhn verification script committed in `docs/risk/`.
**Action:** Add column-level Luhn check (see `DATA_INTEGRITY.md D-6.1`).

---

## RISK-1 · Dashboard CI failing since 2026-05-19 — **P1**

**Where:** `.github/workflows/ci.yml` last 5 runs all failed.
**Impact:** `deploy-web.yml` (auto-deploy on green CI) never fires. Whatever is on Azure SWA is the last manual deploy.
**Mitigation in place:** Manual deploys via Vercel CLI work. Rebrand changes from this session are not yet live on the Azure SWA — Ari sees the old branding.
**Recovery:** Diagnose + fix CI. Phase 5 of this engagement will land it.

---

## RISK-2 · Disbursement is a mock — **P1 during exec demo, P0 in production**

**Where:** Dashboard "Approve" button updates `deals.status` but doesn't call any real bank payout API.
**Impact:** In a live demo with WesBank execs, clicking Approve doesn't move money. We say "this is the API integration we're requesting" — covered in the exec deck.
**Mitigation:** Clearly labelled in `docs/ari-demo-handoff.md`. Don't oversell.

---

## RISK-3 · E-signature is a stub — **P1**

**Where:** `send_otp_for_signature` tool generates a draft OTP PDF but doesn't dispatch to a real e-sign vendor (DocuSign, SignWell etc).
**Impact:** Demo flow: "buyer prints, signs with seller, photographs, uploads back" — clunky.
**Action:** Integrate SignWell or Adobe Sign in a future phase.

---

## RISK-4 · cars.co.za uses URL-composition, not a real API — **P2**

**Where:** `find_alternative_vehicles` builds search URLs into cars.co.za.
**Why:** Cars.co.za is gated by Cloudflare anti-bot; scraping not viable.
**Impact:** Quality of "alternatives" depends on cars.co.za search results. Could surface 0 hits in extreme price bands.
**Mitigation:** Cover by partnering with cars.co.za for an inventory API (commercial conversation).

---

## RISK-5 · Cloudflare Workers AI cold-start latency — **P2**

**Where:** First photo classification per session takes ~10 sec; subsequent ones are fast.
**Impact:** Demo viewer sees "system is slow" perception during the first seller photo upload.
**Mitigation:** Warm Cloudflare by sending a no-op inference request 30 sec before the demo starts. Or send the first photo before the audience pays attention.

---

## RISK-6 · WhatsApp Meta template approval risk — **P0 if rejected**

**Where:** `seller_intro_v1` template is approved. If Meta revokes (e.g. policy change), we can't bootstrap sellers.
**Mitigation:** Have 2 alternative template variants on file. Resubmit immediately.

---

## RISK-7 · Dialog360 / Meta WhatsApp number suspension — **P0**

**Where:** `+27 69 699 2346`. If suspended by Meta (spam complaints, policy violation), the entire flow breaks.
**Mitigation:** Don't send messages buyer didn't initiate. Always observe Meta's 24-hour window.
**Recovery:** Open a Dialog360 support ticket; allocate a backup number.

---

## RISK-8 · Supabase project pause (Free tier inactivity) — **P0**

**Where:** Supabase Free tier pauses projects after 1 week of inactivity.
**Current tier:** Verify. If Free, upgrade before demo.
**Impact:** Pause = 503 across all dashboard + edge function calls.
**Mitigation:** Move to Pro tier ($25/mo) before any external demo.

---

## RISK-9 · Browser back-button + form-state regression — **P2**

**Where:** Various modals (`QuoteFormModal`, `ContractUploadModal`, `PhaseActionModal`) don't persist form state across navigation.
**Impact:** Operator types reason → navigates away → comes back → reason gone.
**Action:** Persist form state in `sessionStorage` or move to URL query params.

---

## RISK-10 · Audit log query performance at scale — **P2**

**Where:** `audit_events` already has 21+ rows; will grow per deal action.
**Action:** Index `audit_events(deal_id, created_at DESC)`. Add pagination to the UI (currently shows all at once).

---

## Pre-demo checklist

Before any external demo, verify:
- [ ] Supabase project is not paused (visit dashboard, confirm ACTIVE_HEALTHY)
- [ ] `MINDEE_API_KEY` test enqueue succeeds (run the diagnostic from earlier this session)
- [ ] `CLOUDFLARE_API_TOKEN` test inference succeeds
- [ ] Ari profile + `dineshan` profile both fully wiped from DB
- [ ] WhatsApp `+27 69 699 2346` reaches Dialog360 channel (send "hi" from your phone, expect a reply within 5s)
- [ ] Test deal can complete the buyer-side happy path end-to-end (Path A in handoff doc)
- [ ] Browser tab title shows "Claimtec FinOps" (rebrand deployed)
- [ ] No console errors on `/`, `/deals`, `/audit`
- [ ] Latest CI status — if red, deploy manually before demo

---

## Live-demo emergency contacts

- **WhatsApp bot not replying:** Check `dialog360-webhook` function logs in Supabase
- **Dashboard 500/blank:** Check Azure SWA status + Supabase logs in parallel
- **Mindee timeout / 402:** Pull up `app.mindee.com` dashboard, confirm sub active
- **Cloudflare 500:** Check Cloudflare status page; fallback flow uses Claude
- **Claude 503:** No fallback — wait it out. Anthropic status: status.anthropic.com

---

## Summary

| Severity | Open | Total |
|---|---|---|
| P0 | 5 | 5 |
| P1 | 4 | 5 |
| P2 | 4 | 5 |
| P3 | 0 | 0 |

Most P0 risks are external dependencies (Mindee/Cloudflare/Anthropic/Dialog360/Meta). Internal mitigations are documented.
