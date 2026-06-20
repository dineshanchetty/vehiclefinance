# Claimtec FinOps — Dependency & Cost Risk Register

_Last reviewed: 2026-05-25_

Every external dependency with: current tier, monthly cost, rate limits, what
happens at exhaustion, and the escape hatch. Numbers reflect 2026 pricing.

---

## 1. Anthropic (Claude)

| Field | Value |
|---|---|
| **Service** | Claude API — Opus 4.5 (OTP extraction), Sonnet 4.5 (doc classification), Opus for agent loop |
| **Models in use** | `claude-opus-4-5`, `claude-sonnet-4-5` |
| **Tier** | Pay-as-you-go; no committed spend |
| **Per-deal cost (est.)** | OTP extract ~$0.04, doc classify ~$0.01, agent loop ~$0.05 → **~$0.10/deal** |
| **Monthly projection @ 100 deals** | ~$10 |
| **Monthly projection @ 1000 deals** | ~$100 |
| **Rate limit (default)** | 4000 RPM / 400k input TPM / 80k output TPM |

**Risks:**
- **Outage:** No fallback for OTP extraction. PDF OTP → Claude only (Cloudflare Llama Vision rejects PDFs).
- **Rate limit hit:** Tier auto-bumps with usage history. New account starts at lower limits.
- **Model deprecation:** Opus 4.5 → 4.6 → 4.7 cycle ~quarterly. Need to test before pinning to the newer.
- **Price increase:** Anthropic prices have only gone down historically; risk low.

**Escape hatches:**
1. PDF OCR fallback path: convert PDF → image via `pdf2pic` server-side → route to Cloudflare Llama Vision (free path).
2. Mindee custom-train an "OTP" model in addition to ID/POA/BS.

**Action:** Monitor monthly Anthropic bill. Add alert at $200/mo (= ~2k deals).

---

## 2. Cloudflare Workers AI

| Field | Value |
|---|---|
| **Service** | Llama 3.2 11B Vision Instruct — image-OTP + photo angle classification |
| **Account** | `19ed743fa154f7cb4cd19f9f9151ba18` |
| **Tier** | Free for first 10k inference requests/day; then $0.011 per 1k requests |
| **Per-deal cost** | 9 photos × $0.000011 ≈ **$0.0001/deal** (effectively free) |
| **Monthly @ 1000 deals** | ~$0.10 |
| **Rate limit** | 720 requests/minute |

**Risks:**
- **Cold start:** First request per session ~10s latency. Demo perception risk.
- **Model availability change:** Cloudflare rotates available models occasionally. Code already has a Claude fallback for the photo path.
- **Token scope:** API token may be over-scoped — see SECURITY S-4.3.

**Escape hatches:**
1. Drop back to Claude Sonnet for photo classification (~$0.50/deal — 80× more expensive but works).
2. Self-host LLaVA on a low-end GPU box (~$50/mo flat).

---

## 3. Mindee (document extraction)

| Field | Value |
|---|---|
| **Service** | Custom-trained models: SA ID (`5e8faed1…`), POA (`efa1a868…`), Bank Statement (`b74da9dc…`) |
| **Tier** | Annual subscription (renewed today, 2026-05-25) |
| **Cost** | ~€1500/year for current credit allocation |
| **Per-deal cost** | 5 docs (ID + POA + 3× BS) ≈ €0.50/deal at standard rate |
| **Monthly @ 1000 deals** | ~€500 (within current sub) |
| **Rate limit** | 100 req/min (default) |

**Risks:**
- **Subscription expiry — recurring:** Just happened today. Auto-renewal must be on. **Set calendar reminder.**
- **Model accuracy drift:** SA ID format hasn't changed in 5 years; risk low. Bank statement layouts vary per bank — high risk if a major bank changes their PDF template.
- **Account-level vs project-level limits:** Single account holds all 3 trained models. If billing fails, all 3 die together.
- **API v2 → v3 migration:** Mindee tends to deprecate API versions on ~2-year cycles. We pinned to v2.

**Escape hatches:**
1. Train equivalent models on Cloudflare Workers AI or self-hosted Donut / LayoutLM — ~2 weeks of work + model artefacts.
2. Use Claude Sonnet for document extraction (10× the per-doc cost but works in minutes).
3. AWS Textract as a paid fallback for IDs.

**Action:**
- Add monthly Mindee usage check to `docs/runbooks/monthly-checks.md`
- Document the trained-model IDs in a vendor-independent way so re-training elsewhere is faster

---

## 4. Supabase (Postgres + Auth + Storage + Edge Functions)

| Field | Value |
|---|---|
| **Project** | `sahvfsoclzgsuewbiiah` (vehiclefinance), `eu-west-1` |
| **Tier** | **Verify before next demo** — likely Free, should be Pro before any external commitment |
| **Free tier limits** | 500MB DB, 50MB file storage, 2GB egress, paused after 1 week inactivity |
| **Pro tier** | $25/mo per project, 8GB DB, 100GB storage, no pause |
| **Per-deal storage cost** | 6 PDFs + 9 photos ≈ 3MB → at scale, $0.021 per 1GB egress reads |

