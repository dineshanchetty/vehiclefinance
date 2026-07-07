# Ari · Demo Handoff

Everything you need to run the Claimtec FinOps demo end-to-end.
Hand this file (or the zip) to Ari and he can drive solo.

---

## 1. The links

| Thing | URL / Number |
|---|---|
| **Dashboard** (Azure Static Web App) | https://orange-bay-0066a4b03.7.azurestaticapps.net |
| **WhatsApp bot** (Dialog360 channel) | **+27 69 699 2346** |
| **Test fixtures zip** | `docs/test-fixtures/ari-demo-fixtures.zip` (1.2 MB · 6 PDFs + 9 photos) |

---

## 2. Dashboard login

Ari signs in at the URL above with:

- **Email:** `ari@hartcon.co.za` *(or whatever address the invite was sent to)*
- **Password:** set by Ari via the Supabase invitation email

If the invite hasn't been sent yet:
1. Supabase Studio → project `vehiclefinance` → Authentication → Users → Add user → **Send invitation**
2. After Ari accepts and signs in once, run this SQL in Supabase Studio:
   ```sql
   INSERT INTO public.profiles (id, email, full_name, role)
   SELECT u.id, u.email, 'Ari', 'admin'
   FROM auth.users u
   WHERE u.email = 'ari@hartcon.co.za'
   ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
   ```

Roles available: `admin` (full access — recommended for demo) or `ops_agent` (operator scope).

---

## 3. Phone setup

Ari demos as the **buyer** from his own phone (`+27 84 809 5085` or whichever WhatsApp).
His profile in the database has been wiped — the next "Hi" from his number lands as a brand-new user.

> **Important:** all the test fixtures have buyer details for **CHETTY DINESHAN · ID 8501125007087**.
> The system has been cleaned so this name no longer appears in any existing record — when the bot extracts those values from the OTP/ID, it creates a fresh buyer with those details. No mismatch flags should fire.

---

## 4. Demo run-through — buyer side (the headline flow)

### Path A · "Yes, I have a signed OTP" *(default demo)*

1. WhatsApp **+27 69 699 2346** → "Hi"
2. Bot greets + POPIA consent → tap **I agree**
3. Bot asks: *"Do you have a signed Offer to Purchase?"* → tap **Yes — I'll upload**
4. Upload `01-otp.pdf` → bot extracts buyer / seller / vehicle / price + reads back for confirmation
5. Upload `02-sa-id.pdf` → ID cross-check passes (ID matches OTP buyer)
6. Upload `03-proof-of-address.pdf` → address cross-check passes
7. Upload `04-bank-statement-feb.pdf`, `05-...mar.pdf`, `06-...apr.pdf` one by one
8. Bot calculates affordability and shows summary to buyer:
   - Avg income · avg expenses · disposable income · safe instalment @ 30%
9. Buyer taps **Submit application** → file lands on dashboard

### Path B · "No, I don't have an OTP yet" *(showcase the manual capture)*

1. Same start: greet → POPIA → fork
2. Tap **No — help me make one**
3. Bot asks for vehicle make / model / year / VIN / reg / mileage / colour / price
4. Then seller: name / phone / ID / banking
5. Bot generates a draft OTP PDF in chat
6. (Demo skip: in a real flow, buyer prints, signs with seller, snaps a photo, sends back)
7. Resume from Path A step 4

---

## 5. Demo run-through — operator side (dashboard)

After the buyer hits **Submit application** in Path A:

1. Open dashboard → log in
2. Pipeline view → click the new **#NEW** deal
3. **Buyer tab** → see all extracted fields, document thumbnails, cross-check ticks
4. **Affordability tab** → see the 3-statement summary; bot has graded it
5. Click **Decline (unaffordable)** *(this is the key demo moment)*
6. Bot fires `find_alternative_vehicles` and sends 3–5 cars.co.za deep-links in the buyer's budget band straight to WhatsApp
7. Switch back to phone → show the alternatives in chat

> **Why decline?** The test bank statements are intentionally calibrated so disposable income (~R4.7k/mo) FAILS affordability for the R 285k vehicle (implied instalment ~R 6k+). This is what exercises the **decline + alternatives recovery** flow, which is the most compelling demo moment.
>
> If you want a passing test instead, you can manually bump the salary credits in the HTML fixtures to ~R 80k/mo and regenerate the PDFs (see fixture README).

---

## 6. Demo run-through — seller side (the seller onboarding flow)

From the dashboard deal page:

1. Click **Seller tab** → tap **Notify seller**
2. The seller (Ari can reuse his own number for the demo, or a second phone) receives the `seller_intro_v1` WhatsApp template
3. Tap **START** in the template
4. Seller goes through POPIA consent + ID upload
5. Send all **9 photos** in `photos/` as **one WhatsApp batch**:
   - `01-front.jpeg` `02-rear.jpeg` `03-driver_side.jpeg` `04-passenger_side.jpeg`
   - `05-interior_front.jpeg` `06-interior_rear.jpeg`
   - `07-engine_bay.jpeg` `08-boot.jpeg` `09-odometer.jpeg`
