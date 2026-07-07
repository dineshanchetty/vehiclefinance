# Roadmap — Decline Upsell + Can't-Contact Reactivation

**Status:** Planning · drafted after the bank demo
**Product:** Claimtec FinOps
**Author:** Dineshan Chetty

This roadmap covers the two new workstreams the bank asked for after the demo:

- **A · Affordability-decline upsell** — turn "declined for affordability" into
  "here's the vehicle you *do* qualify for," as a tracked, reportable product.
- **B · Can't-contact reactivation** — re-establish contact with the bank's book
  of applications declined for `unable to contact`, refresh their details, and
  push the willing ones back into the funnel.

Confirmed scoping decisions (from planning session):

| Decision | Choice |
|---|---|
| Upsell type | **Cheaper vehicle** — extend the existing cars.co.za alternatives flow |
| Declined-book handover | **API / system integration** with the bank's origination system |
| Consent basis | **Existing consent covers re-contact** (bank to confirm in writing — see gates) |
| Deliverable now | This roadmap |

---

## The one thing that reshapes the product

Both workstreams flip Claimtec FinOps from **inbound** (customer messages first)
to **outbound** (we message first). That is a compliance gate, not a tech gate:

1. **Meta / WhatsApp** — any business-initiated message needs a pre-approved
   *template*. We already ship one (`seller_intro_v1`); we'll need 2–3 more.
   Approval lead time is typically 1–3 business days, occasionally longer.
2. **POPIA** — re-contacting a declined customer to sell them something needs a
   lawful basis. The bank says existing application consent covers it; we need
   that **in writing** before a single outbound message goes out (Gate G1).

The engineering below is mostly reuse of what already works. The critical path
is the three external dependencies (bank API spec, template approval, consent
letter), not the code.

---

## Workstream A — Affordability-Decline Upsell

**Reuses:** `find_alternative_vehicles` tool, `cars-alternatives` edge function,
the affordability calculation, the deals pipeline + dashboard.

Today the bot already fires cars.co.za deep-links when affordability fails. The
gap is that it's a courtesy, not a product: no "you qualify for R X" framing, no
tracking, no re-entry loop, no reporting back to the bank.