**Risks:**
- **Pause on inactivity:** Free tier projects pause after a week. Re-activation takes ~1 minute but breaks any in-progress demo.
- **DB size limit:** 500MB DB free tier = ~50k deals. We're at <100 deals.
- **Egress cost:** Photo previews on dashboard repeatedly fetch from storage. Add lazy-loading + thumbnails.
- **Edge function cold start:** ~500ms first call after idle. Fine for users, demo-perception risk.

**Escape hatches:**
1. Upgrade to Pro — $25/mo, no behaviour change.
2. Self-host Postgres + Storage on Hetzner / Vultr — ~$30/mo + ops effort.

**Action:** **Confirm tier before any external demo.** If Free, upgrade today.

---

## 5. Dialog360 (WhatsApp Business API)

| Field | Value |
|---|---|
| **Number** | +27 69 699 2346 |
| **Tier** | Per-conversation pricing |
| **Cost** | ~$0.012 per service conversation, ~$0.06 per marketing conversation |
| **Per-deal cost** | ~5 service convos = $0.06/deal |
| **Monthly @ 1000 deals** | ~$60 |

**Risks:**
- **Account suspension by Meta:** If buyers report spam, the entire WhatsApp Business account dies. Critical and Meta is unilateral.
- **Number port-out delay:** If we lose the number, getting a new approved one + template takes 7-14 days.
- **Template rejection:** Meta rejects template changes ~10% of the time. Any wording change needs re-approval.
- **Rate limit (tier 1):** 1000 unique users/day. We can request tier 2 (10k/day) after 30 days of stable usage.

**Escape hatches:**
1. Have a backup Dialog360 channel ready (different number, same template approval).
2. Fallback to SMS via BulkSMS for OTP delivery (already integrated in `_shared/notify.ts`).

**Action:** Set up a secondary number BEFORE we scale to 100+ buyers/day.

---

## 6. Azure Static Web Apps

| Field | Value |
|---|---|
| **App name** | vehiclefinance-web |
| **URL** | https://orange-bay-0066a4b03.7.azurestaticapps.net |
| **Tier** | Free (likely) |
| **Cost** | Free tier: 100GB bandwidth/month, 0.5GB build/storage |
| **Per-deal cost** | Negligible (~10KB JS/HTML per page load) |

**Risks:**
- **Region:** West Europe. Latency to SA users ~150ms — acceptable but not great.
- **Custom domain:** When `claimtec.co.za` is wired up, free tier limit on custom domains is 2.
- **No serverless functions:** Azure SWA Functions tier ($9/mo) needed if we want server-side API on this surface.

**Escape hatches:**
- Cloudflare Pages, Vercel — equivalent + cheaper. Migration is ~half a day's work (config + DNS).

---

## 7. SendGrid (transactional email)

| Field | Value |
|---|---|
| **Use** | Magic-link auth emails (via Supabase Auth) + ops notifications |
| **Tier** | Free (100 emails/day) currently |
| **Per-deal cost** | ~1 email at sign-up + ad hoc notifications |

**Risks:**
- **Free tier limit:** 100 emails/day. With 10+ operators and notification fan-out, easy to hit.
- **Sender reputation:** New domain = poor deliverability. Need SPF/DKIM/DMARC on `claimtec.co.za`.

**Escape hatches:**
- Postmark, Resend — comparable pricing, better deliverability.

---

## 8. BulkSMS (SMS fallback)

| Field | Value |
|---|---|
| **Use** | SMS sent via `_shared/notify.ts` when WhatsApp can't reach |
| **Tier** | Pay-per-message |
| **Cost** | ~R0.18 per SA SMS |

**Risks:** Account top-up balance. If empty, SMS fallback silently fails.
**Action:** Add a balance check to the monthly checks runbook.

---

## 9. Cumulative monthly cost projection

At **1000 deals/month**:

| Service | Cost |
|---|---|
| Anthropic | $100 |
| Cloudflare Workers AI | $0 (within free tier) |
| Mindee | ~$50 (within annual sub) |
| Supabase (Pro) | $25 |
| Dialog360 | $60 |
| Azure SWA | $0 |
| SendGrid (Essentials tier) | $20 |
| BulkSMS | ~$20 |
| **Total** | **~$275 / mo** |

At **10,000 deals/month**, project to **~$2750 / mo** (linear assumption — likely lower with negotiated rates).

---

## 10. Single points of failure

| Dependency | If it dies… | Recovery time |
|---|---|---|
| **Supabase project** | Entire app offline | <1 day to restore from backup; longer if no backup |
| **Dialog360 channel** | No new buyer/seller intake | 7-14 days for new number |
| **Anthropic** | OTP PDF extraction breaks | Hours (status.anthropic.com) |
| **Mindee** | ID + POA + BS extraction breaks | Hours (subscription); days (model re-train if account lost) |
| **Cloudflare Workers AI** | Photo classification degrades | Hours (or fall back to Claude permanently) |

---

## Summary

**Lowest-risk way to harden the cost picture:**
1. Move Supabase to Pro tier ($25/mo) — eliminates the worst single point of failure
2. Set Mindee renewal calendar reminder
3. Set up secondary Dialog360 number
4. Monitor Anthropic spend at $200/mo threshold
5. Run monthly cost-check (script in `docs/runbooks/monthly-checks.md` — to be written)

**Total at-risk monthly cost: ~$275 today, scaling roughly linearly with deal volume.**