6. Cloudflare Workers AI auto-classifies each photo into its angle bucket (~5 sec/photo)
7. Dashboard → deal → **Vehicle tab → 360° View** → watch the angles populate in real time

---

## 7. Talk-track callouts (what to point at)

| Moment | Say |
|---|---|
| OTP upload → extracted fields | *"Mindee v2 + Cloudflare Llama Vision. PDF → structured fields in 3–5 sec. No human typing."* |
| ID + POA cross-check ticks | *"Same ID number on OTP, SA ID, and the bank statements. Address dated within 90 days. All in real time."* |
| Affordability summary | *"Three months parsed, salary identified, NCR safe-instalment @ 30%. Buyer sees their own numbers before submitting."* |
| Decline → cars.co.za alternatives | *"This is the recovery flow — instead of losing the buyer, we redirect them to cars they can actually afford on cars.co.za."* |
| 9-photo seller upload → 360° view | *"Single WhatsApp batch. Cloudflare auto-classifies into the 9 standard angles. No prompts, no instructions to the seller."* |
| Per-deal vision cost | *"~0.06 cents on Cloudflare vs ~5 cents on Claude tokens — 80× cheaper for the high-volume photo path."* |

---

## 8. Known limitations / caveats

- **Disbursement button is mocked.** Approve/Decline on the dashboard updates state but doesn't call the real Claimtec payout API yet — that's one of the three asks in the exec deck.
- **E-signature is a stub.** The `send_otp_for_signature` tool in Path B generates the PDF; signature collection is not wired to a real e-sign vendor.
- **Cars.co.za = deep-links only.** The bot composes search URLs into cars.co.za — it doesn't scrape (Cloudflare anti-bot blocks it) and there's no inventory API integration. Buyer taps the link and lands on real cars.co.za listings.
- **CI has been failing since 19 May.** The auto-deploy workflow hasn't fired — what's live on `orange-bay-0066a4b03.7.azurestaticapps.net` is whatever was last manually deployed. If a code change isn't reflecting in the demo, that's why.

---

## 9. If something goes wrong mid-demo

| Symptom | Quick fix |
|---|---|
| WhatsApp bot doesn't reply within 5 sec | Check Supabase Edge Function logs: `supabase functions logs whatsapp-webhook --project-ref sahvfsoclzgsuewbiiah` |
| Dashboard 401 / can't sign in | Confirm the `profiles` row exists for Ari (SQL in §2 above) |
| Document upload "extraction failed" | Mindee may be rate-limited — retry once. Persistent failure → check `extract-document` function logs |
| Photos not classifying | Cloudflare Workers AI may be cold — first photo can take ~10 sec, subsequent are fast |
| Affordability calculation looks wrong | Confirm all 3 PDFs were uploaded; bot only triggers after the 3rd statement lands |

---

## 10. The zip — what's inside

`docs/test-fixtures/ari-demo-fixtures.zip` (1.2 MB · 16 files):

```
01-otp.pdf                    Offer to Purchase — 2018 VW Golf 7 GTI · R 285 000
02-sa-id.pdf                  SA Smart ID — CHETTY, DINESHAN · 8501125007087
03-proof-of-address.pdf       Eskom statement — Sunninghill, Sandton · dated 30 Apr 2026
04-bank-statement-feb.pdf     FNB Cheque · Feb 2026 · salary R 28 500
05-bank-statement-mar.pdf     FNB Cheque · Mar 2026 · incl. R 8 000 vehicle-savings transfer
06-bank-statement-apr.pdf     FNB Cheque · Apr 2026 · closing balance R 19 480
01-front.jpeg                 Vehicle photos — real 2018 VW Golf 7 GTI in Tornado Red
02-rear.jpeg
03-driver_side.jpeg
04-passenger_side.jpeg
05-interior_front.jpeg
06-interior_rear.jpeg
07-engine_bay.jpeg
08-boot.jpeg
09-odometer.jpeg
README.md                     This run-through, embedded for reference
```

---

## 11. Quick reference card *(print this if needed)*

```
DASHBOARD:    https://orange-bay-0066a4b03.7.azurestaticapps.net
WHATSAPP:     +27 69 699 2346
TEST PACK:    docs/test-fixtures/ari-demo-fixtures.zip
HAPPY PATH:   Hi → I agree → Yes upload → 6 PDFs → Submit → Decline → 🚗 alts
SELLER PATH:  Dashboard → Notify seller → START → ID → 9 photos in one batch
KEY MOMENT:   The decline → cars.co.za alternatives recovery flow
```

---

*Last updated: 25 May 2026 · prepared by Claude for Ari's demo*