### A1 · Affordable-band calculation  — *S*
Turn the affordability output into a concrete **max-qualifying vehicle price**.
- Inputs already computed: disposable income, safe instalment @ 30% (NCR).
- Work backwards: safe instalment → max loan (at the bank's rate + term) → max
  vehicle price given the buyer's deposit.
- Emit a single number the buyer understands: *"You pre-qualify for up to
  **R 182,000**."*
- **Acceptance:** given the 3-statement fixtures, the bot states a correct
  affordable ceiling instead of a bare decline.

### A2 · Reframe the decline as a pre-qualified offer  — *S*
- Replace the "sorry, declined" message with: pre-qualified amount + cars.co.za
  links **filtered to the affordable band** (the `max_price` we now compute).
- Warm, opportunity-framed copy — not a rejection.
- **Acceptance:** declined buyer receives "You pre-qualify for R X · here are
  cars in your range" with band-correct links.

### A3 · Re-entry loop  — *M*
- Buyer taps a link, agrees a cheaper car with a seller, comes back with a new
  OTP → bot re-runs the full flow against the cheaper vehicle.
- Link the new attempt to the original deal (an `upsell_parent_deal_id`) so the
  conversion is attributable.
- **Acceptance:** a declined deal can spawn a linked, affordable re-application
  that reaches "submitted."

### A4 · Upsell tracking + dashboard + bank reporting  — *M*
- New dashboard view: **Upsell Pipeline** — declined-affordability deals, the
  band each qualifies for, and re-entry status (offered / clicked / re-applied /
  funded).
- Conversion metrics: offer→click, click→re-apply, re-apply→fund.
- Reporting export back to the bank (the recovered-revenue story).
- **Acceptance:** dashboard shows the upsell funnel; a monthly export produces
  per-deal upsell outcomes.

**Workstream A total: ~S+S+M+M ≈ 2–3 weeks**, no external blockers (uses the
bank's existing rate/term matrix, which we already need for quoting).

---

## Workstream B — Can't-Contact Reactivation

**Reuses:** `sendTemplate` (dialog360), the buyer onboarding flow, POPIA-consent
capture, `conversation_messages`, the deals pipeline. **New:** an inbound API
integration + an outbound campaign engine.

### B0 · Compliance gates (BLOCKERS — start immediately, run in parallel)
- **G1 · Consent letter** — written confirmation from the bank's legal that
  original application consent covers re-contact about alternatives. *Blocks all
  outbound.*
- **G2 · WhatsApp templates** — draft + submit 2–3 templates for Meta approval:
  a reactivation opener, a contact-detail-confirm, and an opt-out acknowledgement.
- **G3 · Data Processing Agreement** — the declined book is bulk real PII; the
  DPA + data-flow needs sign-off before ingest. (Our risk register already
  covers vendor DPAs; this extends it to the bank as data controller.)

### B1 · Bank API integration  — *L*
- Contract with the bank's origination system: auth, endpoint, field mapping
  (name, ID, old phone, old email, decline date, decline reason, original vehicle
  + amount), pull cadence (scheduled batch vs webhook).
- Ingest into a new `reactivation_leads` table, de-duped against existing buyers.
- **Depends on:** the bank providing their API spec (external blocker).
- **Acceptance:** a scheduled pull lands N declined-uncontactable leads, cleanly
  mapped, idempotent on re-run.

### B2 · Outbound campaign engine  — *M*
- Throttled template send across the lead book (respect Meta rate tiers), with
  per-lead state (queued / sent / delivered / replied / opted-out / stale).
- **STOP / opt-out handling** — mandatory. One inbound "STOP" suppresses the
  lead permanently and logs the POPIA event.
- **Depends on:** G1 + G2.
- **Acceptance:** campaign sends to a test cohort, tracks delivery + reply,
  honours opt-out, and every send is audit-logged with its consent basis.

### B3 · Contact-detail refresh flow  — *M*
- On reply, the bot confirms/updates phone, email, physical address; validates
  (SA phone format, POA-fresh address).
- Writes the refreshed record back — to the bank via API (B1 in reverse) and/or
  a report.
- **Acceptance:** a lead who replies has verified, updated contact details
  captured and pushed back.

### B4 · Re-application handoff  — *S* (mostly reuse)
- If the reactivated lead wants to proceed, drop them into the **existing** buyer
  onboarding flow (OTP → KYC → affordability). This is where Workstream A and B
  converge: a reactivated lead who's now affordable is the whole point.
- **Acceptance:** a reactivated lead can flow into a fresh application without
  re-keying what we already know.

### B5 · Reactivation reporting  — *S*
- Funnel: leads ingested → contacted → replied → details-updated → re-applied →
  funded. This is the number the bank will judge the whole engagement on.
- **Acceptance:** dashboard + export show the reactivation funnel per campaign.

**Workstream B total: ~L+M+M+S+S ≈ 4–6 weeks of build**, but **gated** by G1/G2/G3
and the bank's API spec. Real elapsed time depends on those, not on us.

---

## Critical path & sequencing

```
Week 0 ──► Kick off the 4 external dependencies IMMEDIATELY (they have lead time):
            G1 consent letter · G2 template submissions · G3 DPA · bank API spec

While those are in flight, build what has NO external blocker:
  Workstream A (A1→A4)  ── ships standalone value, demoable, no bank dependency
  B-table schema + campaign engine skeleton (B2 minus live send)

As dependencies clear:
  API spec  ► B1 ingest
  G1 + G2   ► B2 live outbound
  Then       B3 → B4 (converges with A) → B5
```

**Recommended order:** ship **Workstream A first** — it's unblocked, it's a
natural extension of the demo, and it proves the "recovered revenue" thesis on
inbound traffic before we take on the outbound compliance surface of B.

---

## Open questions for the bank

1. **Rate + term matrix** — the exact rates/terms per risk band, so A1's
   affordable-ceiling maths is real (not assumed).
2. **API spec** — origination-system endpoint, auth, fields, cadence for the
   declined book (B1 blocker).
3. **Consent scope in writing** — does application consent cover re-contact about
   alternative products? (G1 blocker.)
4. **Book size + refresh cadence** — how many declined-uncontactable records, and
   how often does it grow? (Sizes the Meta rate tier + infra.)
5. **Write-back** — do refreshed contact details + re-applications go back via the
   same API, a file, or a dashboard the bank's team works?
6. **Success definition** — is the bank measuring on updated-details, re-applications,
   or funded deals? (Determines what B5 optimises for.)

---

## What already exists that we're building on

| Capability | Where | Reused by |
|---|---|---|
| cars.co.za alternatives | `cars-alternatives` edge fn, `find_alternative_vehicles` tool | A2, A3 |
| Affordability calc | extract/statement analysis + system prompt | A1 |
| Outbound templates | `sendTemplate` (dialog360), `seller_intro_v1` | B2 |
| POPIA consent capture | buyer onboarding flow | B2, B3 |
| Buyer onboarding (OTP→KYC→afford) | system prompts + tool handlers | A3, B4 |
| Deals pipeline + dashboard | `packages/web` | A4, B5 |
| Audit trail | `audit_events` (immutable) | G1/G3 compliance evidence |

The bank-agnostic rebrand we just shipped matters here: this is now positioned as
**a Claimtec product the bank uses**, not a WesBank feature — which is exactly the
framing these two workstreams need.
