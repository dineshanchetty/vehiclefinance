# Test Fixtures — Claimtec FinOps end-to-end run-through

Sample documents + vehicle photos for testing the full WhatsApp + dashboard flow
against the deployed Supabase Edge Functions and Azure Static Web App.

All documents are marked `SAMPLE` so they can't be mistaken for the real thing.
Account holder is `CHETTY, DINESHAN` (test user) with ID `8501125007087` —
matching values across the OTP, ID card, POA, and bank statements so the bot's
cross-check (`verify_document_against_buyer`) approves the chain.

---

## What's included

```
docs/test-fixtures/
├── html/                      ← editable source
│   ├── 01-otp.html             — Offer To Purchase
│   ├── 02-sa-id.html           — SA Smart ID (credit-card layout)
│   ├── 03-proof-of-address.html — Eskom utility statement (≤30 days old)
│   ├── 04-bank-statement-feb.html
│   ├── 05-bank-statement-mar.html
│   └── 06-bank-statement-apr.html
├── pdf/                       ← upload these to the bot via WhatsApp
│   ├── 01-otp.pdf
│   ├── 02-sa-id.pdf
│   ├── 03-proof-of-address.pdf
│   ├── 04-bank-statement-feb.pdf
│   ├── 05-bank-statement-mar.pdf
│   └── 06-bank-statement-apr.pdf
└── photos/                    ← send these in WhatsApp as the seller
    ├── 01-front.jpeg
    ├── 02-rear.jpeg
    ├── 03-driver_side.jpeg
    ├── 04-passenger_side.jpeg
    ├── 05-interior_front.jpeg
    ├── 06-interior_rear.jpeg
    ├── 07-engine_bay.jpeg
    ├── 08-boot.jpeg
    └── 09-odometer.jpeg
```

---

## What's in each document

### `01-otp.pdf` — Offer To Purchase
- Buyer: **CHETTY DINESHAN** · ID **8501125007087** · +27 82 438 4464
- Seller: **Thabo Sipho Nkosi** · ID **7806155123089** · +27 83 456 7890
- Vehicle: **2018 Volkswagen Golf 7 GTI** · VIN `WVWZZZAUZJW123456` · Reg `KK 12 LL GP` · Tornado Red · 95 000 km
- Price: **R 285 000** · Deposit R 25k · Balance to finance **R 260 000**
- Signed at: Sandton / Johannesburg, 12 May 2026

### `02-sa-id.pdf` — SA Smart ID
- Same identity as the OTP buyer. Designed to pass the bot's
  `id_number must equal buyer_id_number from OTP` cross-check.

### `03-proof-of-address.pdf` — Eskom utility statement
- Account holder: **CHETTY, DINESHAN**
- Address: **919 Unit 18 Airdlin Place, Sunninghill, Sandton, 2161**
- Document date: **30 April 2026** (< 90 days old at any test run within Q2 2026)

### `04 / 05 / 06 — Bank statements`
- **FNB Cheque (Personal)** — Account 622 410 0019 8, branch 250 655
- **CHETTY, DINESHAN** as account holder
- 3 consecutive months: Feb / Mar / Apr 2026
- Salary credits from `CLAIMTEC PTY LTD` (~R 28 500/mo)
- Realistic expense pattern: rent, medical aid, fuel, groceries, subscriptions
- Across 3 months: avg income ≈ **R 32 333** · avg expenses ≈ **R 27 586** · disposable ≈ **R 4 747/mo**
- Safe-instalment @ 30% ≈ **R 1 400/mo**
- **Expected outcome:** affordability assessment FAILS for the R 285k vehicle
  (implied monthly instalment ~R 6 000+) — perfect for testing the decline
  path + cars.co.za alternatives suggestion flow.

### `photos/` — 9 vehicle angles
Real photos from a 2018 VW Golf 7 GTI used in a prior test session. Filenames
match the bot's lowercase angle keys; the Claude Vision / Cloudflare Workers AI
classifier will auto-classify each into the matching bucket on upload.

---

## Recommended run-through

### Buyer side (your phone, "I have a signed OTP" path)
1. WhatsApp the bot → "Hi"
2. Tap **I agree** on POPIA
3. Tap **Yes — I'll upload** when asked "Do you have a signed Offer to Purchase?"
4. Upload `01-otp.pdf` → bot extracts buyer / seller / vehicle / price
5. Confirm the read-back
6. Upload `02-sa-id.pdf` → ID cross-check passes (id_number matches OTP)
7. Upload `03-proof-of-address.pdf` → address cross-check passes
8. Upload `04-bank-statement-feb.pdf`, `05-...mar.pdf`, `06-...apr.pdf` one by one
9. Affordability summary shown → tap **Submit application**
10. From the dashboard (Affordability tab → **Decline (unaffordable)**), the bot
    will send the alternatives via `find_alternative_vehicles` — 3-5 cars.co.za
    deep-links in the same price band.

### Buyer side (manual capture, "I don't have an OTP yet" path)
1. Same POPIA + Yes/No fork
2. Tap **No — help me make one**
3. Provide vehicle make/model/year/reg, VIN/mileage/colour, price
4. Provide seller name/phone/ID, banking
5. Bot generates a draft OTP PDF
6. Print, sign with seller, snap a photo, send back
7. Resume the upload flow above (ID → POA → BS)

### Seller side
1. From dashboard → deal page → Seller tab → **Notify seller**
2. The seller (your phone, if you reused it) receives the seller_intro template
3. Tap **START**
4. Bot asks for POPIA consent, then ID
5. Upload `02-sa-id.pdf` (same one — id_number 7806… will mismatch unless you
   swap the seller row's id_number to match, or generate a seller-side ID)
6. Send the 9 photos in `photos/` as a single WhatsApp batch
   — Cloudflare Workers AI auto-classifies each into one of the 9 angles
   — Dashboard Vehicle → 360° View shows them populating in realtime

---

## Regenerating the PDFs

If you edit any of the HTML files:

```bash
cd docs/test-fixtures/html
for f in *.html; do
  soffice --headless --convert-to pdf --outdir ../pdf "$f"
done
```

(Requires LibreOffice installed and `soffice` on PATH.)

---

## Notes

- These are **synthetic** test documents. None are real Eskom / FNB statements.
- The buyer details (CHETTY DINESHAN, 8501125007087) are the real test user;
  everything else is fictional.
- The intentional affordability FAIL is what makes this useful — it exercises
  the decline + alternative-vehicles path. If you want a passing test, just
  bump the salary credits in the bank statements to ~R 80 000/mo.
